import { useEffect, useState } from "react";
import { pilotRequest } from "./pilotService.js";

export function useFareQuote(pickup, destination, enabled = true) {
  const key = JSON.stringify({ pickup, destination });
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let expiry;
    setResult({ key, attempt, loading: true });
    const timer = window.setTimeout(async () => {
      try {
        const { quote } = await pilotRequest("quote", JSON.parse(key), { signal: controller.signal });
        if (controller.signal.aborted) return;
        setResult({ key, attempt, quote });
        expiry = window.setTimeout(() => setResult({ key, attempt, error: "Цената изтече. Изчисли я отново." }), Math.max(0, Date.parse(quote.expiresAt) - Date.now()));
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, attempt, error: error.message });
      }
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); window.clearTimeout(expiry); };
  }, [key, attempt, enabled]);
  const current = result?.key === key && result?.attempt === attempt
    && (!result.quote || Date.parse(result.quote.expiresAt) > Date.now()) ? result : { loading: true };
  return { ...current, key, retry: () => setAttempt(value => value + 1) };
}
