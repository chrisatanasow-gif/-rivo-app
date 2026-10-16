import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CarFront, CircleDot, LogOut, MapPin, RefreshCw, Users } from "lucide-react";
import { Button, Card, Header, Pill } from "../components/UI";
import { pilotRequest } from "../services/pilotService";
import { searchAddresses } from "../services/geocodingService";
import { useFareQuote } from "../services/useFareQuote.js";
import { formatMoney } from "../../shared/fare.js";
import FareBreakdown from "../components/FareBreakdown.jsx";
import "./pilot.css";

const PRESETS = [
  { label: "Перник, Център", lat: 42.6052, lng: 23.0379 },
  { label: "Перник, Изток", lat: 42.6048, lng: 23.0422 },
  { label: "София, Център", lat: 42.6977, lng: 23.3219 }
];
const STATUS = {
  waiting: ["Заявката е изпратена", "Изчакваме шофьор да приеме. Ако няма приемане до 10 минути, заявката изтича."],
  accepted: ["Шофьорът прие", "Шофьорът е потвърдил заявката ти."],
  arrived: ["Шофьорът пристигна", "Можеш да се насочиш към автомобила."],
  in_progress: ["Пътуването започна", "Курсът е стартиран от шофьора."],
  completed: ["Курсът е завършен", "Тестовото пътуване приключи успешно."],
  cancelled: ["Курсът е отказан", "Можеш да изпратиш нова заявка."],
  expired: ["Няма приел шофьор", "Заявката изтече. Можеш да опиташ отново."]
};
const TERMINAL = ["completed", "cancelled", "expired"];

function PilotLogin({ onLogin, busy }) {
  const [role, setRole] = useState(new URLSearchParams(window.location.search).get("role") === "driver" ? "driver" : "customer");
  const [code, setCode] = useState("");
  return <form className="pilotForm" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onLogin({ role, code, name: data.get("name"), vehicleModel: data.get("vehicleModel"), vehiclePlate: data.get("vehiclePlate") });
  }}>
    <div><span className="eyebrow">ПЪРВАТА РЕАЛНА ВРЪЗКА</span><h1>Една заявка.<br/>Два телефона.</h1><p className="muted">Влез като пътник на единия телефон и като шофьор на другия.</p></div>
    <div className="segmented" aria-label="Избери роля">
      <button type="button" aria-pressed={role === "customer"} className={role === "customer" ? "active" : ""} onClick={() => setRole("customer")}><Users size={17}/> Пътник</button>
      <button type="button" aria-pressed={role === "driver"} className={role === "driver" ? "active" : ""} onClick={() => setRole("driver")}><CarFront size={17}/> Шофьор</button>
    </div>
    <label className="pilotField">Твоето име<input name="name" required minLength={2} maxLength={80} autoComplete="name" placeholder="Как да те показваме?"/></label>
    {role === "driver" && <>
      <label className="pilotField">Автомобил<input name="vehicleModel" required minLength={2} maxLength={80} placeholder="Марка и модел" autoComplete="off"/></label>
      <label className="pilotField">Регистрационен номер<input name="vehiclePlate" required minLength={2} maxLength={20} placeholder="Номер на автомобила" autoComplete="off"/></label>
    </>}
    <label className="pilotField">Код за вътрешния тест<input type="password" required minLength={16} maxLength={200} value={code} onChange={event => setCode(event.target.value)} autoComplete="off"/></label>
    <Button disabled={busy} type="submit">{busy ? "ВЛИЗАНЕ…" : `ВЛЕЗ КАТО ${role === "customer" ? "ПЪТНИК" : "ШОФЬОР"}`}</Button>
    <p className="pilotNote">Това е вътрешен тест на RIVO. Цените са тестови и не се обработват плащания.</p>
  </form>;
}

function PlaceField({ label, value, onChange, disabled }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const version = useRef(0);
  useEffect(() => () => { version.current += 1; }, []);
  async function search(event) {
    event.preventDefault();
    const request = ++version.current;
    setStatus("Търсим адреса…");
    try {
      const found = await searchAddresses(query, PRESETS[0]);
      if (request !== version.current) return;
      setResults(found);
      setStatus(found.length ? "" : "Няма намерени адреси. Опитай по-точно име.");
    } catch {
      if (request === version.current) setStatus("Търсенето не е налично. Опитай отново или избери място от списъка.");
    }
  }
  function choose(place) {
    version.current += 1;
    onChange(place);
    setQuery(""); setResults([]); setStatus("");
  }
  return <section className="pilotPlace">
    <label className="pilotField">{label}<select aria-label={label} disabled={disabled} value={value?.label || ""} onChange={event => choose(PRESETS.find(place => place.label === event.target.value))}>
      <option value="" disabled>Избери място</option>
      {value && !PRESETS.some(place => place.label === value.label) && <option value={value.label}>{value.label}</option>}
      {PRESETS.map(place => <option key={place.label} value={place.label}>{place.label}</option>)}
    </select></label>
    <form className="pilotSearch" onSubmit={search}>
      <input aria-label={`Търси адрес за ${label.toLowerCase()}`} placeholder="Или потърси друг адрес" value={query} maxLength={160} disabled={disabled} onChange={event => { version.current += 1; setQuery(event.target.value); setResults([]); setStatus(""); }}/>
      <button type="submit" disabled={disabled || query.trim().length < 2} aria-label={`Търси за ${label.toLowerCase()}`}><ArrowRight size={19}/></button>
    </form>
    {status && <p className="pilotNote" role="status">{status}</p>}
    {results.length > 0 && <div className="addressResults">{results.map(place => <button disabled={disabled} type="button" className="addressResult" key={`${place.lat}-${place.lng}`} onClick={() => choose(place)}><MapPin size={17}/><span><b>{place.label}</b><small>{place.detail}</small></span></button>)}</div>}
  </section>;
}

function RideDetails({ ride }) {
  return <Card className="pilotRide">
    <div className="pilotRideHeading"><span><b>RIVO</b><small>{ride.fare ? "Предварителна оценка" : "Предишен тестов курс"}</small></span><strong className="price">{formatMoney(ride.priceCents)}</strong></div>
    <div className="summaryLine"><CircleDot size={17}/><span><small>ВЗИМАНЕ</small><b>{ride.pickup.label}</b></span></div>
    <div className="summaryLine"><MapPin size={17}/><span><small>ДЕСТИНАЦИЯ</small><b>{ride.destination.label}</b></span></div>
    <FareBreakdown fare={ride.fare}/>
    <small>{ride.passengers} {ride.passengers === 1 ? "пътник" : "пътници"} · № {ride.id.slice(0, 8).toUpperCase()}</small>
  </Card>;
}

function CustomerPilot({ state, busy, onCreate, onTransition }) {
  const [pickup, setPickup] = useState(PRESETS[0]);
  const [destination, setDestination] = useState(PRESETS[1]);
  const [passengers, setPassengers] = useState(1);
  const [dismissed, setDismissed] = useState(() => {
    try { return window.localStorage.getItem("rivoPilotDismissedRide"); } catch { return null; }
  });
  const requestKey = useRef(null);
  const latest = state.rides[0];
  const ride = state.activeRide || (latest?.id !== dismissed ? latest : null);
  const quote = useFareQuote(pickup, destination, !ride);
  if (ride) return <>
    <div className="pilotStatus" aria-live="polite"><span className="eyebrow">{TERMINAL.includes(ride.status) ? "РЕЗУЛТАТ" : "ТВОЯТА ЗАЯВКА"}</span><h1>{STATUS[ride.status][0]}</h1><p className="muted">{STATUS[ride.status][1]}</p></div>
    <RideDetails ride={ride}/>
    {ride.driver && <Card className="pilotRide"><span className="eyebrow">ТВОЯТ ШОФЬОР</span><h2>{ride.driver.name}</h2><p>{ride.driver.vehicleModel}</p><b className="yellow">{ride.driver.vehiclePlate}</b></Card>}
    {["waiting", "accepted", "arrived"].includes(ride.status) && <Button secondary disabled={busy} onClick={() => onTransition(ride.id, "cancel")}>ОТКАЖИ ЗАЯВКАТА</Button>}
    {TERMINAL.includes(ride.status) && <Button disabled={busy} onClick={() => {
      setDismissed(ride.id);
      try { window.localStorage.setItem("rivoPilotDismissedRide", ride.id); } catch {}
      requestKey.current = null;
    }}>НОВА ЗАЯВКА</Button>}
  </>;
  return <>
    <div><span className="eyebrow">ЗДРАВЕЙ, {state.participant.name.toLocaleUpperCase("bg-BG")}</span><h1>Къде отиваме?</h1><p className="muted">Шофьорът на другия телефон ще получи тази заявка.</p></div>
    <PlaceField label="Взимане" value={pickup} onChange={setPickup} disabled={busy}/>
    <PlaceField label="Дестинация" value={destination} onChange={setDestination} disabled={busy}/>
    <label className="pilotField">Пътници<select value={passengers} disabled={busy} onChange={event => setPassengers(Number(event.target.value))}>{[1, 2, 3, 4].map(count => <option key={count} value={count}>{count}</option>)}</select></label>
    <section aria-live="polite" aria-label="Предварителна цена">
      {quote.loading && <p className="pilotNote" role="status">Изчисляваме маршрута и цената…</p>}
      {quote.error && <div className="pilotError" role="alert">{quote.error}<button type="button" disabled={busy} onClick={quote.retry}>Изчисли отново</button></div>}
      {quote.quote && <><Card className="priceSummary"><span><small>ПРЕДВАРИТЕЛНА ОЦЕНКА</small><b>RIVO</b></span><strong data-testid="fare-total">{formatMoney(quote.quote.priceCents)}</strong></Card><FareBreakdown fare={quote.quote}/></>}
    </section>
    <Button disabled={busy || !quote.quote} onClick={() => {
      if (requestKey.current?.key !== quote.key) requestKey.current = { key: quote.key, id: window.crypto.randomUUID() };
      onCreate({ pickup, destination, passengers, idempotencyKey: requestKey.current.id, quoteToken: quote.quote.token });
    }}>{busy ? "ИЗПРАЩАНЕ…" : "ИЗПРАТИ ЗАЯВКА"}</Button>
    <p className="pilotNote">Цената се запазва към заявката. При промяна на маршрута се изчислява нова оценка.</p>
  </>;
}

function DriverPilot({ state, busy, onTransition }) {
  const ride = state.activeRide;
  const next = { accepted: ["arrive", "ПРИСТИГНАХ"], arrived: ["start", "СТАРТИРАЙ КУРСА"], in_progress: ["complete", "ЗАВЪРШИ КУРСА"] };
  if (ride) return <>
    <div className="pilotStatus" aria-live="polite"><span className="eyebrow">ТВОЯТ КУРС</span><h1>{STATUS[ride.status][0]}</h1></div>
    <RideDetails ride={ride}/><Card className="pilotRide"><small>ПЪТНИК</small><h2>{ride.customerName}</h2></Card>
    <Button disabled={busy} onClick={() => onTransition(ride.id, next[ride.status][0])}>{next[ride.status][1]}</Button>
    {ride.status !== "in_progress" && <Button secondary disabled={busy} onClick={() => onTransition(ride.id, "cancel")}>ОТКАЖИ КУРСА</Button>}
  </>;
  return <>
    <div><span className="eyebrow">RIVO</span><h1>Готов за заявка</h1><p className="muted">{state.participant.vehicleModel} · {state.participant.vehiclePlate}</p></div>
    {state.requests.length === 0 && <Card className="pilotEmpty"><CarFront size={32}/><h2>Изчакваме пътник</h2><p className="muted">Новите заявки на RIVO ще се появят тук автоматично.</p></Card>}
    {state.requests.map(request => <section className="pilotRequest" key={request.id}><RideDetails ride={request}/><p className="muted">Пътник: {request.customerName}</p><Button disabled={busy} onClick={() => onTransition(request.id, "accept")}>ПРИЕМИ ЗАЯВКАТА</Button></section>)}
    {state.rides.some(item => TERMINAL.includes(item.status)) && <section className="pilotHistory"><span className="eyebrow">ПОСЛЕДНИ ТЕСТОВИ КУРСОВЕ</span>{state.rides.filter(item => TERMINAL.includes(item.status)).slice(0, 3).map(item => <Card key={item.id} className="pilotRide"><b>{STATUS[item.status][0]}</b><small>{item.pickup.label} → {item.destination.label}</small></Card>)}</section>}
  </>;
}

export default function PilotApp() {
  const [participant, setParticipant] = useState(null);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const version = useRef(0);
  const mutation = useRef(false);
  const polling = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    pilotRequest("session", undefined, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setParticipant(data.participant); })
      .catch(problem => { if (!controller.signal.aborted) setError(problem.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; version.current += 1; controller.abort(); };
  }, []);
  const refresh = useCallback(async signal => {
    const request = ++version.current;
    try {
      const data = await pilotRequest("state", undefined, { signal });
      if (!mounted.current || signal?.aborted || request !== version.current) return;
      setState(data); setSyncError("");
    } catch (problem) {
      if (!mounted.current || signal?.aborted || request !== version.current) return;
      if (problem.status === 401) { setParticipant(null); setState(null); }
      setSyncError(problem.message);
    }
  }, []);
  useEffect(() => {
    if (!participant) return undefined;
    const controller = new AbortController();
    const poll = async () => {
      if (polling.current || document.visibilityState === "hidden") return;
      polling.current = true;
      try { await refresh(controller.signal); } finally { polling.current = false; }
    };
    poll();
    const interval = window.setInterval(poll, 2000);
    window.addEventListener("online", poll);
    document.addEventListener("visibilitychange", poll);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("online", poll); document.removeEventListener("visibilitychange", poll); };
  }, [participant, refresh]);
  async function run(action, body) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true); setError("");
    try {
      const data = await pilotRequest(action, body);
      if (!mounted.current) return;
      if (action === "login") { setParticipant(data.participant); setState(null); setSyncError(""); }
      else if (action === "logout") { version.current += 1; setParticipant(null); setState(null); setSyncError(""); }
      else await refresh();
    } catch (problem) {
      if (!mounted.current) return;
      setError(problem.message);
      if (participant) await refresh();
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <div className="shell"><div className="app pilotApp">
    <Header logo right={<Pill>ТЕСТ</Pill>}/>
    <main className="content pilotContent">
      {loading ? <p className="muted" role="status">Свързваме се с RIVO…</p> : <>
        {participant && <div className="pilotSession"><span><b>{participant.name}</b><small>{participant.role === "driver" ? "Шофьор" : "Пътник"}</small></span><button className="iconBtn" aria-label="Изход" disabled={busy || Boolean(state?.activeRide)} onClick={() => run("logout", {})}><LogOut size={18}/></button></div>}
        {error && <div className="pilotError" role="alert">{error}{!participant && <button type="button" onClick={() => window.location.reload()}>Опитай отново</button>}</div>}
        {participant && <div className={`pilotSync ${syncError ? "offline" : ""}`} role="status"><span>{syncError || (state ? "Свързано · заявките се обновяват" : "Зареждаме заявките…")}</span><button type="button" aria-label="Обнови заявките" disabled={busy} onClick={() => refresh()}><RefreshCw size={15}/></button></div>}
        {!participant && <PilotLogin onLogin={data => run("login", data)} busy={busy}/>}
        {participant && state && (participant.role === "customer" ? <CustomerPilot state={state} busy={busy} onCreate={body => run("create", body)} onTransition={(rideId, command) => run("transition", { rideId, command })}/> : <DriverPilot state={state} busy={busy} onTransition={(rideId, command) => run("transition", { rideId, command })}/>)}
      </>}
      <a className="pilotBack" href="/">Към дизайна на RIVO</a>
    </main>
  </div></div>;
}
