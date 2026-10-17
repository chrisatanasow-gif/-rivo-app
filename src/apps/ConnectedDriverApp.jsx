import React, { useEffect, useState } from "react";
import { CarFront, ChevronRight, History, LogOut, MapPin, Navigation2, RefreshCw, Users } from "lucide-react";
import { Button, Card, Pill } from "../components/UI.jsx";
import { DriverScreen } from "./DriverApp.jsx";
import { CancelRideDialog } from "./CustomerApp.jsx";
import RivoMap from "../components/RivoMap.jsx";
import DriverTracking from "../components/DriverTracking.jsx";
import FareBreakdown from "../components/FareBreakdown.jsx";
import useLiveDriverLocation from "../services/useLiveDriverLocation.js";
import { getRouteGeometry } from "../services/routingService.js";
import { routeKey } from "../../shared/locations.js";
import { formatMoney } from "../../shared/fare.js";
import "./ConnectedDriverApp.css";

const TERMINAL = ["completed", "cancelled", "expired"];
const STATUS = { completed: "Курсът е завършен", cancelled: "Курсът е отказан", expired: "Заявката е изтекла", accepted: "Към клиента", arrived: "Пристигна при клиента", in_progress: "Пътуването започна" };

function RideSummary({ ride }) {
  return <Card className="connectedDriverSummary">
    <div className="connectedDriverPrice"><span><small>ПРЕДВАРИТЕЛНА ОЦЕНКА</small><b>RIVO</b></span><strong data-testid="driver-fare-total">{formatMoney(ride.priceCents)}</strong></div>
    <div className="summaryLine"><MapPin size={18}/><span><small>ВЗИМАНЕ</small><b>{ride.pickup.label}</b></span></div>
    <div className="summaryLine"><Navigation2 size={18}/><span><small>ДЕСТИНАЦИЯ</small><b>{ride.destination.label}</b></span></div>
    <div className="summaryMeta"><span><Users size={12}/> {ride.passengers} {ride.passengers === 1 ? "пътник" : "пътници"}</span><span data-testid="driver-ride-number">№ {ride.id.slice(0, 8).toUpperCase()}</span></div>
  </Card>;
}

function WaitingTime({ since }) {
  const [time, setTime] = useState(Date.now);
  useEffect(() => {
    const update = () => setTime(Date.now());
    update(); const timer = setInterval(update, 1000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, [since]);
  const seconds = Math.max(0, Math.floor((time - Date.parse(since)) / 1000));
  return <div className="driverWaitingStatus"><span className="eyebrow">ИЗЧАКВАНЕ</span><div className="waitTime" role="timer" aria-label="Време на изчакване">{Number.isFinite(seconds) ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : "—"}</div><p className="muted">Клиентът може да види пристигането ти в RIVO.</p><small>Време от отбелязаното пристигане · без таксуване в теста</small></div>;
}

export default function ConnectedDriverApp({ state, busy, error, syncError, onRefresh, onTransition, onLogout }) {
  const [selectedId, setSelectedId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem("rivoDriverDismissedRideV1"); } catch { return null; } });
  const [storageError, setStorageError] = useState(false);
  const latest = state.rides[0];
  const ride = state.activeRide || (latest && TERMINAL.includes(latest.status) && latest.id !== dismissed ? latest : null);
  const selected = state.requests.find(item => item.id === selectedId);
  const displayed = ride || selected;
  const terminal = Boolean(ride && TERMINAL.includes(ride.status));
  const live = useLiveDriverLocation(ride);
  const [route, setRoute] = useState(null);
  const mapKey = routeKey(displayed?.pickup, displayed?.destination);
  useEffect(() => {
    if (!mapKey) return undefined;
    let active = true;
    getRouteGeometry(displayed.pickup, displayed.destination).then(value => { if (active) setRoute(value); });
    return () => { active = false; };
  }, [mapKey]);
  useEffect(() => { setConfirmation(null); }, [ride?.id, ride?.status]);
  useEffect(() => { document.querySelector(".connectedDriver .driverContent")?.scrollTo(0, 0); }, [selectedId, historyOpen, ride?.id, ride?.status]);

  const notices = <>
    <div className={`pilotSync ${syncError ? "offline" : ""}`} role="status"><span>{syncError || "Свързано · заявките се обновяват"}</span><button aria-label="Обнови заявките" disabled={busy && !syncError} onClick={onRefresh}><RefreshCw size={15}/></button></div>
    {error && <div className="pilotError" role="alert">{error}</div>}
    {storageError && <p className="pilotError" role="status">Не успяхме да запазим затварянето на курса. След презареждане може да се покаже отново.</p>}
  </>;
  const note = <p className="driverActionNote">Затворен тест · без плащания</p>;
  const customer = displayed && <Card className="customerRow"><div className="avatar" aria-hidden="true">{displayed.customerName[0]?.toLocaleUpperCase("bg")}</div><span><small>ПЪТНИК</small><b>{displayed.customerName}</b></span></Card>;
  const map = displayed && <div className="connectedDriverMap"><span className="eyebrow">МАРШРУТ НА ЗАЯВКАТА</span><RivoMap pickup={displayed.pickup} destination={displayed.destination} route={route?.key === mapKey && !route.isFallback ? route : null} driverLocation={live.location}/>{route?.key === mapKey && route.isFallback && <p className="connectedDriverNote">Линията на маршрута временно не е налична. Адресите са запазени.</p>}{live.location && <p className={`connectedDriverNote ${live.status === "stale" ? "gpsOld" : "gpsCurrent"}`}>{live.label}</p>}</div>;
  function dismiss() {
    setDismissed(ride.id); setSelectedId(null); setHistoryOpen(false);
    try { localStorage.setItem("rivoDriverDismissedRideV1", ride.id); setStorageError(false); } catch { setStorageError(true); }
  }
  const history = state.rides.filter(item => TERMINAL.includes(item.status));

  if (terminal) return <DriverScreen title="RIVO DRIVER" right={<Pill>{ride.status === "completed" ? "ЗАВЪРШЕН" : "ОТКАЗАН"}</Pill>} className="connectedDriver driverComplete" actions={<><Button disabled={busy} onClick={dismiss}>КЪМ ЗАЯВКИТЕ</Button>{note}</>}>
    {notices}<div className="driverResultMark" aria-hidden="true">{ride.status === "completed" ? "✓" : "—"}</div><div className="driverIntro"><h1>{STATUS[ride.status]}</h1><p className="muted">{ride.status === "completed" ? "Тестовият курс приключи. Не е обработено плащане." : "Клиентът може да заяви нов курс."}</p></div>
    <RideSummary ride={ride}/>{customer}<FareBreakdown fare={ride.fare}/>
  </DriverScreen>;

  if (ride) {
    const next = { accepted: ["arrive", "ПРИСТИГНАХ ПРИ КЛИЕНТА"], arrived: ["start", "СТАРТИРАЙ КУРСА"], in_progress: ["complete", "ЗАВЪРШИ КУРСА"] }[ride.status];
    const target = ride.status === "in_progress" ? ride.destination : ride.pickup;
    const navigationUrl = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`;
    return <DriverScreen title={ride.status === "arrived" ? "ВЗИМАНЕ" : ride.status === "in_progress" ? "АКТИВЕН КУРС" : "КЪМ КЛИЕНТА"} right={<Pill live>{ride.status === "arrived" ? "ПРИСТИГНАЛ" : ride.status === "in_progress" ? "В КУРС" : "ПРИЕТ"}</Pill>} className={`connectedDriver ${ride.status === "arrived" ? "driverWaiting" : "driverNavigation"}`} actions={<>
      <Button disabled={busy} onClick={() => next[0] === "complete" ? setConfirmation("complete") : onTransition(ride.id, next[0])}>{next[1]}</Button>
      {ride.status !== "in_progress" && <button className="driverExit driverCancel" disabled={busy} onClick={() => setConfirmation("cancel")}>ОТКАЖИ КУРСА</button>}{note}
    </>} overlay={confirmation && <CancelRideDialog busy={busy} positive={confirmation === "complete"} title={confirmation === "complete" ? "Приключваме курса?" : "Отказваш курса?"} description={confirmation === "complete" ? "Потвърди, че пътникът е на дестинацията. Клиентът ще види завършен курс." : "Клиентът ще види отказа и ще трябва да заяви нов курс."} keepLabel={confirmation === "complete" ? "Още пътуваме" : "Запази курса"} confirmLabel={confirmation === "complete" ? "Завърши курса" : "Откажи курса"} onKeep={() => setConfirmation(null)} onCancel={() => { const command = confirmation; setConfirmation(null); onTransition(ride.id, command); }}/>}>
      {notices}<div aria-live="polite"><span className="eyebrow">ТВОЯТ КУРС</span><h1>{STATUS[ride.status]}</h1></div>
      {ride.status === "arrived" && <WaitingTime since={ride.updatedAt}/>}
      <Card className="driverTarget"><MapPin size={21}/><span><small>{ride.status === "in_progress" ? "ОСТАВЯНЕ" : "ВЗИМАНЕ"}</small><b>{target.label}</b></span></Card>
      {map}{customer}
      <a className="driverLiveLink driverNavigationLink" href={navigationUrl} target="_blank" rel="noreferrer"><Navigation2 size={17}/> Отвори навигация</a>
      <p className="connectedDriverNote">При отваряне на друга карта GPS споделянето в RIVO може да се прекъсне.</p>
      <DriverTracking key={ride.id} ride={ride}/><RideSummary ride={ride}/>
    </DriverScreen>;
  }

  if (selectedId) return <DriverScreen title="НОВА ЗАЯВКА" right={<Pill>RIVO</Pill>} onBack={!busy ? () => setSelectedId(null) : undefined} className="connectedDriver driverRequest" actions={<><Button disabled={busy || !selected} onClick={() => onTransition(selected.id, "accept")}>ПРИЕМИ ЗАЯВКАТА</Button><button className="driverExit" disabled={busy} onClick={() => setSelectedId(null)}>КЪМ СПИСЪКА</button>{note}</>}>
    {notices}{selected ? <><h1>Прегледай заявката</h1><RideSummary ride={selected}/>{customer}{map}<FareBreakdown fare={selected.fare}/></> : <><h1>Заявката вече не е налична</h1><p className="muted">Друг шофьор може да я е приел или клиентът да я е отказал. Върни се към списъка.</p></>}
  </DriverScreen>;

  if (historyOpen) return <DriverScreen title="МОИТЕ КУРСОВЕ" onBack={() => setHistoryOpen(false)} className="connectedDriver" actions={<><Button onClick={() => setHistoryOpen(false)}>КЪМ ЗАЯВКИТЕ</Button>{note}</>}>
    {notices}<h1>Последни тестови курсове</h1><p className="connectedDriverNote">До 10 заявки от тази сесия. Сумите са тестови оценки, без изплатени приходи.</p>
    {history.length === 0 && <Card className="connectedDriverEmpty"><History size={28}/><p>Още няма приключили курсове.</p></Card>}
    {history.map(item => <Card className="connectedDriverHistory" key={item.id}><b>{STATUS[item.status]}</b><span>{item.pickup.label} → {item.destination.label}</span><strong>{formatMoney(item.priceCents)}</strong><small>№ {item.id.slice(0, 8).toUpperCase()}</small></Card>)}
  </DriverScreen>;

  return <DriverScreen title="RIVO DRIVER" right={<Pill>ТЕСТ</Pill>} className="connectedDriver driverHome" actions={<><Button disabled={busy} onClick={onRefresh}>ОБНОВИ ЗАЯВКИТЕ</Button>{note}</>}>
    {notices}<div className="driverIntro"><h1>Здравей, {state.participant.name}</h1><p className="muted">Приемай общи заявки от пътниците в теста.</p></div>
    <Card className="connectedDriverVehicle"><CarFront size={28}/><span><b>{state.participant.vehicleModel}</b><small>{state.participant.vehiclePlate}</small></span><button aria-label="Изход" className="iconBtn" disabled={busy} onClick={onLogout}><LogOut size={18}/></button></Card>
    <div className="spaceBetween"><span className="eyebrow">НОВИ ЗАЯВКИ · {state.requests.length}</span><button className="driverHistoryButton" onClick={() => setHistoryOpen(true)}><History size={16}/> История</button></div>
    {state.requests.length === 0 && <Card className="connectedDriverEmpty"><CarFront size={32}/><h2>Изчакваме пътник</h2><p>Новите заявки ще се появят тук автоматично.</p></Card>}
    {state.requests.map(item => <button className="card connectedDriverRequest" key={item.id} aria-label={`Прегледай заявката на ${item.customerName}`} disabled={busy} onClick={() => setSelectedId(item.id)}><span><small>{item.customerName}</small><b>{item.pickup.label}</b><small>към {item.destination.label}</small></span><strong>{formatMoney(item.priceCents)}</strong><ChevronRight size={19}/></button>)}
    <p className="connectedDriverNote">Приемането се потвърждава от сървъра. Вече приета заявка не може да се вземе от втори шофьор.</p>
    <a className="pilotBack" href="/">Към демо дизайна</a>
  </DriverScreen>;
}
