import { useEffect, useRef, useState } from "react";
import { isValidLocation } from "../../shared/locations.js";
import { reverseGeocode, searchAddresses } from "./geocodingService.js";
import { localPlaceSuggestions, mergePlaceSuggestions, remotePlaceSuggestions, MIN_SUGGESTION_LENGTH } from "./placeSuggestions.js";

export default function useBookingPlaces() {
  const [pickup, setPickup] = useState({ label: "Перник, Център", lat: 42.6052, lng: 23.0379 });
  const [destination, setDestination] = useState({ label: "", lat: null, lng: null });
  const [active, setActive] = useState("destination");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [option, setOption] = useState(-1);
  const [resolving, setResolving] = useState(false);
  const pending = useRef({ version: 0 });

  function invalidate() {
    const current = pending.current;
    current.version++;
    clearTimeout(current.timer);
    current.controller?.abort();
    setResults([]); setStatus("idle"); setOption(-1); setResolving(false);
    return current.version;
  }
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
      if (version === pending.current.version && place) (field === "pickup" ? setPickup : setDestination)(place);
    } catch { /* The selected coordinates remain usable when address lookup fails. */ }
    finally { if (version === pending.current.version) setResolving(false); }
  }
  function keyDown(event, field) {
    if (event.key === "Escape") { invalidate(); return; }
    if (!results.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOption(value => (value + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    } else if (event.key === "Enter" && option >= 0) { event.preventDefault(); choose(field, results[option]); }
  }
  return { pickup, destination, active, results, status, option, resolving, choose, edit, focus, search, mapSelect, keyDown };
}
