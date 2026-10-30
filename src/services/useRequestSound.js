import { useEffect, useRef, useState } from "react";

export default function useRequestSound(requests, online) {
  const [enabled, setEnabled] = useState(false), [error, setError] = useState("");
  const context = useRef(null), seen = useRef(new Set());
  function play() {
    const audio = context.current;
    if (!audio || audio.state !== "running") { setEnabled(false); setError("Натисни „Включи звук“ отново след връщане в RIVO."); return; }
    for (const delay of [0,0.22]) {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.frequency.value = 740; gain.gain.value = 0;
      oscillator.connect(gain); gain.connect(audio.destination);
      const start = audio.currentTime + delay;
      gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(0.12,start+0.02); gain.gain.exponentialRampToValueAtTime(0.001,start+0.17);
      oscillator.start(start); oscillator.stop(start+0.18);
    }
  }
  useEffect(() => {
    const fresh = requests.some(row => !seen.current.has(row.id));
    for (const row of requests) seen.current.add(row.id);
    if (seen.current.size > 200) seen.current = new Set(requests.map(row => row.id));
    if (fresh && enabled && online && document.visibilityState !== "hidden") play();
  }, [requests, enabled, online]);
  useEffect(() => () => { context.current?.close().catch(() => {}); context.current = null; }, []);
  async function toggle() {
    setError("");
    if (enabled) { setEnabled(false); return; }
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error();
      context.current ||= new Audio(); await context.current.resume();
      setEnabled(true); play();
    } catch { setError("Звукът не е достъпен в този браузър. Заявките остават видими на екрана."); }
  }
  return { enabled, toggle, error };
}
