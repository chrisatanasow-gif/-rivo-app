import React, { useEffect, useRef, useState } from "react";
import { History, LocateFixed, LogOut, RefreshCw, Users } from "lucide-react";
import { Button, Card, Pill } from "../components/UI.jsx";
import { AddressField, AddressSuggestions, CancelRideDialog, CustomerScreen, Stepper } from "../components/BookingUI.jsx";
import RivoMap from "../components/RivoMap.jsx";
import FareBreakdown from "../components/FareBreakdown.jsx";
import useBookingPlaces from "../services/useBookingPlaces.js";
import { useFareQuote } from "../services/useFareQuote.js";
import { getRouteGeometry } from "../services/routingService.js";
import useLiveDriverLocation from "../services/useLiveDriverLocation.js";
import { isValidLocation, routeKey } from "../../shared/locations.js";
import { formatMoney } from "../../shared/fare.js";
import RideAlerts from "../components/RideAlerts.jsx";
import "./ConnectedCustomerApp.css";

const TERMINAL = ["completed", "cancelled", "expired"];
const STAGES = {
  waiting: ["ТЪРСИМ ШОФЬОР", "Заявката е изпратена", "Изчакваме шофьор да приеме. Заявката изтича след 10 минути без приемане."],
  accepted: ["ШОФЬОРЪТ ИДВА", "Шофьорът прие", "Шофьорът потвърди заявката ти."],
  arrived: ["ПРИСТИГНАЛ", "Шофьорът пристигна", "Насочи се към автомобила на мястото за взимане."],
  in_progress: ["В ДВИЖЕНИЕ", "Пътуването започна", "Курсът е стартиран от шофьора."],
  completed: ["ЗАВЪРШЕН", "Курсът е завършен", "Тестовото пътуване приключи. Не е обработено плащане."],
  cancelled: ["ОТКАЗАН", "Курсът е отказан", "Можеш да изпратиш нова заявка."],
  expired: ["ИЗТЕКЪЛ", "Няма приел шофьор", "Заявката изтече. Можеш да опиташ отново."]
};

function TripSummary({ ride }) {
  return <Card className="connectedSummary">
    <div className="summaryLine"><span><small>ВЗИМАНЕ</small><b>{ride.pickup.label}</b></span></div>
    <div className="summaryLine"><span><small>ДЕСТИНАЦИЯ</small><b>{ride.destination.label}</b></span></div>
    <div className="summaryMeta"><span>{ride.passengers} {ride.passengers === 1 ? "пътник" : "пътници"}</span><span>Сега</span></div>
  </Card>;
}

function Price({ fare, priceCents }) {
  return <><Card className="priceSummary"><span><small>ПРЕДВАРИТЕЛНА ОЦЕНКА</small><b>RIVO</b></span><strong data-testid="fare-total">{formatMoney(priceCents ?? fare.priceCents)}</strong></Card><FareBreakdown fare={fare}/></>;
}

export default function ConnectedCustomerApp({ state, busy, error, syncError, onRefresh, onCreate, onTransition, onLogout }) {
  const member = Boolean(state.participant.accountId);
  const places = useBookingPlaces({ requirePickup: member });
  const [step, setStep] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("rivoPilotDismissedRide"); } catch { return null; }
  });
  const [storageError, setStorageError] = useState(false);
  const requestKey = useRef(null);
  const latest = state.rides[0];
  const ride = state.activeRide || (latest?.id !== dismissed ? latest : null);
  const terminal = Boolean(ride && TERMINAL.includes(ride.status));
  const canCancel = ride && ["waiting", "accepted", "arrived"].includes(ride.status);
  const valid = isValidLocation(places.pickup) && isValidLocation(places.destination) && !places.resolving;
  const quote = useFareQuote(places.pickup, places.destination, !ride && valid);
  const [passengers, setPassengers] = useState(1);
  const pickup = ride?.pickup || places.pickup;
  const destination = ride?.destination || places.destination;
  const mapKey = routeKey(pickup, destination);
  const [mapRoute, setMapRoute] = useState(null);
  const liveDriver = useLiveDriverLocation(ride);
  const [driverFocus, setDriverFocus] = useState(0);

  useEffect(() => {
    if (!mapKey) return undefined;
    let active = true;
    getRouteGeometry(pickup, destination).then(route => { if (active) setMapRoute(route); });
    return () => { active = false; };
  }, [mapKey]);
  useEffect(() => { setCancelOpen(false); }, [ride?.id, ride?.status]);
  useEffect(() => {
    if (step !== 1 || historyOpen || ride) places.cancelLookup();
  }, [step, historyOpen, ride?.id, places.cancelLookup]);
  useEffect(() => {
    document.querySelector(".connectedCustomer .customerContent")?.scrollTo(0, 0);
  }, [step, historyOpen, ride?.id, ride?.status]);

  function dismiss() {
    setDismissed(ride.id); setStep(1); setHistoryOpen(false); requestKey.current = null;
    try { localStorage.setItem("rivoPilotDismissedRide", ride.id); setStorageError(false); }
    catch { setStorageError(true); }
  }
  function create() {
    if (busy || !valid || !quote.quote) return;
    const key = `${quote.key}:${passengers}`;
    if (requestKey.current?.key !== key) requestKey.current = { key, id: crypto.randomUUID() };
    onCreate({ pickup: places.pickup, destination: places.destination, passengers, quoteToken: quote.quote.token, idempotencyKey: requestKey.current.id });
  }
  const notices = <>
    {member && <RideAlerts/>}
    <div className={`pilotSync ${syncError ? "offline" : ""}`} role="status"><span>{syncError || "Свързано · заявките се обновяват"}</span><button aria-label="Обнови заявките" disabled={busy && !syncError} onClick={onRefresh}><RefreshCw size={15}/></button></div>
    {error && <div className="pilotError" role="alert">{error}</div>}
    {storageError && <p className="profileStorageNotice" role="status">Не успяхме да запазим затварянето на курса. След презареждане може да се покаже отново.</p>}
  </>;
  const map = <><RivoMap pickup={pickup} destination={isValidLocation(destination) ? destination : null} route={mapRoute?.key === mapKey && !mapRoute.isFallback ? mapRoute : null} driverLocation={liveDriver.location} driverFocusSignal={driverFocus} onDestinationSelect={!ride && step === 1 ? places.mapSelect : undefined}/>{ride && <div className={`connectedGps ${liveDriver.status}`}>
    <p data-testid="driver-location-status">{liveDriver.label}</p>
    <span className="gpsAnnouncement" role="status">{liveDriver.status === "fresh" ? "GPS позицията е актуална" : liveDriver.status === "stale" ? "GPS позицията е остаряла" : "Няма актуална GPS позиция"}</span>
    {liveDriver.location && <button onClick={() => setDriverFocus(value => value + 1)}><LocateFixed size={16}/> Покажи шофьора</button>}
    <small>Обновява се, докато шофьорът споделя и RIVO е на екрана. Картата показва и маршрута на курса.</small>
  </div>}</>;
  const quoteContent = <section aria-label="Предварителна цена" aria-live="polite">
    {quote.loading && <p className="muted" role="status">Изчисляваме маршрута и цената…</p>}
    {quote.error && <div className="pilotError" role="alert">{quote.error}<button disabled={busy} onClick={quote.retry}>Изчисли отново</button></div>}
    {quote.quote && <Price fare={quote.quote}/>}
  </section>;

  if (ride) return <CustomerScreen logo right={<Pill>{STAGES[ride.status][0]}</Pill>} className="connectedCustomer customerRide"
    actions={<>{canCancel && <Button secondary disabled={busy} onClick={() => setCancelOpen(true)}>ОТКАЖИ ЗАЯВКАТА</Button>}{terminal && <Button disabled={busy} onClick={dismiss}>НОВА ЗАЯВКА</Button>}<p className="customerActionHint">Затворен тест · без плащания</p></>}
    overlay={cancelOpen && canCancel && <CancelRideDialog waiting={ride.status === "waiting"} arrived={ride.status === "arrived"} busy={busy} onKeep={() => setCancelOpen(false)} onCancel={() => { setCancelOpen(false); onTransition(ride.id, "cancel"); }}/> }>
    {notices}
    <div className="statusHeader" aria-live="polite"><div><span className="eyebrow">ТВОЯТА ЗАЯВКА</span><h1>{STAGES[ride.status][1]}</h1><p className="muted">{STAGES[ride.status][2]}</p></div></div>
    {!terminal && map}
    {ride.driver && <Card className="driverProfile"><span className="driverAvatar" aria-hidden="true">{ride.driver.name[0]}</span><div className="grow"><b>{ride.driver.name}</b><small>{ride.driver.vehicleModel}</small><strong className="yellow">{ride.driver.vehiclePlate}</strong></div></Card>}
    <TripSummary ride={ride}/><Price fare={ride.fare} priceCents={ride.priceCents}/>
    <p className="connectedNote" data-testid="ride-number">Заявка № {ride.id.slice(0, 8).toUpperCase()}</p>
  </CustomerScreen>;

  if (historyOpen) return <CustomerScreen title="Общи заявки" onBack={() => setHistoryOpen(false)} className="connectedCustomer">
    {notices}<h1>Последни заявки</h1><p className="connectedNote">{state.participant.accountId ? "Последните 10 заявки от профила ти. Пазят се и след ново влизане." : "До 10 заявки от тази тестова сесия. Демо курсовете са отделно."}</p>
    {state.rides.length === 0 && <Card className="connectedSummary"><p className="muted">Още няма общи заявки.</p></Card>}
    {state.rides.map(item => <Card key={item.id} className="connectedSummary"><b>{STAGES[item.status][1]}</b><p>{item.pickup.label} → {item.destination.label}</p><strong className="yellow">{formatMoney(item.priceCents)}</strong><small>№ {item.id.slice(0, 8).toUpperCase()}</small></Card>)}
  </CustomerScreen>;

  return <CustomerScreen logo right={<Pill>ТЕСТ</Pill>} onBack={step > 1 && !busy ? () => setStep(value => value - 1) : undefined} className={`connectedCustomer ${step === 1 ? "customerRoute" : ""}`}
    actions={<><p className="customerActionHint">{step === 1 ? "Провери и избери точните адреси за взимане и оставяне." : "Затворен тест · тестова цена · без плащане"}</p><Button disabled={busy || !valid || (step > 1 && !quote.quote)} onClick={step === 3 ? create : () => setStep(value => value + 1)}>{busy ? "ИЗПРАЩАНЕ…" : step === 1 ? "ПРОДЪЛЖИ" : step === 2 ? "ПРЕГЛЕДАЙ КУРСА" : "ИЗПРАТИ ЗАЯВКА"}</Button></>}>
    {notices}
    <div><span className="eyebrow">СТЪПКА {step} ОТ 3</span><h1>{step === 1 ? "Къде отиваме?" : step === 2 ? "Детайли за курса" : "Потвърди заявката"}</h1></div>
    {step === 1 ? <>
      {member && <section className="pickupLocation" aria-label="Избор на място за взимане">
        <button type="button" className="pickupLocationButton" disabled={busy} onClick={places.gps.status === "loading" ? places.cancelLookup : places.locatePickup}>
          <LocateFixed size={19}/><span>{places.gps.status === "loading" ? "ОТКАЖИ ЛОКАЛИЗИРАНЕТО" : "ИЗПОЛЗВАЙ МОЕТО МЯСТО"}</span>
        </button>
        <p className={`pickupLocationHint ${places.gps.status}`} role="status">{places.gps.message || "Разрешението за GPS се иска само при натискане. Можеш да избереш и адрес или точка на картата."}</p>
      </section>}
      <Card className="routeEditor">{["pickup", "destination"].map(field => <React.Fragment key={field}>
        <AddressField field={field} location={places[field]} active={places.active === field} onFocus={() => places.focus(field)} onChange={label => places.edit(field, label)} onSearch={places.search} searching={places.active === field && places.status === "loading"} suggestions={places.active === field ? places.results : []} activeOption={places.option} onKeyDown={event => places.keyDown(event, field)}/>
        {places.active === field && <AddressSuggestions field={field} results={places.results} status={places.status} activeOption={places.option} onSelect={place => places.choose(field, place)}/>}
      </React.Fragment>)}</Card>
      <p id="route-address-hint" className="addressHint">Точката на картата избира {places.active === "pickup" ? "мястото за взимане" : "дестинацията"}.{places.resolving && " Разпознаваме адреса…"}</p>
      {map}
      <button className="connectedPlace" onClick={() => places.choose(places.active, { label: "Перник, Изток", lat: 42.6048, lng: 23.0422 })}>Перник, Изток <span>Избери за {places.active === "pickup" ? "взимане" : "дестинация"}</span></button>
      <div className="connectedSession"><span>Здравей, {state.participant.name}</span><button aria-label="Общи заявки" onClick={() => setHistoryOpen(true)}><History size={18}/></button><button aria-label="Изход" disabled={busy} onClick={onLogout}><LogOut size={18}/></button></div>
      {state.participant.accountId && <a className="driverLiveLink" href="/account">Моят профил</a>}
      <a className="pilotBack" href="/">Към демо дизайна</a>
    </> : <>
      <TripSummary ride={{ pickup, destination, passengers }}/>
      {quoteContent}
      {step === 2 && <Card className="bookingOptions"><div className="optionRow"><span><Users size={18}/> Пътници</span><Stepper value={passengers} onChange={setPassengers}/></div></Card>}
      {step === 3 && <p className="connectedNote">Заявката ще се появи при шофьорите във вътрешния тест. След приемане ще видиш името и автомобила на шофьора. Демо отстъпките не се прилагат тук.</p>}
    </>}
  </CustomerScreen>;
}
