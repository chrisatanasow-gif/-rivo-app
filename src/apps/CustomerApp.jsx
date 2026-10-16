import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, BriefcaseBusiness, ChevronRight, CreditCard, History, Home, LoaderCircle, LocateFixed, MapPin, MessageCircle, Navigation2, Phone, Search, ShieldCheck, Share2 } from "lucide-react";
import { Button, Card, Header, Pill, VehicleImage } from "../components/UI";
import RivoMap from "../components/RivoMap";
import { vehicles } from "../data/mockData";
import { createSimulatedDriverLocation, DEFAULT_PICKUP_LOCATION, requestCurrentLocation } from "../services/locationService";
import { reverseGeocode, searchAddresses } from "../services/geocodingService";
import { localPlaceSuggestions, mergePlaceSuggestions, MIN_SUGGESTION_LENGTH, remotePlaceSuggestions } from "../services/placeSuggestions.js";
import { getRouteGeometry } from "../services/routingService";
import { calculateFare, formatMoney } from "../../shared/fare.js";
import { isValidLocation, routeKey } from "../../shared/locations.js";
import FareBreakdown from "../components/FareBreakdown.jsx";
import "./CustomerApp.css";

const savedPlaces = [
  { name: "Дом", location: { label: "Перник, Изток", lat: 42.6048, lng: 23.0422 }, icon: Home },
  { name: "Работа", location: { label: "София, Център", lat: 42.6977, lng: 23.3219 }, icon: BriefcaseBusiness }
];

const recentLocations = [
  { label: "София, Център", detail: "пл. „Независимост“", lat: 42.6977, lng: 23.3219 },
  { label: "Летище София, Терминал 2", detail: "бул. „Христофор Колумб“", lat: 42.6886, lng: 23.4167 },
  { label: "Перник, Център", detail: "пл. „Кракра Пернишки“", lat: 42.6052, lng: 23.0379 }
];

function locationLabel(location) {
  return location?.label || "Избери дестинация";
}

function CustomerMap({ pickup, destination, route, onDestinationSelect, onRecenter, recenterSignal, status, addressStatus }) {
  return <div className="customerMapWrap">
    <RivoMap pickup={pickup} destination={destination} route={route} onDestinationSelect={onDestinationSelect} recenterSignal={recenterSignal}/>
    <button className="mapRecenter" aria-label="Центрирай текущото местоположение" onClick={onRecenter}><LocateFixed size={18} strokeWidth={1.8}/></button>
    {status === "requesting" && <span className="mapStatus">Търсим местоположението…</span>}
    {status === "denied" && <span className="mapStatus">GPS е отказан · използваме Перник</span>}
    {status === "unavailable" && <span className="mapStatus">GPS не е наличен · използваме Перник</span>}
    {addressStatus === "loading" && <span className="mapStatus">Разпознаваме адреса…</span>}
  </div>;
}

function PlaceIcon({ icon: Icon }) {
  return <Icon className="placeGlyph" size={18} strokeWidth={1.8} aria-hidden="true"/>;
}

function RideBadge({ vehicle }) {
  return <div className="premiumBadge"><span className="premiumMark"><ShieldCheck size={17} strokeWidth={1.8}/></span><span><b>{vehicle.label}</b><small>{vehicle.model}</small></span><em>КУРС</em></div>;
}

function Stepper({ value, onChange }) {
  return <div className="stepper"><button aria-label="Намали пътниците" disabled={value === 1} onClick={() => onChange(value - 1)}>−</button><b aria-live="polite">{value} {value === 1 ? "пътник" : "пътници"}</b><button aria-label="Добави пътник" disabled={value === 4} onClick={() => onChange(value + 1)}>+</button></div>;
}

function BookingScreen({ title, onBack, className = "", actions, children }) {
  return <section className={`customerBooking ${className}`} aria-label="Поръчка на RIVO">
    <Header title={title} onBack={onBack}/>
    <main className="content customerContent">{children}</main>
    <footer className="customerActions">{actions}</footer>
  </section>;
}

function AddressField({ field, location, active, onFocus, onChange, onSearch, searching, suggestions, activeOption, onKeyDown }) {
  const isPickup = field === "pickup";
  const Icon = isPickup ? LocateFixed : MapPin;
  const label = isPickup ? "Взимане" : "Дестинация";
  return <form className={`addressField ${active ? "active" : ""}`} onSubmit={event => onSearch(event, field)}>
    <Icon className="routeIcon" size={18} strokeWidth={1.8} aria-hidden="true"/>
    <label className="grow" htmlFor={`route-${field}`}><span>{label}</span>
      <input id={`route-${field}`} role="combobox" aria-autocomplete="list" aria-expanded={active && suggestions.length > 0} aria-controls={active && suggestions.length ? `route-suggestions-${field}` : undefined} aria-activedescendant={active && activeOption >= 0 ? `route-option-${field}-${activeOption}` : undefined} autoComplete="off" enterKeyHint="search" placeholder={isPickup ? "Откъде да те вземем?" : "Въведи адрес или място"} value={location.label} onFocus={onFocus} onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown} aria-describedby="route-address-hint"/>
    </label>
    <button className="searchButton" type="submit" aria-label={`Търси ${label.toLowerCase()}`} disabled={!location.label.trim() || searching}>{searching ? <LoaderCircle size={18} aria-hidden="true"/> : <Search size={18} aria-hidden="true"/>}</button>
  </form>;
}

function AddressSuggestions({ field, results, status, activeOption, onSelect }) {
  return <div className="addressSuggestions">
    <div className="addressSearchStatus" role="status" aria-live="polite">
      {status === "short" && <p className="searchMessage">Напиши поне 3 букви за предложения.</p>}
      {status === "loading" && <p className="searchMessage">Търсим места…</p>}
      {status === "empty" && <p className="searchMessage">Няма намерени места. Добави град или избери точка на картата.</p>}
      {status === "error" && <p className="searchMessage error">Търсенето не е налично. Опитай с лупата или избери точка на картата.</p>}
      {status === "partial" && <p className="searchMessage">Другите предложения временно не са налични.</p>}
    </div>
    {results.length > 0 && <div role="group" aria-label="Резултати от търсене">
      <div className="eyebrow">ПРЕДЛОЖЕНИЯ · {field === "pickup" ? "ВЗИМАНЕ" : "ДЕСТИНАЦИЯ"}</div>
      <div className="addressResults" id={`route-suggestions-${field}`} role="listbox" aria-label={`Предложения за ${field === "pickup" ? "взимане" : "дестинация"}`}>
        {results.map((result, index) => <button type="button" role="option" aria-selected={index === activeOption} tabIndex={-1} id={`route-option-${field}-${index}`} className="addressResult" key={result.id || `${result.lat}-${result.lng}-${result.label}`} onMouseDown={event => event.preventDefault()} onClick={() => onSelect(result)}>
          <span className="addressResultIcon"><MapPin size={16} strokeWidth={1.8}/></span><span><b>{result.label}</b><small>{result.detail}</small></span><ChevronRight className="cardChevron" size={18} strokeWidth={1.8}/>
        </button>)}
      </div>
      <small className="suggestionAttribution">Данни за места: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></small>
    </div>}
  </div>;
}

function RouteSummary({ pickup, destination, timing, passengers, luggage, payment, route }) {
  return <Card className="routeSummary"><div className="summaryLine"><LocateFixed className="routeIcon" size={17} strokeWidth={1.8}/><span><small>ВЗИМАНЕ</small><b>{locationLabel(pickup)}</b></span></div><div className="summaryLine"><MapPin className="routeIcon mutedIcon" size={17} strokeWidth={1.8}/><span><small>ДЕСТИНАЦИЯ</small><b>{locationLabel(destination)}</b></span></div><div className="summaryMeta"><span>{route ? `${route.distanceKm.toFixed(1)} км · ${route.durationMinutes} мин` : "Изчисляваме маршрута…"}</span><span>{timing === "now" ? "Сега" : "Днес · 18:30"}</span><span>{passengers} {passengers === 1 ? "пътник" : "пътници"}</span><span>{luggage ? "С багаж" : "Без багаж"}</span><span>{payment === "cash" ? "Кеш" : "Visa"}</span></div></Card>;
}

function BookingDetails({ timing, setTiming, passengers, setPassengers, luggage, setLuggage, payment, setPayment, toast }) {
  return <section className="bookingOptions"><div className="eyebrow">ДЕТАЙЛИ ЗА КУРСА</div><div className="segmented"><button className={timing === "now" ? "active" : ""} onClick={() => setTiming("now")}>Сега</button><button className={timing === "later" ? "active" : ""} onClick={() => setTiming("later")}>Насрочи</button></div>{timing === "later" && <button className="optionRow" onClick={() => toast("Избери час за курса")}><span><small>ЧАС НА ВЗИМАНЕ</small><b>Днес · 18:30</b></span><ChevronRight size={19} strokeWidth={1.8}/></button>}<div className="optionRow"><span><small>ПЪТНИЦИ</small><b>Кой ще пътува?</b></span><Stepper value={passengers} onChange={setPassengers}/></div><button className="optionRow" onClick={() => setLuggage(value => !value)}><span><small>БАГАЖ</small><b>{luggage ? "1 голям багаж" : "Без багаж"}</b></span><span className={`toggle ${luggage ? "on" : ""}`}><i/></span></button><button className="optionRow" onClick={() => setPayment(value => value === "cash" ? "card" : "cash")}><span><small>ПЛАЩАНЕ</small><b>{payment === "cash" ? "Кеш" : "Visa •••• 4242"}</b></span><ChevronRight size={19} strokeWidth={1.8}/></button></section>;
}

export default function CustomerApp({ tariff, openDriver, openAdmin, toast }) {
  const [screen, setScreen] = useState("home");
  const [history, setHistory] = useState([]);
  const [pickup, setPickup] = useState(DEFAULT_PICKUP_LOCATION);
  const [locationStatus, setLocationStatus] = useState("requesting");
  const [destination, setDestination] = useState({ label: "", lat: null, lng: null });
  const [activeAddress, setActiveAddress] = useState("destination");
  const addressRequestRef = useRef(0);
  const suggestionTimerRef = useRef(null);
  const suggestionAbortRef = useRef(null);
  const pickupEditedRef = useRef(false);
  const [route, setRoute] = useState(null);
  const [routeAttempt, setRouteAttempt] = useState(0);
  const [bookedFare, setBookedFare] = useState(null);
  const [driverRoute, setDriverRoute] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [activeOption, setActiveOption] = useState(-1);
  const [addressStatus, setAddressStatus] = useState("idle");
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [eta, setEta] = useState(vehicles.rivo.eta);
  const [tripProgress, setTripProgress] = useState(18);
  const [rating, setRating] = useState(5);
  const [tip, setTip] = useState(0);
  const [passengers, setPassengers] = useState(1);
  const [luggage, setLuggage] = useState(false);
  const [timing, setTiming] = useState("now");
  const [payment, setPayment] = useState("cash");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [tripId] = useState("#RIVO-1048");
  const [tripDate, setTripDate] = useState("");
  const historySeed = [
    { route: "Перник → София", service: `${vehicles.rivo.label} · ${vehicles.rivo.model}`, price: 34, date: "Днес, 09:40" },
    { route: "Перник · Център", service: `${vehicles.rivo.label} · ${vehicles.rivo.model}`, price: 8, date: "Вчера, 18:20" }
  ];
  const [historyItems, setHistoryItems] = useState(historySeed);
  const selected = vehicles.rivo;
  const currentRoute = route?.key === routeKey(pickup, destination) ? route : null;
  let fare;
  if (currentRoute && !currentRoute.isFallback) {
    try { fare = calculateFare(currentRoute.distanceKm * 1000, tariff); } catch { /* Keep submission unavailable for invalid route/tariff. */ }
  }
  const priceCents = (bookedFare || fare)?.priceCents || 0;
  const price = priceCents / 100;
  const arrivingDriverProgress = selected.eta ? 1 - (eta / selected.eta) : 1;
  const tripDriverProgress = tripProgress / 100;

  useEffect(() => {
    let active = true;
    requestCurrentLocation().then(async result => {
      if (!active) return;
      setLocationStatus(result.status);
      if (pickupEditedRef.current) return;
      setPickup(result.location);
      try {
        const geocodedPickup = await reverseGeocode(result.location);
        if (active && !pickupEditedRef.current && geocodedPickup) setPickup(location => ({ ...location, label: geocodedPickup.label, detail: geocodedPickup.detail }));
      } catch (error) {}
    });
    return () => {
      active = false;
      addressRequestRef.current += 1;
      window.clearTimeout(suggestionTimerRef.current);
      suggestionAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isValidLocation(pickup) || !isValidLocation(destination)) {
      setRoute(null);
      return undefined;
    }
    let active = true;
    setRoute(null);
    getRouteGeometry(pickup, destination).then(result => {
      if (active) setRoute(result);
    });
    return () => { active = false; };
  }, [pickup, destination, routeAttempt]);

  useEffect(() => {
    const driverLocation = isValidLocation(pickup) ? createSimulatedDriverLocation(pickup) : null;
    if (!driverLocation || !pickup) {
      setDriverRoute(null);
      return undefined;
    }

    let active = true;
    setDriverRoute(null);
    getRouteGeometry(driverLocation, pickup).then(result => {
      if (active) setDriverRoute(result);
    });
    return () => { active = false; };
  }, [pickup]);

  const go = (name) => {
    invalidateAddressRequests();
    setHistory(h => [...h, screen]);
    setScreen(name);
  };
  const back = () => {
    invalidateAddressRequests();
    setHistory(h => {
      const next = [...h];
      setScreen(next.pop() || "home");
      return next;
    });
  };

  const invalidateAddressRequests = () => {
    addressRequestRef.current += 1;
    window.clearTimeout(suggestionTimerRef.current);
    suggestionAbortRef.current?.abort();
    setSearchResults([]);
    setSearchStatus("idle");
    setActiveOption(-1);
    setAddressStatus("idle");
    return addressRequestRef.current;
  };

  const changeAddress = (field, location) => {
    invalidateAddressRequests();
    if (field === "pickup") {
      pickupEditedRef.current = true;
      setPickup(location);
    } else {
      setDestination(location);
    }
  };

  const focusAddress = field => {
    if (field !== activeAddress) invalidateAddressRequests();
    setActiveAddress(field);
    const location = field === "pickup" ? pickup : destination;
    if (!isValidLocation(location) && location.label.trim().length >= MIN_SUGGESTION_LENGTH) queueSuggestions(location.label);
  };

  const queueSuggestions = label => {
    const requestId = invalidateAddressRequests();
    if (label.trim().length < MIN_SUGGESTION_LENGTH) {
      if (label.trim()) setSearchStatus("short");
      return;
    }
    const local = localPlaceSuggestions(label);
    setSearchResults(local);
    setSearchStatus(local.length ? "success" : "idle");
    const controller = new AbortController();
    suggestionAbortRef.current = controller;
    suggestionTimerRef.current = window.setTimeout(async () => {
      setSearchStatus("loading");
      try {
        const remote = await remotePlaceSuggestions(label, pickup, controller.signal);
        if (requestId !== addressRequestRef.current) return;
        const results = mergePlaceSuggestions(local, remote);
        setSearchResults(results);
        setActiveOption(-1);
        setSearchStatus(results.length ? "success" : "empty");
      } catch (error) {
        if (requestId === addressRequestRef.current && !controller.signal.aborted) setSearchStatus(local.length ? "partial" : "error");
      }
    }, 400);
  };

  const editAddress = (field, label) => {
    setActiveAddress(field);
    changeAddress(field, { label, lat: null, lng: null });
    queueSuggestions(label);
  };

  const choosePlace = location => {
    changeAddress("destination", location);
    setActiveAddress("destination");
    go("destination");
  };

  const submitAddressSearch = async (event, field) => {
    event.preventDefault();
    const query = (field === "pickup" ? pickup : destination).label.trim();
    if (!query) return;

    const requestId = invalidateAddressRequests();
    setActiveAddress(field);
    const local = localPlaceSuggestions(query);
    setSearchResults(local);
    setSearchStatus("loading");
    try {
      const found = await searchAddresses(query, pickup);
      if (requestId !== addressRequestRef.current) return;
      const results = mergePlaceSuggestions(local, found);
      setSearchResults(results);
      setSearchStatus(results.length ? "success" : "empty");
    } catch (error) {
      if (requestId === addressRequestRef.current) setSearchStatus(local.length ? "partial" : "error");
    }
  };

  const selectSearchResult = result => {
    changeAddress(activeAddress, result);
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
  };

  const suggestionKeyDown = event => {
    if (event.nativeEvent.isComposing) return;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && searchResults.length) {
      event.preventDefault();
      setActiveOption(index => event.key === "ArrowDown"
        ? (index + 1) % searchResults.length
        : (index <= 0 ? searchResults.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeOption >= 0 && searchResults[activeOption]) {
      event.preventDefault();
      selectSearchResult(searchResults[activeOption]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      invalidateAddressRequests();
    }
  };

  const selectMapDestination = async location => {
    const field = screen === "destination" ? activeAddress : "destination";
    changeAddress(field, { label: `Точка ${Number(location.lat).toFixed(5)}, ${Number(location.lng).toFixed(5)}`, ...location });
    const requestId = addressRequestRef.current;
    const setLocation = field === "pickup" ? setPickup : setDestination;
    setAddressStatus("loading");
    try {
      const result = await reverseGeocode(location);
      if (requestId !== addressRequestRef.current) return;
      setLocation({
        ...result,
        label: result?.label || `Точка ${Number(location.lat).toFixed(5)}, ${Number(location.lng).toFixed(5)}`,
        ...location
      });
    } catch (error) {
      if (requestId === addressRequestRef.current) {
        setLocation({ label: `Точка ${Number(location.lat).toFixed(5)}, ${Number(location.lng).toFixed(5)}`, ...location });
      }
    } finally {
      if (requestId === addressRequestRef.current) setAddressStatus("idle");
    }
  };

  const canContinue = isValidLocation(pickup) && isValidLocation(destination) && addressStatus !== "loading";

  const finishRide = () => {
    setHistoryItems(items => [{ route: `${locationLabel(pickup).split(",")[0]} → ${locationLabel(destination).split(",")[0]}`, service: `${selected.label} · ${selected.model}`, price: price + tip, date: "Днес, току-що" }, ...items]);
    setHistory([]);
    setScreen("home");
    setTip(0);
    setBookedFare(null);
  };

  const completeTrip = () => {
    setTripDate(new Intl.DateTimeFormat("bg-BG", { dateStyle: "medium", timeStyle: "short" }).format(new Date()));
    setScreen("complete");
  };

  useEffect(() => {
    const content = document.querySelector(".app .content");
    if (!content) return;

    const resetScroll = () => {
      content.scrollTop = 0;
      content.scrollLeft = 0;
    };

    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);
    return () => window.cancelAnimationFrame(frame);
  }, [screen]);

  useEffect(() => {
    if (screen !== "arriving") return;
    setEta(selected.eta);
    const id = setInterval(() => setEta(v => Math.max(0, v - 1)), 1800);
    return () => clearInterval(id);
  }, [screen, selected.eta]);

  useEffect(() => {
    if (screen !== "matching") return;
    const id = setTimeout(() => setScreen("arriving"), 950);
    return () => clearTimeout(id);
  }, [screen]);

  useEffect(() => {
    if (screen !== "trip") return;
    setTripProgress(18);
    const id = setInterval(() => setTripProgress(v => Math.min(92, v + 6)), 1000);
    return () => clearInterval(id);
  }, [screen]);

  if (screen === "home") return (
    <>
      <Header logo right={<button className="iconBtn profileBtn" onClick={() => go("profile")}>K</button>} />
        <main className="content customerContent homeContent">
        <div className="homeIntro"><h1>Добър вечер, Кристиян</h1></div>
        <CustomerMap pickup={pickup} destination={destination} route={route} status={pickupEditedRef.current ? "manual" : locationStatus} addressStatus={addressStatus} recenterSignal={recenterSignal} onRecenter={() => setRecenterSignal(value => value + 1)} onDestinationSelect={selectMapDestination}/>
        <button className="destinationCard" onClick={() => { setActiveAddress("destination"); go("destination"); }}>
          <span className="destinationIcon"><Navigation2 size={18} strokeWidth={1.8} aria-hidden="true"/></span><span><small>Къде отиваш?</small><b>{locationLabel(destination)}</b><small>Натисни, за да промениш маршрута</small></span><ChevronRight className="cardChevron" size={20} strokeWidth={1.8}/>
        </button>
        <div className="savedPlaces">{savedPlaces.map(({ name, location, icon }) => <button key={name} onClick={() => choosePlace(location)}><span><PlaceIcon icon={icon}/></span><b>{name}</b></button>)}</div>
        <div className="recentHome"><div className="eyebrow">ПОСЛЕДНИ</div>{recentLocations.slice(0, 2).map(location => <button key={location.label} onClick={() => choosePlace(location)}><History size={16} strokeWidth={1.8}/><span><b>{location.label}</b><small>{location.detail}</small></span><ChevronRight className="cardChevron" size={18} strokeWidth={1.8}/></button>)}</div>
      </main>
    </>
  );

  if (screen === "destination") return (
    <BookingScreen title="Маршрут" onBack={back} className="customerRoute" actions={<>
      <p className="customerActionHint" role="status">{addressStatus === "loading" ? "Разпознаваме избраната точка…" : canContinue ? "Адресите са избрани. Следва цена за маршрута." : "Потърси адрес и избери резултат или точка на картата."}</p>
      <Button onClick={() => go("rides")} disabled={!canContinue}>ПРОДЪЛЖИ</Button>
    </>}>
        <div><span className="eyebrow">СТЪПКА 1 ОТ 3</span><h1>Къде отиваме?</h1></div>
        <Card className="routeEditor">
          {[["pickup", pickup], ["destination", destination]].map(([field, location]) => <React.Fragment key={field}>
            <AddressField field={field} location={location} active={activeAddress === field} onFocus={() => focusAddress(field)} onChange={label => editAddress(field, label)} onSearch={submitAddressSearch} searching={searchStatus === "loading" && activeAddress === field} suggestions={searchResults} activeOption={activeOption} onKeyDown={suggestionKeyDown}/>
            {activeAddress === field && <AddressSuggestions field={field} results={searchResults} status={searchStatus} activeOption={activeOption} onSelect={selectSearchResult}/>}
          </React.Fragment>)}
        </Card>
        <p id="route-address-hint" className="addressHint">{activeAddress === "pickup" ? "Точката на картата избира откъде да те вземем." : "Точката на картата избира къде да те оставим."}</p>
        <CustomerMap pickup={pickup} destination={destination} route={route} status={pickupEditedRef.current ? "manual" : locationStatus} addressStatus={addressStatus} recenterSignal={recenterSignal} onRecenter={() => setRecenterSignal(value => value + 1)} onDestinationSelect={selectMapDestination}/>
        <div className="eyebrow">ЗАПАЗЕНИ МЕСТА · {activeAddress === "pickup" ? "ВЗИМАНЕ" : "ДЕСТИНАЦИЯ"}</div>
        <div className="savedPlaceList">{savedPlaces.map(({ name, location, icon }) => <button key={name} className="place" onClick={() => selectSearchResult(location)}><span className="placeIcon"><PlaceIcon icon={icon}/></span><span><b>{name}</b><small>{location.label}</small></span><ChevronRight className="cardChevron" size={19} strokeWidth={1.8}/></button>)}</div>
        <div className="eyebrow">ПОСЛЕДНИ</div>
        <div className="savedPlaceList">{recentLocations.slice(0, 2).map(location => <button className="place" key={location.label} onClick={() => selectSearchResult(location)}><span className="placeIcon"><History className="placeGlyph" size={18} strokeWidth={1.8}/></span><span><b>{location.label}</b><small>{location.detail}</small></span><ChevronRight className="cardChevron" size={19} strokeWidth={1.8}/></button>)}</div>
    </BookingScreen>
  );

  if (screen === "rides") return (
    <BookingScreen title="Твоят RIVO" onBack={back} actions={<Button disabled={!fare} onClick={() => go("confirm")}>ПРЕГЛЕДАЙ КУРСА{fare ? ` · ${formatMoney(fare.priceCents)}` : ""}</Button>}>
        <div><span className="eyebrow">СТЪПКА 2 ОТ 3</span><h1>Детайли за курса</h1><p className="muted">Предварителна оценка според автомобилния маршрут.</p></div>
        <RouteSummary pickup={pickup} destination={destination} route={currentRoute} timing={timing} passengers={passengers} luggage={luggage} payment={payment}/>
        <div className="rideChoices"><Card className="rideCard selected">
          <div><div className="rideTop"><span><b>RIVO</b><small>Една заявка до партньорската мрежа</small></span><strong className="price">{fare ? formatMoney(fare.priceCents) : "—"}</strong></div>
            <small>До 4 места. Данните за шофьора и автомобила се показват след приемане.</small>
          </div>
        </Card></div>
        {fare && <FareBreakdown fare={{ ...fare, durationSeconds: currentRoute.durationMinutes * 60 }}/>}
        {!fare && <p className="muted" role="status">{currentRoute?.isFallback ? "Маршрутът временно не е наличен. Не можем да изчислим цена." : "Изчисляваме маршрута и цената…"}</p>}
        {currentRoute?.isFallback && <Button secondary onClick={() => setRouteAttempt(value => value + 1)}>ИЗЧИСЛИ ОТНОВО</Button>}
        <BookingDetails timing={timing} setTiming={setTiming} passengers={passengers} setPassengers={setPassengers} luggage={luggage} setLuggage={setLuggage} payment={payment} setPayment={setPayment} toast={toast}/>
    </BookingScreen>
  );

  if (screen === "confirm") return (
    <BookingScreen title="Потвърди курса" onBack={back} className="customerConfirm" actions={<>
      <Button disabled={!fare} onClick={() => { setBookedFare(fare); setScreen("matching"); }}>ПОРЪЧАЙ {selected.label}</Button>
      <button className="quietAction" onClick={back}>Промени детайлите</button>
    </>}>
        <div><span className="eyebrow">СТЪПКА 3 ОТ 3</span><h1>Всичко изглежда добре?</h1><p className="muted">Провери детайлите преди да поръчаш.</p></div>
        <RouteSummary pickup={pickup} destination={destination} route={currentRoute} timing={timing} passengers={passengers} luggage={luggage} payment={payment}/>
        <Card className="confirmVehicle"><div><span className="eyebrow">ТВОЯТА УСЛУГА</span><h2>{selected.label}</h2><small>{selected.model} · до 4 места</small></div><VehicleImage src={selected.image} alt={selected.model} compact/></Card>
        <Card className="priceSummary"><span><small>ПРЕДВАРИТЕЛНА ОЦЕНКА</small><b>Общо за курса</b></span><strong>{fare ? formatMoney(fare.priceCents) : "Изчисляваме…"}</strong></Card>
        <FareBreakdown fare={fare}/>
    </BookingScreen>
  );

  if (screen === "matching") return (
    <>
      <Header logo right={<Pill live>RIVO MATCH</Pill>}/>
        <main className="content customerContent centered matchingContent">
        <div className="matchingVisual"><LoaderCircle size={30} strokeWidth={1.7}/></div>
        <div><span className="eyebrow">КУРСЪТ Е ПОТВЪРДЕН</span><h1>Търсим най-близкия RIVO…</h1><p className="muted">Свързваме те с подходящия автомобил.</p></div>
        <RivoMap pickup={pickup} destination={destination} route={route}/>
        <div className="spacer"/>
      </main>
    </>
  );

  if (screen === "arriving") return (
    <>
      <Header logo right={<Pill live>ШОФЬОРЪТ ИДВА</Pill>}/>
        <main className="content customerContent">
        <div className="statusHeader"><div><span className="eyebrow">КУРСЪТ Е ПОТВЪРДЕН</span><h1>{eta ? `Идва след ${eta} мин` : "Шофьорът пристигна"}</h1><p className="muted">{selected.model} · {selected.label}</p></div><span className="liveDot"/></div>
        <RivoMap pickup={pickup} destination={null} route={driverRoute} driverProgress={arrivingDriverProgress} frameProgress="to-pickup"/>
        <Card className="driverProfile"><div className="driverAvatar">И</div><div className="grow"><b>Иван Петров</b><small>★ 4.9 · 248 курса</small><small>{selected.model} · CB 5237 MK</small></div><div className="actions"><button aria-label="Обади се на Иван" onClick={() => toast("Обаждане към Иван…")}><Phone size={17} strokeWidth={1.8}/></button><button aria-label="Отвори чат" onClick={() => toast("Отваряме чат…")}><MessageCircle size={17} strokeWidth={1.8}/></button></div></Card>
        <Card className="pickupSummary"><span><small>ВЗИМАНЕ</small><b>{locationLabel(pickup)}</b></span><Pill live>{eta ? "НА ПЪТ" : "ПРИСТИГНА"}</Pill></Card>
        <div className="twoCols"><Button secondary onClick={() => toast("Курсът е споделен")}><Share2 size={15} strokeWidth={1.8}/> Сподели</Button><Button secondary onClick={() => toast("RIVO Safety е активен")}><ShieldCheck size={15} strokeWidth={1.8}/> Safety</Button></div>
        {cancelOpen && <div className="cancelOverlay" role="dialog" aria-modal="true" aria-labelledby="cancelTitle"><div className="cancelPanel"><div className="cancelIcon"><AlertCircle size={20} strokeWidth={1.8}/></div><div><h2 id="cancelTitle">Отказваш курса?</h2><p className="muted">Шофьорът вече е на път към теб.</p></div><div className="cancelActions"><Button secondary onClick={() => setCancelOpen(false)}>Продължи курса</Button><button className="cancelConfirm" onClick={() => { setCancelOpen(false); setHistory([]); setBookedFare(null); setScreen("home"); }}>Откажи курса</button></div></div></div>}
        <div className="spacer"/><Button onClick={() => setScreen("trip")}>ДЕМО: ШОФЬОРЪТ ПРИСТИГНА</Button><button className="quietAction" onClick={() => setCancelOpen(true)}>Откажи курса</button>
      </main>
    </>
  );

  if (screen === "trip") return (
    <>
      <Header logo right={<Pill live>В ПЪТУВАНЕ</Pill>}/>
        <main className="content customerContent">
        <div className="statusHeader"><div><span className="eyebrow">{selected.label} · В ПЪТ</span><h1>{Math.max(1, 16 - Math.floor(tripProgress / 7))} мин до {locationLabel(destination).split(",")[0]}</h1><p className="muted">Пристигаме спокойно и навреме.</p></div><span className="liveDot"/></div>
        <RivoMap pickup={pickup} destination={destination} route={route} driverProgress={tripDriverProgress} frameProgress="remaining"/><div className="progress"><i style={{width:`${tripProgress}%`}}/></div>
        <Card className="activeTripCard"><div className="driverAvatar">И</div><span className="grow"><b>Иван Петров</b><small>{selected.model} · CB 5237 MK</small></span><strong className="price">{formatMoney(priceCents)}</strong></Card>
        <Card className="routeSummary compactSummary"><div className="summaryLine"><span className="dot"/><span><small>ПРИСТИГАНЕ</small><b>{locationLabel(destination)}</b></span></div><div className="summaryMeta"><span>{route ? `${route.distanceKm.toFixed(1)} км · ${route.durationMinutes} мин` : "Маршрутът се изчислява"}</span><span>{passengers} {passengers === 1 ? "пътник" : "пътници"}</span><span>{luggage ? "С багаж" : "Без багаж"}</span><span>{payment === "cash" ? "Кеш" : "Visa"}</span></div></Card>
        <div className="spacer"/><Button onClick={completeTrip}>ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО</Button>
      </main>
    </>
  );

  if (screen === "complete") return (
    <>
      <Header logo/>
        <main className="content customerContent centered">
        <div className="check">✓</div><div><span className="eyebrow">КУРСЪТ Е ЗАВЪРШЕН</span><h1>Пристигнахте</h1><p className="muted">Благодарим, че пътувахте с RIVO.</p></div>
        <Card className="receipt"><RideBadge vehicle={selected}/><div className="receiptTop"><span><b>Завършен курс</b></span><strong>{formatMoney(priceCents + tip * 100)}</strong></div><div className="receiptMeta"><span><small>TRIP ID</small><b>{tripId}</b></span><span><small>ДАТА И ЧАС</small><b>{tripDate}</b></span></div><div className="receiptRow"><span>Маршрут</span><b>{locationLabel(pickup).split(",")[0]} → {locationLabel(destination).split(",")[0]}</b></div><div className="receiptRow"><span>Време</span><b>{route ? `${route.durationMinutes} мин · ${route.distanceKm.toFixed(1)} км` : "Маршрутът не е наличен"}</b></div><div className="receiptRow"><span>Плащане</span><b>{payment === "cash" ? "Кеш" : "Visa •••• 4242"}</b></div><div className="receiptRow total"><span>Общо</span><strong>{formatMoney(priceCents + tip * 100)}</strong></div></Card>
        <div className="ratingBlock"><b>Как беше пътуването?</b><div className="stars">{[1,2,3,4,5].map(n => <button key={n} className={n <= rating ? "" : "off"} onClick={() => setRating(n)}>★</button>)}</div></div>
        <div className="tipBlock"><span className="eyebrow">БЛАГОДАРИ НА ИВАН</span><div className="tipGrid">{[0,2,5,10].map(n => <button key={n} className={tip === n ? "selected" : ""} onClick={() => setTip(n)}>{n === 0 ? "Без бакшиш" : `+${n} €`}</button>)}</div></div>
        <div className="spacer"/><Button onClick={finishRide}>ГОТОВО</Button>
      </main>
    </>
  );

  return (
    <>
      <Header title="Профил" onBack={back}/>
      <main className="content customerContent">
        <Card className="profileHero"><div className="avatar">K</div><div><h2>Кристиян</h2><small>RIVO клиент · 27 пътувания</small></div><span className="profileBadge">4.9 ★</span></Card>
        <div className="eyebrow">ЗАПАЗЕНИ МЕСТА</div>
        <div className="savedPlaceList profilePlaces">{savedPlaces.map(({ name, location, icon }) => <button className="place" key={name} onClick={() => choosePlace(location)}><span className="placeIcon"><PlaceIcon icon={icon}/></span><span><b>{name}</b><small>{location.label}</small></span><ChevronRight className="cardChevron" size={19} strokeWidth={1.8}/></button>)}</div>
        <div className="eyebrow">ПЛАЩАНЕ</div><Card className="paymentProfile"><span className="paymentIcon"><CreditCard size={16} strokeWidth={1.8}/></span><span><b>Visa •••• 4242</b><small>Основен метод</small></span><ChevronRight className="cardChevron" size={19} strokeWidth={1.8}/></Card>
        <div className="eyebrow">ПОСЛЕДНИ ПЪТУВАНИЯ</div>
        <div className="historyList">{historyItems.map((item, index) => <Card className="historyRow" key={`${item.route}-${index}`}><span><b>{item.route}</b><small>{item.service}</small><small>{item.date}</small></span><strong>{formatMoney(Math.round(item.price * 100))}</strong></Card>)}</div>
        <div className="eyebrow">RIVO ЕКОСИСТЕМА</div>
        <Card className="switchCard" onClick={openDriver}><span className="switchIcon">R</span><span><b>RIVO Driver</b><small>Шофьорско приложение</small></span><ChevronRight className="cardChevron yellow" size={19} strokeWidth={1.8}/></Card>
        <Card className="switchCard" onClick={openAdmin}><span className="switchIcon white">A</span><span><b>RIVO Control</b><small>Администрация и партньорски автомобили</small></span><ChevronRight className="cardChevron yellow" size={19} strokeWidth={1.8}/></Card>
      </main>
    </>
  );
}
