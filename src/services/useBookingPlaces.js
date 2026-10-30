import { useCallback, useEffect, useRef, useState } from "react";
import { isValidLocation } from "../../shared/locations.js";
import { reverseGeocode, searchAddresses } from "./geocodingService.js";
import { localPlaceSuggestions, mergePlaceSuggestions, remotePlaceSuggestions, MIN_SUGGESTION_LENGTH } from "./placeSuggestions.js";
import { requestPickupLocation } from "./pickupLocation.js";

export default function useBookingPlaces({ requirePickup = false, initialRoute } = {}) {
  const [pickup, setPickup] = useState(() => isValidLocation(initialRoute?.pickup) ? initialRoute.pickup : requirePickup ? { label: "", lat: null, lng: null } : { label: "Перник, Център", lat: 42.6052, lng: 23.0379 });
  const [destination, setDestination] = useState(() => isValidLocation(initialRoute?.destination) ? initialRoute.destination : { label: "", lat: null, lng: null });
  const [active, setActive] = useState(requirePickup ? "pickup" : "destination");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [option, setOption] = useState(-1);
  const [resolving, setResolving] = useState(false);
  const [gps, setGps] = useState({ status: "idle", message: "" });
  const pending = useRef({ version: 0 });

  const invalidate = useCallback(() => {
    const current = pending.current;
    current.version++;
    clearTimeout(current.timer);
    current.controller?.abort();
    setResults([]); setStatus("idle"); setOption(-1); setResolving(false); setGps({ status: "idle", message: "" });
    return current.version;
  }, []);
  useEffect(() => () => {
    pending.current.version++;
    clearTimeout(pending.current.timer);
    pending.current.controller?.abort();
  }, []);

  function suggest(label) {
    const version = invalidate();
    if (label.trim().length < MIN_SUGGESTION_LENGTH) { setStatus(label.trim() ? "short" : "idle"); return; }
    const local = localPlaceSuggestions(label);
    setResults(local);
    const controller = new AbortController();
    pending.current.controller = controller;
    pending.current.timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const remote = await remotePlaceSuggestions(label, pickup, controller.signal);
        if (version !== pending.current.version) return;
        const found = mergePlaceSuggestions(local, remote);
        setResults(found); setStatus(found.length ? "success" : "empty");
      } catch {
        if (version === pending.current.version && !controller.signal.aborted) setStatus(local.length ? "partial" : "error");
      }
    }, 400);
  }
  function choose(field, place) {
    invalidate();
    (field === "pickup" ? setPickup : setDestination)(place);
    setActive(field);
  }
  function edit(field, label) {
    setActive(field);
    (field === "pickup" ? setPickup : setDestination)({ label, lat: null, lng: null });
    suggest(label);
  }
  function focus(field) {
    if (field === active) return;
    invalidate(); setActive(field);
    const place = field === "pickup" ? pickup : destination;
    if (!isValidLocation(place)) suggest(place.label);
  }
  function restore(route) {
    invalidate();
    setPickup(route.pickup);
    setDestination(route.destination);
    setActive("destination");
  }
  async function search(event, field) {
    event.preventDefault();
    const label = (field === "pickup" ? pickup : destination).label;
    const version = invalidate();
    setActive(field); setStatus("loading");
    try {
      const found = mergePlaceSuggestions(localPlaceSuggestions(label), await searchAddresses(label, pickup));
      if (version === pending.current.version) { setResults(found); setStatus(found.length ? "success" : "empty"); }
    } catch { if (version === pending.current.version) setStatus("error"); }
  }
  async function mapSelect(point) {
    const field = active;
    const version = invalidate();
    (field === "pickup" ? setPickup : setDestination)({ label: "Избрана точка на картата", ...point });
    setResolving(true);
    try {
      const place = await reverseGeocode(point);
      if (version === pending.current.version && place) (field === "pickup" ? setPickup : setDestination)({ ...place, ...point });
    } catch { /* The selected coordinates remain usable when address lookup fails. */ }
    finally { if (version === pending.current.version) setResolving(false); }
  }
  async function locatePickup() {
    const version = invalidate();
    setResolving(true); setGps({ status: "loading", message: "Намираме мястото ти…" });
    const result = await requestPickupLocation();
    if (version !== pending.current.version) return;
    if (result.status !== "ready") {
      const messages = {
        denied: "Достъпът до местоположение е отказан. Избери адрес или точка на картата.",
        timeout: "Местоположението не се откри навреме. Опитай пак или избери адрес.",
        inaccurate: "GPS мястото е твърде неточно. Избери точната точка на картата или въведи адрес.",
        unavailable: "Местоположението не е достъпно. Избери адрес или точка на картата."
      };
      setGps({ status: "error", message: messages[result.status] }); setResolving(false);
      return;
    }
    const point = result.location;
    setPickup(point); setActive("pickup");
    setGps({ status: "loading", message: "Разпознаваме адреса. Точката е избрана по GPS." });
    try {
      const place = await reverseGeocode(point);
      if (version !== pending.current.version) return;
      // A street lookup labels the measured point; it must not move the pickup.
      if (place) setPickup({ ...place, lat: point.lat, lng: point.lng });
    } catch { /* Measured coordinates remain usable without a street label. */ }
    finally {
      if (version === pending.current.version) {
        setResolving(false);
        setGps({ status: "ready", message: `Мястото е избрано по GPS · точност около ${Math.max(1, Math.round(result.accuracy))} м. Провери точката на картата.` });
      }
    }
  }
  function keyDown(event, field) {
    if (event.key === "Escape") { invalidate(); return; }
    if (!results.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOption(value => (value + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    } else if (event.key === "Enter" && option >= 0) { event.preventDefault(); choose(field, results[option]); }
  }
  return { pickup, destination, active, results, status, option, resolving, gps, locatePickup, cancelLookup: invalidate, choose, edit, focus, restore, search, mapSelect, keyDown };
}
