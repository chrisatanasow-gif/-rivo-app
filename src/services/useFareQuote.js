import { useEffect, useState } from "react";
import { pilotRequest } from "./pilotService.js";

export function useFareQuote(pickup, destination, enabled = true) {
  const key = JSON.stringify({ pickup, destination });
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const requestKey = `${key}:${attempt}`;
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let expiry;
    setResult({ requestKey, loading: true });
    const timer = window.setTimeout(async () => {
      try {
        const { quote } = await pilotRequest("quote", JSON.parse(key), { signal: controller.signal });
        if (controller.signal.aborted) return;
        setResult({ requestKey, quote });
        expiry = window.setTimeout(() => setResult({ requestKey, error: "Цената изтече. Изчисли я отново." }), Math.max(0, Date.parse(quote.expiresAt) - Date.now()));
      } catch (error) {
        if (!controller.signal.aborted) setResult({ requestKey, error: error.message });
      }
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); window.clearTimeout(expiry); };
  }, [key, requestKey, enabled]);
  const matches = result?.requestKey === requestKey;
  const current = !matches ? { loading: true }
    : result.quote && Date.parse(result.quote.expiresAt) <= Date.now()
      ? { error: "Цената изтече. Изчисли я отново." } : result;
  return { ...current, key: requestKey, retry: () => setAttempt(value => value + 1) };
}
