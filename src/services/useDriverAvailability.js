import { useEffect, useRef, useState } from "react";
import { rideAlertsRequest } from "./rideAlertsService.js";

export default function useDriverAvailability({ state, syncError, onRefresh }) {
  const [current, setCurrent] = useState(state.presence);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [connected, setConnected] = useState(navigator.onLine);
  const mounted = useRef(true), locked = useRef(false), heartbeat = useRef(false);
  const leaseDeadline = useRef(0);
  function apply(presence, serverTime) {
    const ms = Math.max(0, Date.parse(presence?.expiresAt) - Date.parse(serverTime));
    leaseDeadline.current = Date.now() + (presence?.online && Number.isFinite(ms) ? ms : 0);
    setRemaining(Math.max(0, leaseDeadline.current - Date.now()));
    setCurrent(presence);
  }
  useEffect(() => { apply(state.presence, state.serverTime); }, [state.presence, state.serverTime]);
  useEffect(() => {
    mounted.current = true;
    const tick = () => { setConnected(navigator.onLine); setRemaining(Math.max(0, leaseDeadline.current - Date.now())); };
    const timer = setInterval(tick, 1000);
    window.addEventListener("offline", tick); window.addEventListener("online", tick);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener("offline", tick); window.removeEventListener("online", tick); };
  }, []);
  const online = Boolean(current?.online && remaining > 0 && connected && !syncError);
  useEffect(() => {
    if (!current?.online || !state.participant.canAccept) return undefined;
    const controller = new AbortController();
    async function beat() {
      if (heartbeat.current || locked.current || document.visibilityState === "hidden" || !navigator.onLine || Date.now() >= leaseDeadline.current) return;
      heartbeat.current = true;
      try {
        const data = await rideAlertsRequest("presence", { command: "heartbeat", leaseId: current.leaseId }, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
        if (!controller.signal.aborted && !locked.current) { apply(data.presence, data.serverTime); setError(""); }
      } catch { if (!controller.signal.aborted) setError("Работният режим не се обнови. При изгубена връзка RIVO те изключва до една минута."); }
      finally { heartbeat.current = false; }
    }
    const timer = setInterval(beat, 15000);
    document.addEventListener("visibilitychange", beat);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", beat); };
  }, [current?.online, current?.leaseId, state.participant.canAccept]);
  async function toggle() {
    if (locked.current) return;
    locked.current = true; setPending(true); setError("");
    try {
      const data = await rideAlertsRequest("presence", current?.online && remaining > 0
        ? { command: "offline", leaseId: current.leaseId }
        : { command: "online", revision: current?.revision || 0, leaseId: crypto.randomUUID() });
      if (mounted.current) apply(data.presence, data.serverTime);
      await onRefresh();
    } catch (problem) { if (mounted.current) { setError(problem.message); await onRefresh(); } }
    finally { locked.current = false; if (mounted.current) setPending(false); }
  }
  return { online, pending, toggle, error, connected };
}
