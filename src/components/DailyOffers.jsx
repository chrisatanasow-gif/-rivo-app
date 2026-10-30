import React, { useEffect, useState } from "react";
import { Bell, Gift, Check } from "lucide-react";
import { Button, Card } from "./UI";
import { notificationConfig, notificationStatus, pushSupport, removePushSubscription, savePushSubscription, sendTestNotification, subscribeBrowser } from "../services/notificationService.js";
import "./DailyOffers.css";

export function OfferBanner({ onOpen, onDismiss }) {
  return <div className="offerBanner"><button onClick={onOpen}><Gift size={22} aria-hidden="true"/><span><b>Твоите −10% днес</b><small>До 2 € за един демо курс · виж офертата</small></span></button><button className="offerDismiss" aria-label="Скрий днешната оферта" onClick={onDismiss}>×</button></div>;
}

export function AppliedOffer({ fare, onRemove }) {
  if (!fare?.discountCents) return null;
  return <div className="appliedOffer" role="status"><Gift size={20} aria-hidden="true"/><span><b>Дневната отстъпка е приложена</b><small>10% до 2 € · един демо курс днес</small></span>{onRemove && <button onClick={onRemove}>Премахни</button>}</div>;
}

export default function DailyOffers({ offers, used, onApply, onRemove }) {
  const { offer, settings, update, storageError } = offers;
  const [config, setConfig] = useState(null);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [permission, setPermission] = useState(() => "Notification" in window ? Notification.permission : "default");
  const support = pushSupport();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    notificationConfig().then(async value => {
      if (!alive) return;
      setConfig(value);
      if (value.available && settings.pushToken) {
        const status = await notificationStatus(settings.pushToken);
        if (alive) setActive(status.active);
      }
    }).catch(err => { if (alive) setError(err.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [configAttempt, settings.pushToken]);

  const enable = async () => {
    setBusy(true); setError(""); setMessage("");
    let subscription;
    try {
      // Request only in this click handler, never during mount or address entry.
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") { setMessage(granted === "denied" ? "Известията са блокирани. Разреши ги от настройките на телефона, ако промениш решението си." : "Не включихме известията. Можеш да опиташ по-късно."); return; }
      const token = settings.pushToken || (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
      if (!update({ pushToken: token })) throw new Error("Телефонът не позволява да запазим настройката. Разреши съхранението и опитай отново.");
      subscription = await subscribeBrowser(config.publicKey);
      await savePushSubscription(subscription.toJSON(), token);
      setActive(true);
      setMessage(config.scheduled ? "Известията за дневни оферти са включени." : "Тестовият абонамент е включен. Можеш да изпратиш тестово известие.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      await removePushSubscription(settings.pushToken);
      setActive(false);
      // Remove from the sender first; a browser unsubscribe failure cannot keep marketing active.
      const registration = await navigator.serviceWorker.getRegistration();
      await (await registration?.pushManager.getSubscription())?.unsubscribe().catch(() => {});
      setMessage("Известията за оферти са изключени.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setError(""); setMessage("");
    try { await sendTestNotification(settings.pushToken); setMessage("Тестовото известие е изпратено. Провери известията на телефона."); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const linkId = new URLSearchParams(window.location.search).get("offer");
  return <>
    <div><span className="eyebrow">МАЛЪК ЖЕСТ ОТ RIVO</span><h1>Нещо добро за днес.</h1><p className="muted">Нова дневна оферта в приложението.</p></div>
    {linkId && linkId !== offer.id && <p className="offerNotice" role="status">Отворената оферта е изтекла. Ето днешната.</p>}
    <Card className={`dailyOfferCard ${used ? "used" : ""}`}>
      <div className="offerCardTop"><Gift size={26} aria-hidden="true"/><span>ДНЕВНА ТЕСТОВА ОФЕРТА</span></div>
      <strong className="offerPercent">−10%</strong><h2>{used ? "Днешната оферта е използвана" : "По-приятно пътуване днес"}</h2>
      <p>10% отстъпка до 2 € за един завършен демо курс. Важи до 23:59 ч. днес, българско време.</p>
      <small>Примерни условия за теста. Отстъпката се вижда преди потвърждение. Бакшишът се добавя отделно.</small>
      {used ? <div className="offerUsed"><Check size={18} aria-hidden="true"/> Нова оферта утре</div> : settings.selectedId === offer.id ? <><div className="offerUsed"><Check size={18} aria-hidden="true"/> Избрана за следващия курс</div><Button secondary onClick={onRemove}>Премахни избора</Button></> : <Button onClick={onApply}>ИЗПОЛЗВАЙ ОФЕРТАТА</Button>}
    </Card>
    <Card className="offerSettings">
      <div><Bell size={22} aria-hidden="true"/><h2>Ти избираш известията</h2></div>
      <label className="offerToggle"><span><b>Оферта в RIVO</b><small>Показвай дневната оферта на началния екран.</small></span><input type="checkbox" checked={settings.inApp} onChange={event => update({ inApp: event.target.checked })}/></label>
      <section className="pushSettings"><h3>Известия на телефона</h3><p>Получавай офертата и когато RIVO е затворено. До едно известие с оферта на ден. Можеш да го изключиш по всяко време.</p>
        {loading ? <p role="status">Проверяваме настройките…</p> : <>
          {config && !config.scheduled && <p className="offerNotice">В тестовата версия можеш да включиш абонамент и да получиш тестово известие. Ежедневното изпращане ще започне при публичния старт.</p>}
          {support === "install" && <p className="offerNotice">На iPhone: отвори RIVO в Safari → „Сподели“ → „Добави към началния екран“. После отвори RIVO от иконата, за да включиш известията.</p>}
          {support === "unsupported" && <p className="offerNotice">Този браузър не поддържа известия на телефона. Дневната оферта остава достъпна в RIVO.</p>}
          {permission === "denied" && <p className="offerNotice">Известията са блокирани от настройките на устройството. Разреши ги там и отвори тази страница отново.</p>}
          {config && !config.available && <p className="offerNotice">Известията на телефона още се подготвят. Дневната оферта работи в RIVO.</p>}
          {active ? <><p className="pushActive"><Check size={16} aria-hidden="true"/> Абонаментът е включен на това устройство</p><Button secondary disabled={busy} onClick={test}>Изпрати тестово известие</Button><button className="quietAction" disabled={busy} onClick={disable}>Изключи известията за оферти</button></> : support === "supported" && config?.available && permission !== "denied" && <Button secondary disabled={busy} onClick={enable}>{busy ? "ВКЛЮЧВАМЕ…" : "Включи известията на телефона"}</Button>}
        </>}
        {message && <p className="offerNotice" role="status">{message}</p>}
        {error && <div className="offerError" role="alert"><p>{error}</p><button disabled={busy} onClick={() => setConfigAttempt(value => value + 1)}>Провери отново</button></div>}
      </section>
      {storageError && <p className="offerError" role="alert">Настройката важи само за тази сесия — не успяхме да я запазим на телефона.</p>}
    </Card>
  </>;
}
