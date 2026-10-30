import React, { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { browserSubscription, pushSupport, rideAlertsRequest, subscribeBrowser } from "../services/rideAlertsService.js";
import "./RideAlerts.css";

export default function RideAlerts() {
  const [support] = useState(pushSupport);
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const mounted = useRef(true), lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (support !== "supported") return () => { mounted.current = false; };
    setError("");
    const controller = new AbortController();
    browserSubscription().then(sub => rideAlertsRequest("notification-config", undefined, { endpoint: sub?.endpoint, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) }))
      .then(value => { if (!controller.signal.aborted) setConfig(value); })
      .catch(() => { if (!controller.signal.aborted) setError("Не успяхме да проверим известията. Опитай отново, когато имаш връзка."); });
    return () => { mounted.current = false; controller.abort(); };
  }, [support, retry]);
  async function toggle() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (config.active) {
        const sub = await browserSubscription();
        if (sub) await rideAlertsRequest("notification-subscription", { command: "unsubscribe", endpoint: sub.endpoint });
        if (mounted.current) setConfig(value => ({ ...value, active: false }));
      } else {
        // Permission must be requested synchronously from the user's tap (especially on iOS).
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Известията не са разрешени. Можеш да ги включиш от настройките на телефона за RIVO.");
        const sub = await subscribeBrowser(config.publicKey);
        await rideAlertsRequest("notification-subscription", { command: "subscribe", subscription: sub.toJSON() });
        if (mounted.current) setConfig(value => ({ ...value, active: true }));
      }
    } catch (problem) { if (mounted.current) setError(problem instanceof DOMException ? "Телефонът не успя да включи известията. Провери разрешението за RIVO и опитай отново." : problem.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const permitted = support === "supported" && Notification.permission === "granted";
  return <details className="rideAlerts">
    <summary><Bell size={16}/><span>Известия за курс<small>{config?.active && permitted ? "Включени на това устройство" : "Настройки за това устройство"}</small></span></summary>
    <p>Нова заявка и промени по курса в този режим. Отделни са от известията за отстъпки.</p>
    {support === "install" ? <p>На iPhone отвори RIVO в Safari → Сподели → Добави на начален екран. После отвори иконата и включи известията тук.</p>
      : support === "unsupported" ? <p>Този браузър не поддържа известия. Дръж RIVO отворено, за да виждаш промените.</p>
      : config && !config.available ? <p>Известията още се настройват. Статусът в приложението се обновява автоматично.</p>
      : <button type="button" disabled={busy || !config} onClick={toggle}>{busy ? "ЗАПАЗВАНЕ…" : config?.active ? "ИЗКЛЮЧИ ИЗВЕСТИЯТА ЗА КУРС" : "ВКЛЮЧИ ИЗВЕСТИЯТА ЗА КУРС"}</button>}
    {config?.active && !permitted && support === "supported" && <p>Разрешението в браузъра е изключено. Провери настройките на сайта.</p>}
    {error && <p role="alert">{error}</p>}
    {error && !config && <button type="button" onClick={() => setRetry(value => value + 1)}>ПРОВЕРИ ОТНОВО</button>}
  </details>;
}
