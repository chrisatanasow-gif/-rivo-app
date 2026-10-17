import { useEffect, useRef, useState } from "react";
import { pilotRequest } from "./pilotService.js";
import { GPS_PUBLISH_MS, GPS_SAMPLE_MAX_AGE_MS, validDriverPosition } from "../../shared/driver-location.js";

export default function useDriverTracking(rideId) {
  const [phase, setPhase] = useState("off");
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [stopFailed, setStopFailed] = useState(false);
  const current = useRef(null);
  const stopBody = useRef(null);
  const mounted = useRef(true);

  function clearLocal(run) {
    if (!run) return;
    run.alive = false;
    run.controller.abort();
    if (run.watch != null) navigator.geolocation.clearWatch(run.watch);
    clearInterval(run.interval);
    for (const event of ["online", "offline", "focus"]) window.removeEventListener(event, run.resume);
    document.removeEventListener("visibilitychange", run.resume);
    window.removeEventListener("pagehide", run.leave);
  }
  async function removeRemote(body, notify = true) {
    if (!body) return;
    stopBody.current = body;
    if (notify && mounted.current) { setStopping(true); setStopFailed(false); }
    try {
      await pilotRequest("tracking", body);
      if (stopBody.current === body) stopBody.current = null;
      if (notify && mounted.current) { setError(""); setStopFailed(false); }
    } catch (problem) {
      // A finished ride or replacement stream has already revoked this stream.
      if ([401, 409].includes(problem.status)) { if (stopBody.current === body) stopBody.current = null; }
      else if (notify && mounted.current) {
        setStopFailed(true);
        setError("GPS е спрян на този екран, но изчистването при клиента не е потвърдено. Опитай отново.");
      }
    } finally { if (notify && mounted.current) setStopping(false); }
  }
  useEffect(() => {
    mounted.current = true;
    setPhase("off"); setError(""); setStopFailed(false);
    return () => {
      mounted.current = false;
      const run = current.current;
      clearLocal(run); current.current = null;
      if (run) removeRemote({ rideId: run.rideId, command: "stop", trackingId: run.id }, false);
    };
  }, [rideId]);

  async function start() {
    if (!rideId || current.current?.alive || stopping || stopFailed) return;
    setError("");
    if (!navigator.geolocation || !window.isSecureContext) {
      setError("GPS споделянето изисква защитена връзка и поддръжка на местоположение."); return;
    }
    const run = { rideId, id: crypto.randomUUID(), controller: new AbortController(), alive: true, sequence: 0, lastAttempt: 0, sending: false, latest: null };
    current.current = run; setPhase("starting");
    const active = () => run.alive && current.current === run;
    const visible = () => document.visibilityState !== "hidden" && navigator.onLine;
    run.push = async () => {
      if (!active() || !visible() || !run.latest || run.sending || Date.now() - run.lastAttempt < GPS_PUBLISH_MS) return;
      if (Math.abs(Date.now() - run.latest.measuredAt) > GPS_SAMPLE_MAX_AGE_MS) { setPhase("locating"); return; }
      run.sending = true; run.lastAttempt = Date.now();
      try {
        const data = await pilotRequest("position", { rideId, trackingId: run.id, position: { ...run.latest, sequence: ++run.sequence } }, { signal: run.controller.signal });
        if (active() && visible() && run.latest && data.accepted) { setPhase("sharing"); setError(""); }
      } catch (problem) {
        if (!active()) return;
        if ([401, 409].includes(problem.status)) {
          clearLocal(run); setPhase("off");
          setError("GPS споделянето е прекратено или е включено от друг екран. Обнови заявките.");
        } else { setPhase("retrying"); setError("Позицията не е изпратена. Ще опитаме отново при връзка."); }
      } finally { run.sending = false; }
    };
    const onPosition = position => {
      if (!active() || !visible()) return;
      const point = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, measuredAt: position.timestamp };
      if (!validDriverPosition(point)) { run.latest = null; setPhase("locating"); setError("GPS точността е недостатъчна. Изчакваме позиция с точност до 500 м."); return; }
      run.latest = point; run.push();
    };
    const onError = problem => {
      if (!active()) return;
      if (problem.code === 1) {
        clearLocal(run); setPhase("off");
        setError("Достъпът до GPS е отказан. Разреши местоположението от настройките на браузъра и опитай отново.");
        removeRemote({ rideId, command: "stop", trackingId: run.id }, false);
      } else { run.latest = null; setPhase("locating"); setError("Няма GPS сигнал. Позицията при клиента ще бъде означена като остаряла."); }
    };
    run.resume = () => {
      if (!active()) return;
      if (!visible()) {
        if (run.watch != null) { navigator.geolocation.clearWatch(run.watch); run.watch = null; }
        run.latest = null; setPhase("paused"); return;
      }
      if (run.watch == null) {
        setPhase("locating");
        run.watch = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      }
      run.push();
    };
    run.leave = () => {
      clearLocal(run);
      if (mounted.current) setPhase("off");
      // pagehide cannot wait for React or a normal fetch to finish.
      fetch("/api/pilot?action=tracking", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rideId, command: "stop", trackingId: run.id }) }).catch(() => {});
    };
    try {
      await pilotRequest("tracking", { rideId, command: "start", trackingId: run.id }, { signal: run.controller.signal });
      if (!active()) { removeRemote({ rideId, command: "stop", trackingId: run.id }, false); return; }
      for (const event of ["online", "offline", "focus"]) window.addEventListener(event, run.resume);
      document.addEventListener("visibilitychange", run.resume);
      window.addEventListener("pagehide", run.leave);
      run.interval = setInterval(() => { if (active()) run.push(); }, 1000);
      run.resume();
    } catch (problem) {
      if (active()) { clearLocal(run); setPhase("off"); setError(problem.message || "GPS споделянето не се включи. Опитай отново."); }
    }
  }
  async function stop() {
    const run = current.current;
    clearLocal(run); setPhase("off");
    await removeRemote(run ? { rideId: run.rideId, command: "stop", trackingId: run.id } : { rideId, command: "stop" });
  }
  return { phase, error, stopping, stopFailed, enabled: Boolean(current.current?.alive), start, stop, retryStop: () => removeRemote(stopBody.current) };
}
