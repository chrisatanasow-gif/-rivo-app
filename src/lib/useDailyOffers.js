import { useEffect, useRef, useState } from "react";
import { dailyOffer } from "../../shared/daily-offers.js";

const KEY = "rivoDailyOffersV1";
const defaults = { inApp: true, readId: null, dismissedId: null, selectedId: null, pushToken: null };
function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    return { ...defaults, inApp: value?.inApp !== false,
      ...Object.fromEntries(["readId", "dismissedId", "selectedId"].map(key => [key, /^daily-\d{4}-\d{2}-\d{2}$/.test(value?.[key]) ? value[key] : null])),
      pushToken: /^[a-f0-9]{64}$/.test(value?.pushToken) ? value.pushToken : null };
  } catch { return defaults; }
}

export default function useDailyOffers() {
  const [settings, setSettings] = useState(read);
  const ref = useRef(settings);
  const [storageError, setStorageError] = useState(false);
  const [offer, setOffer] = useState(dailyOffer);
  const update = change => {
    const next = { ...ref.current, ...change };
    ref.current = next;
    setSettings(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); setStorageError(false); return true; }
    catch { setStorageError(true); return false; }
  };
  useEffect(() => {
    let timer;
    const refresh = () => {
      const next = dailyOffer();
      setOffer(next);
      clearTimeout(timer);
      timer = setTimeout(refresh, Math.max(1000, new Date(next.expiresAt).getTime() - Date.now() + 100));
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return { settings, offer, update, storageError };
}
