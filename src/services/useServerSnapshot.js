import { useEffect, useState } from "react";

// Advance from the last server clock without relying on the phone's wall clock.
// State polling records when a snapshot arrives; hidden tabs do not make it fresh.
export default function useServerSnapshot(state, enabled) {
  const [tick, setTick] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return undefined;
    const update = () => setTick(Date.now());
    const timer = setInterval(update, 1000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [enabled]);
  const receivedAt = state.receivedAt;
  const age = Math.max(0, Math.max(tick, Date.now()) - receivedAt);
  const server = Date.parse(state.serverTime);
  const valid = Number.isFinite(server) && Number.isFinite(age);
  return { now: valid ? server + age : null, fresh: valid && age < 15000 };
}
