import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Bell, BriefcaseBusiness, ChevronRight, History, Home, LoaderCircle, LocateFixed, MapPin, MessageCircle, Navigation2, Pencil, Phone, Search, ShieldCheck, Share2, UserRound } from "lucide-react";
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
import useCustomerProfile from "../lib/useCustomerProfile.js";
import useActiveRide from "../lib/useActiveRide.js";
import { cleanActiveRide, demoEta, demoTripProgress, DEMO_MATCH_MS, DEMO_ETA_TICK_MS, DEMO_ETA } from "../lib/activeRide.js";
import useDailyOffers from "../lib/useDailyOffers.js";
import DailyOffers, { AppliedOffer, OfferBanner } from "../components/DailyOffers.jsx";
import { applyDailyOffer } from "../../shared/daily-offers.js";
import { cleanCustomerLocation, formatRideDate } from "../lib/customerProfile.js";
import "./CustomerApp.css";

const placeSlots = [
  { id: "home", name: "Дом", icon: Home },
  { id: "work", name: "Работа", icon: BriefcaseBusiness }
];

const popularLocations = [
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

export function Stepper({ value, onChange }) {
  return <div className="stepper"><button aria-label="Намали пътниците" disabled={value === 1} onClick={() => onChange(value - 1)}>−</button><b aria-live="polite">{value} {value === 1 ? "пътник" : "пътници"}</b><button aria-label="Добави пътник" disabled={value === 4} onClick={() => onChange(value + 1)}>+</button></div>;
}

export function CustomerScreen({ title, onBack, logo = false, right, centered = false, className = "", actions, overlay, children }) {
  return <section className={`customerBooking ${className}`} aria-label="Пътническо приложение">
    <Header title={title} onBack={onBack} logo={logo} right={right}/>
    <main className={`content customerContent ${centered ? "centered" : ""}`}>{children}</main>
    {actions && <footer className="customerActions">{actions}</footer>}
    {overlay}
  </section>;
}

export function CancelRideDialog({ arrived, waiting = false, busy = false, title = "Отказваш курса?", description, keepLabel = "Запази курса", confirmLabel = "Откажи курса", positive = false, onKeep, onCancel }) {
  const dialogRef = useRef(null);
  const onKeepRef = useRef(onKeep);
  onKeepRef.current = onKeep;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog.querySelector("button").focus();
    const handleKey = event => {
      if (event.key === "Escape") { event.preventDefault(); onKeepRef.current(); }
      if (event.key !== "Tab") return;
      const buttons = [...dialog.querySelectorAll("button")];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener("keydown", handleKey);
    return () => {
      dialog.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return <div ref={dialogRef} className="cancelOverlay" role="dialog" aria-modal="true" aria-labelledby="cancelTitle" aria-describedby="cancelDescription">
    <div className="cancelPanel">
      <div className="cancelIcon"><AlertCircle size={20} strokeWidth={1.8}/></div>
      <div><h2 id="cancelTitle">{title}</h2><p id="cancelDescription" className="muted">{description || (waiting ? "Все още търсим шофьор за заявката." : arrived ? "Шофьорът те чака на мястото за взимане." : "Шофьорът е на път към теб.")}</p></div>
      <div className="cancelActions"><Button secondary onClick={onKeep}>{keepLabel}</Button><button className={`cancelConfirm${positive ? " positive" : ""}`} disabled={busy} onClick={onCancel}>{confirmLabel}</button></div>
    </div>
  </div>;
}

export function AddressField({ field, location, active, onFocus, onChange, onSearch, searching, suggestions, activeOption, onKeyDown, customLabel }) {
  const isPickup = field === "pickup";
  const Icon = isPickup ? LocateFixed : MapPin;
  const label = customLabel || (isPickup ? "Взимане" : "Дестинация");
  return <form className={`addressField ${active ? "active" : ""}`} onSubmit={event => onSearch(event, field)}>
    <Icon className="routeIcon" size={18} strokeWidth={1.8} aria-hidden="true"/>
    <label className="grow" htmlFor={`route-${field}`}><span>{label}</span>
      <input id={`route-${field}`} role="combobox" aria-autocomplete="list" aria-expanded={active && suggestions.length > 0} aria-controls={active && suggestions.length ? `route-suggestions-${field}` : undefined} aria-activedescendant={active && activeOption >= 0 ? `route-option-${field}-${activeOption}` : undefined} autoComplete="off" enterKeyHint="search" placeholder={isPickup ? "Откъде да те вземем?" : "Въведи адрес или място"} value={location.label} onFocus={onFocus} onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown} aria-describedby="route-address-hint"/>
    </label>
    <button className="searchButton" type="submit" aria-label={`Търси ${label.toLowerCase()}`} disabled={!location.label.trim() || searching}>{searching ? <LoaderCircle size={18} aria-hidden="true"/> : <Search size={18} aria-hidden="true"/>}</button>
  </form>;
}

export function AddressSuggestions({ field, results, status, activeOption, onSelect }) {
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
  const { profile: customer, updateProfile, storageError, retrySave } = useCustomerProfile();
  const offers = useDailyOffers();
  const activeSession = useActiveRide(customer.rides);
  const restoredRide = activeSession.initialRide;
  const [nameDraft, setNameDraft] = useState(customer.name);
  const [editingPlace, setEditingPlace] = useState(null);
  const previousDestinationRef = useRef(null);
  const [screen, setScreen] = useState(restoredRide?.stage || "home");
  const [history, setHistory] = useState([]);
  const [pickup, setPickup] = useState(restoredRide?.pickup || DEFAULT_PICKUP_LOCATION);
  const [locationStatus, setLocationStatus] = useState(restoredRide ? "manual" : "requesting");
  const [destination, setDestination] = useState(restoredRide?.destination || { label: "", lat: null, lng: null });
  const [activeAddress, setActiveAddress] = useState("destination");
  const addressRequestRef = useRef(0);
  const suggestionTimerRef = useRef(null);
  const suggestionAbortRef = useRef(null);
  const pickupEditedRef = useRef(Boolean(restoredRide));
  const [route, setRoute] = useState(restoredRide?.route || null);
  const [routeAttempt, setRouteAttempt] = useState(0);
  const [bookedFare, setBookedFare] = useState(restoredRide?.fare || null);
  const [driverRoute, setDriverRoute] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [activeOption, setActiveOption] = useState(-1);
  const [addressStatus, setAddressStatus] = useState("idle");
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [eta, setEta] = useState(() => demoEta(restoredRide));
  const [tripProgress, setTripProgress] = useState(() => demoTripProgress(restoredRide));
  const [rating, setRating] = useState(5);
  const [tip, setTip] = useState(0);
  const [passengers, setPassengers] = useState(restoredRide?.passengers || 1);
  const [luggage, setLuggage] = useState(restoredRide?.luggage || false);
  const [timing, setTiming] = useState(restoredRide?.timing || "now");
  const [payment, setPayment] = useState(restoredRide?.payment || "cash");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [tripId, setTripId] = useState(restoredRide?.id || "");
  const [tripDate, setTripDate] = useState("");
  const savedPlaces = placeSlots.map(slot => ({ ...slot, location: customer.places[slot.id] }));
  const editingSlot = placeSlots.find(slot => slot.id === editingPlace);
  const recentDestinations = customer.rides.map(ride => ride.destination).filter((location, index, values) => values.findIndex(other => other.lat === location.lat && other.lng === location.lng) === index).slice(0, 3);
  const avatar = customer.name ? customer.name[0].toLocaleUpperCase("bg") : <UserRound size={20} aria-hidden="true"/>;
  const selected = vehicles.rivo;
  const currentRoute = route?.key === routeKey(pickup, destination) ? route : null;
  const offerUsed = customer.rides.some(ride => ride.promotion?.id === offers.offer.id);
  let baseFare;
  if (currentRoute && !currentRoute.isFallback) {
    try { baseFare = calculateFare(currentRoute.distanceKm * 1000, tariff); } catch { /* Keep submission unavailable for invalid route/tariff. */ }
  }
  const fare = applyDailyOffer(baseFare, offers.settings.selectedId, offerUsed);
  const priceCents = (bookedFare || fare)?.priceCents || 0;
  const arrivingDriverProgress = selected.eta ? 1 - (eta / selected.eta) : 1;
  const tripDriverProgress = tripProgress / 100;
  const remainingTripMinutes = currentRoute ? Math.max(1, Math.ceil(currentRoute.durationMinutes * (1 - tripDriverProgress))) : null;

  useEffect(() => {
    if (restoredRide) return undefined;
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
    if (bookedFare) return undefined;
    if (editingPlace || !isValidLocation(pickup) || !isValidLocation(destination)) {
      setRoute(null);
      return undefined;
    }
    let active = true;
    setRoute(null);
    getRouteGeometry(pickup, destination).then(result => {
      if (active) setRoute(result);
    });
    return () => { active = false; };
  }, [pickup, destination, routeAttempt, editingPlace, bookedFare]);

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
    if (screen === "offers" && new URLSearchParams(window.location.search).has("offer")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("offer");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    if (editingPlace) {
      setDestination(previousDestinationRef.current || { label: "", lat: null, lng: null });
      setEditingPlace(null);
    }
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

  const openOffers = () => {
    offers.update({ readId: offers.offer.id });
    go("offers");
  };

  const editSavedPlace = id => {
    previousDestinationRef.current = destination;
    setEditingPlace(id);
    setActiveAddress("destination");
    changeAddress("destination", customer.places[id] || { label: "", lat: null, lng: null });
    go("destination");
  };

  const saveSavedPlace = remove => {
    const location = remove ? null : cleanCustomerLocation(destination);
    if (!remove && (!location || addressStatus === "loading")) return;
    updateProfile(profile => ({ ...profile, places: { ...profile.places, [editingPlace]: location } }));
    back();
  };

  const repeatRide = ride => {
    changeAddress("pickup", ride.pickup);
    changeAddress("destination", ride.destination);
    setActiveAddress("destination");
    setPassengers(ride.passengers);
    setLuggage(ride.luggage);
    setPayment(ride.payment);
    setTiming("now");
    setBookedFare(null);
    setRoute(null);
    setRouteAttempt(value => value + 1);
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
    setHistory([]);
    setScreen("home");
    setTip(0);
    setRating(5);
    setBookedFare(null);
    offers.update({ selectedId: null });
  };

  const cancelRide = () => {
    activeSession.end();
    setCancelOpen(false);
    setHistory([]);
    setBookedFare(null);
    setScreen("home");
  };

  const arrive = () => {
    activeSession.transition({ stage: "arriving", arrivalAt: Math.min(Date.now(), activeSession.ride.arrivalAt) });
    setEta(0);
  };

  const startTrip = () => {
    activeSession.transition({ stage: "trip", tripStartedAt: Date.now() });
    setTripProgress(0);
    setScreen("trip");
  };

  const completeTrip = () => {
    const completedAt = new Date().toISOString();
    const completedFare = bookedFare || fare;
    setTripDate(formatRideDate(completedAt));
    updateProfile(profile => ({ ...profile, rides: [{
      id: tripId, pickup: cleanCustomerLocation(pickup), destination: cleanCustomerLocation(destination),
      priceCents, tipCents: tip * 100, rating, completedAt, passengers, luggage, payment,
      ...(completedFare?.discountCents ? { promotion: completedFare.promotion, discountCents: completedFare.discountCents, originalPriceCents: completedFare.originalPriceCents } : {})
    }, ...profile.rides.filter(ride => ride.id !== tripId)] }));
    activeSession.end();
    setScreen("complete");
  };

  const updateReceipt = change => {
    if (change.rating !== undefined) setRating(change.rating);
    if (change.tipCents !== undefined) setTip(change.tipCents / 100);
    updateProfile(profile => ({ ...profile, rides: profile.rides.map(ride => ride.id === tripId ? { ...ride, ...change } : ride) }));
  };

  const bookRide = () => {
    if (!fare) return;
    const currentFare = applyDailyOffer(baseFare, offers.settings.selectedId, offerUsed);
    if (currentFare.priceCents !== fare.priceCents) { offers.update({ selectedId: null }); toast("Дневната оферта е изтекла. Прегледай актуалната цена."); return; }
    const bookedAt = Date.now();
    const snapshot = cleanActiveRide({ version: 1, mode: "demo", id: crypto.randomUUID(), stage: "matching",
      pickup, destination, fare, route: currentRoute, bookedAt,
      arrivalAt: bookedAt + DEMO_MATCH_MS + DEMO_ETA * DEMO_ETA_TICK_MS,
      tripStartedAt: null, passengers, luggage, timing, payment });
    if (!snapshot) { toast("Маршрутът не е валиден. Изчисли го отново."); setRouteAttempt(value => value + 1); setScreen("rides"); return; }
    pickupEditedRef.current = true;
    invalidateAddressRequests();
    activeSession.save(snapshot);
    setTripId(snapshot.id);
    setRoute(snapshot.route);
    setBookedFare(snapshot.fare);
    setEta(selected.eta);
    setTripProgress(0);
    setTip(0);
    setRating(5);
    setScreen("matching");
  };

  const recoveryNotice = <>
    {activeSession.restored && activeSession.ride && <p className="rideRecoveryNotice" role="status">Активният демо курс е възстановен. Маршрутът и потвърдената цена са запазени.</p>}
    {activeSession.error && <div className="profileStorageNotice" role="status">
      <p>{activeSession.error === "save" ? "Курсът продължава тук, но не успяхме да го запазим за възстановяване след презареждане."
        : activeSession.error === "clear" ? "Не успяхме да изчистим запазения демо курс от телефона. Опитай отново, преди да затвориш RIVO."
        : activeSession.error === "invalid" ? "Старият запис за демо курс е изтекъл или невалиден. Можеш да започнеш нов курс."
        : "Не успяхме да прочетем активния демо курс от телефона. Презареди, за да опиташ отново."}</p>
      {activeSession.error !== "invalid" && <button onClick={activeSession.error === "load" ? () => window.location.reload() : activeSession.retry}>{activeSession.error === "load" ? "Презареди RIVO" : "Опитай отново"}</button>}
    </div>}
  </>;

  const storageNotice = storageError && <div className="profileStorageNotice" role="status">
    <p>{storageError === "load" ? "Запазените данни не се заредиха. Можеш да добавиш адресите отново." : "Промените са само за тази сесия. Не успяхме да ги запазим на телефона."}</p>
    <button onClick={retrySave}>Опитай да запазиш отново</button>
  </div>;

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
    if (screen !== "arriving" || !activeSession.ride) return undefined;
    const update = () => setEta(demoEta(activeSession.ride));
    update();
    const id = setInterval(update, 300);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(id); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [screen, activeSession.ride]);

  useEffect(() => {
    if (screen !== "matching" || !activeSession.ride) return undefined;
    const id = setTimeout(() => {
      activeSession.transition({ stage: "arriving" });
      setScreen("arriving");
    }, Math.max(0, activeSession.ride.bookedAt + DEMO_MATCH_MS - Date.now()));
    return () => clearTimeout(id);
  }, [screen, activeSession.ride]);

  useEffect(() => {
    if (screen !== "trip" || !activeSession.ride) return undefined;
    const update = () => setTripProgress(demoTripProgress(activeSession.ride));
    update();
    const id = setInterval(update, 500);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(id); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [screen, activeSession.ride]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("offer");
    if (!activeSession.initialRide && id && /^daily-\d{4}-\d{2}-\d{2}$/.test(id)) {
      offers.update({ readId: offers.offer.id });
      setHistory(["home"]);
      setScreen("offers");
    }
  }, []);

  if (screen === "offers") return (
    <CustomerScreen title="Известия и оферти" onBack={back} className="customerOffers">
      <DailyOffers offers={offers} used={offerUsed}
        onApply={() => { const saved = offers.update({ selectedId: offers.offer.id }); back(); toast(saved ? "Офертата е избрана" : "Офертата важи само за тази сесия — настройката не се запази."); }}
        onRemove={() => offers.update({ selectedId: null })}/>
    </CustomerScreen>
  );

  if (screen === "home") return (
    <>
      <Header logo right={<div className="customerHeaderActions"><button className="iconBtn offerBell" aria-label="Известия и оферти" onClick={openOffers}><Bell size={20} aria-hidden="true"/>{offers.settings.inApp && !offerUsed && offers.settings.readId !== offers.offer.id && <i aria-hidden="true"/>}</button><button className="iconBtn profileBtn" aria-label="Отвори профила" onClick={() => go("profile")}>{avatar}</button></div>} />
        <main className="content customerContent homeContent">
        <div className="homeIntro"><h1>{customer.name ? `Здравей, ${customer.name}` : "Къде ще пътуваме?"}</h1></div>
        <a className="card switchCard" href="/ride"><span className="switchIcon">R</span><span><b>Тествай обща заявка</b><small>Свързан клиентски режим · с покана</small></span><ChevronRight className="cardChevron yellow" size={19} strokeWidth={1.8}/></a>
        {storageNotice}
        {recoveryNotice}
        <CustomerMap pickup={pickup} destination={destination} route={route} status={pickupEditedRef.current ? "manual" : locationStatus} addressStatus={addressStatus} recenterSignal={recenterSignal} onRecenter={() => setRecenterSignal(value => value + 1)} onDestinationSelect={selectMapDestination}/>
        <button className="destinationCard" onClick={() => { setActiveAddress("destination"); go("destination"); }}>
          <span className="destinationIcon"><Navigation2 size={18} strokeWidth={1.8} aria-hidden="true"/></span><span><small>Къде отиваш?</small><b>{locationLabel(destination)}</b><small>Натисни, за да промениш маршрута</small></span><ChevronRight className="cardChevron" size={20} strokeWidth={1.8}/>
        </button>
        {offers.settings.inApp && !offerUsed && offers.settings.dismissedId !== offers.offer.id && <OfferBanner onOpen={openOffers} onDismiss={() => offers.update({ dismissedId: offers.offer.id })}/>}
        <div className="savedPlaces">{savedPlaces.map(({ id, name, location, icon }) => <button key={id} aria-label={name} onClick={() => location ? choosePlace(location) : editSavedPlace(id)}><span><PlaceIcon icon={icon}/></span><div><b>{name}</b><small>{location?.label || "Добави адрес"}</small></div></button>)}</div>
        {recentDestinations.length > 0 && <div className="recentHome"><div className="eyebrow">ПОСЛЕДНИ ДЕСТИНАЦИИ</div>{recentDestinations.map(location => <button key={`${location.lat}-${location.lng}`} onClick={() => choosePlace(location)}><History size={16} strokeWidth={1.8}/><span><b>{location.label}</b><small>{location.detail}</small></span><ChevronRight className="cardChevron" size={18} strokeWidth={1.8}/></button>)}</div>}
        <div className="recentHome"><div className="eyebrow">ПОПУЛЯРНИ МЕСТА</div>{popularLocations.slice(0, 2).map(location => <button key={location.label} onClick={() => choosePlace(location)}><MapPin size={16} strokeWidth={1.8}/><span><b>{location.label}</b><small>{location.detail}</small></span><ChevronRight className="cardChevron" size={18} strokeWidth={1.8}/></button>)}</div>
      </main>
    </>
  );

  if (screen === "destination") return (
    <CustomerScreen title={editingSlot ? `Адрес за ${editingSlot.name}` : "Маршрут"} onBack={back} className="customerRoute" actions={<>
      <p className="customerActionHint" role="status">{editingSlot ? "Адресът се запазва на този телефон." : addressStatus === "loading" ? "Разпознаваме избраната точка…" : canContinue ? "Адресите са избрани. Следва цена за маршрута." : "Потърси адрес и избери резултат или точка на картата."}</p>
      {editingSlot ? <>
        <Button onClick={() => saveSavedPlace(false)} disabled={!isValidLocation(destination) || addressStatus === "loading"}>ЗАПАЗИ АДРЕСА</Button>
        {customer.places[editingPlace] && <button className="quietAction" onClick={() => saveSavedPlace(true)}>Премахни адреса</button>}
      </> : <Button onClick={() => go("rides")} disabled={!canContinue}>ПРОДЪЛЖИ</Button>}
    </>}>
        <div><span className="eyebrow">{editingSlot ? "ЗАПАЗЕНО МЯСТО" : "СТЪПКА 1 ОТ 3"}</span><h1>{editingSlot ? (editingPlace === "home" ? "Къде е домът ти?" : "Къде е работата ти?") : "Къде отиваме?"}</h1></div>
        <Card className="routeEditor">
          {(editingSlot ? [["destination", destination]] : [["pickup", pickup], ["destination", destination]]).map(([field, location]) => <React.Fragment key={field}>
            <AddressField field={field} location={location} active={activeAddress === field} onFocus={() => focusAddress(field)} onChange={label => editAddress(field, label)} onSearch={submitAddressSearch} searching={searchStatus === "loading" && activeAddress === field} suggestions={searchResults} activeOption={activeOption} onKeyDown={suggestionKeyDown} customLabel={editingSlot ? `Адрес за ${editingSlot.name}` : undefined}/>
            {activeAddress === field && <AddressSuggestions field={field} results={searchResults} status={searchStatus} activeOption={activeOption} onSelect={selectSearchResult}/>}
          </React.Fragment>)}
        </Card>
        <p id="route-address-hint" className="addressHint">{editingSlot ? "Потърси мястото или избери точка на картата." : activeAddress === "pickup" ? "Точката на картата избира откъде да те вземем." : "Точката на картата избира къде да те оставим."}</p>
        <CustomerMap pickup={editingSlot ? null : pickup} destination={destination} route={editingSlot ? null : route} status={editingSlot || pickupEditedRef.current ? "manual" : locationStatus} addressStatus={addressStatus} recenterSignal={recenterSignal} onRecenter={() => setRecenterSignal(value => value + 1)} onDestinationSelect={selectMapDestination}/>
        {!editingSlot && savedPlaces.some(place => place.location) && <>
          <div className="eyebrow">ЗАПАЗЕНИ МЕСТА · {activeAddress === "pickup" ? "ВЗИМАНЕ" : "ДЕСТИНАЦИЯ"}</div>
          <div className="savedPlaceList">{savedPlaces.filter(place => place.location).map(({ id, name, location, icon }) => <button key={id} className="place" onClick={() => selectSearchResult(location)}><span className="placeIcon"><PlaceIcon icon={icon}/></span><span><b>{name}</b><small>{location.label}</small></span><ChevronRight className="cardChevron" size={19} strokeWidth={1.8}/></button>)}</div>
        </>}
        <div className="eyebrow">ПОПУЛЯРНИ МЕСТА</div>
        <div className="savedPlaceList">{popularLocations.map(location => <button className="place" key={location.label} onClick={() => selectSearchResult(location)}><span className="placeIcon"><MapPin className="placeGlyph" size={18} strokeWidth={1.8}/></span><span><b>{location.label}</b><small>{location.detail}</small></span><ChevronRight className="cardChevron" size={19} strokeWidth={1.8}/></button>)}</div>
    </CustomerScreen>
  );

  if (screen === "rides") return (
    <CustomerScreen title="Твоят RIVO" onBack={back} actions={<Button disabled={!fare} onClick={() => go("confirm")}>ПРЕГЛЕДАЙ КУРСА{fare ? ` · ${formatMoney(fare.priceCents)}` : ""}</Button>}>
        <div><span className="eyebrow">СТЪПКА 2 ОТ 3</span><h1>Детайли за курса</h1><p className="muted">Предварителна оценка според автомобилния маршрут.</p></div>
        <RouteSummary pickup={pickup} destination={destination} route={currentRoute} timing={timing} passengers={passengers} luggage={luggage} payment={payment}/>
        <div className="rideChoices"><Card className="rideCard selected">
          <div><div className="rideTop"><span><b>RIVO</b><small>Една заявка до партньорската мрежа</small></span><strong className="price">{fare ? formatMoney(fare.priceCents) : "—"}</strong></div>
            <small>До 4 места. Данните за шофьора и автомобила се показват след приемане.</small>
          </div>
        </Card></div>
        <AppliedOffer fare={fare} onRemove={() => offers.update({ selectedId: null })}/>
        {fare && <FareBreakdown fare={{ ...fare, durationSeconds: currentRoute.durationMinutes * 60 }}/> }
        {!fare?.discountCents && !offerUsed && <button className="quietAction" onClick={openOffers}>Виж днешната оферта</button>}
        {!fare && <p className="muted" role="status">{currentRoute?.isFallback ? "Маршрутът временно не е наличен. Не можем да изчислим цена." : "Изчисляваме маршрута и цената…"}</p>}
        {currentRoute?.isFallback && <Button secondary onClick={() => setRouteAttempt(value => value + 1)}>ИЗЧИСЛИ ОТНОВО</Button>}
        <BookingDetails timing={timing} setTiming={setTiming} passengers={passengers} setPassengers={setPassengers} luggage={luggage} setLuggage={setLuggage} payment={payment} setPayment={setPayment} toast={toast}/>
    </CustomerScreen>
  );

  if (screen === "confirm") return (
    <CustomerScreen title="Потвърди курса" onBack={back} className="customerConfirm" actions={<>
      <Button disabled={!fare} onClick={bookRide}>ПОРЪЧАЙ {selected.label}</Button>
      <button className="quietAction" onClick={back}>Промени детайлите</button>
    </>}>
        <div><span className="eyebrow">СТЪПКА 3 ОТ 3</span><h1>Всичко изглежда добре?</h1><p className="muted">Провери детайлите преди да поръчаш.</p></div>
        <RouteSummary pickup={pickup} destination={destination} route={currentRoute} timing={timing} passengers={passengers} luggage={luggage} payment={payment}/>
        <Card className="confirmVehicle"><div><span className="eyebrow">ТВОЯТА УСЛУГА</span><h2>{selected.label}</h2><small>{selected.model} · до 4 места</small></div><VehicleImage src={selected.image} alt={selected.model} compact/></Card>
        <Card className="priceSummary"><span><small>ПРЕДВАРИТЕЛНА ОЦЕНКА</small><b>Общо за курса</b></span><strong>{fare ? formatMoney(fare.priceCents) : "Изчисляваме…"}</strong></Card>
        <AppliedOffer fare={fare} onRemove={() => offers.update({ selectedId: null })}/>
        <FareBreakdown fare={fare}/>
    </CustomerScreen>
  );

  if (screen === "matching") return (
    <CustomerScreen logo right={<Pill live>RIVO MATCH</Pill>} className="customerRide customerMatching" centered>
        {recoveryNotice}
        <div className="matchingVisual"><LoaderCircle size={30} strokeWidth={1.7}/></div>
        <div><span className="eyebrow">ЗАЯВКАТА Е ИЗПРАТЕНА</span><h1>Търсим най-близкия RIVO…</h1><p className="muted">Изчакваме шофьор да приеме курса.</p></div>
        <RivoMap pickup={pickup} destination={destination} route={route}/>
    </CustomerScreen>
  );

  if (screen === "arriving") return (
    <CustomerScreen logo right={<span className="arrivalStatus" role="status"><Pill live>{eta ? "ШОФЬОРЪТ ИДВА" : "ШОФЬОРЪТ ПРИСТИГНА"}</Pill></span>} className="customerRide customerArrival" actions={<>
      <p className="customerActionHint">{eta ? "Шофьорът е на път към мястото за взимане." : "Шофьорът те чака на избрания адрес."}</p>
      {eta ? <Button secondary onClick={arrive}>ДЕМО: ШОФЬОРЪТ ПРИСТИГНА</Button> : <Button onClick={startTrip}>ДЕМО: ЗАПОЧНИ ПЪТУВАНЕТО</Button>}
      <button className="quietAction" onClick={() => setCancelOpen(true)}>Откажи курса</button>
    </>} overlay={cancelOpen && <CancelRideDialog arrived={eta === 0} onKeep={() => setCancelOpen(false)} onCancel={cancelRide}/> }>
        {recoveryNotice}
        <div className="statusHeader"><div><span className="eyebrow">КУРСЪТ Е ПОТВЪРДЕН</span><h1>{eta ? `Идва след ${eta} мин` : "Шофьорът пристигна"}</h1><p className="muted">{selected.model} · {selected.label}</p></div><span className="liveDot"/></div>
        <RivoMap pickup={pickup} destination={null} route={driverRoute} driverProgress={arrivingDriverProgress} frameProgress="to-pickup"/>
        <Card className="driverProfile"><div className="driverAvatar">И</div><div className="grow"><b>Иван Петров</b><small>★ 4.9 · 248 курса</small><small>{selected.model} · CB 5237 MK</small></div><div className="actions"><button aria-label="Обади се на Иван" onClick={() => toast("Обажданията предстоят в тестовата версия.")}><Phone size={17} strokeWidth={1.8}/></button><button aria-label="Отвори чат" onClick={() => toast("Чатът предстои в тестовата версия.")}><MessageCircle size={17} strokeWidth={1.8}/></button></div></Card>
        <Card className="pickupSummary"><span><small>ВЗИМАНЕ</small><b>{locationLabel(pickup)}</b></span><Pill live>{eta ? "НА ПЪТ" : "ПРИСТИГНА"}</Pill></Card>
        <div className="twoCols"><Button secondary onClick={() => toast("Споделянето на курса предстои.")}><Share2 size={15} strokeWidth={1.8}/> Сподели</Button><Button secondary onClick={() => toast("Функциите за безопасност предстоят.")}><ShieldCheck size={15} strokeWidth={1.8}/> Сигурност</Button></div>
    </CustomerScreen>
  );

  if (screen === "trip") return (
    <CustomerScreen logo right={<Pill live>В ПЪТУВАНЕ</Pill>} className="customerRide customerTrip" actions={<Button onClick={completeTrip}>ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО</Button>}>
        {recoveryNotice}
        <div className="statusHeader"><div><span className="eyebrow">{selected.label} · В ПЪТ</span><h1>{remainingTripMinutes ? `Около ${remainingTripMinutes} мин до ${locationLabel(destination)}` : `Към ${locationLabel(destination)}`}</h1><p className="muted">Оставащото време е оценка по маршрута.</p></div><span className="liveDot"/></div>
        <RivoMap pickup={pickup} destination={destination} route={route} driverProgress={tripDriverProgress} frameProgress="remaining"/><div className="progress"><i style={{width:`${tripProgress}%`}}/></div>
        <Card className="activeTripCard"><div className="driverAvatar">И</div><span className="grow"><b>Иван Петров</b><small>{selected.model} · CB 5237 MK</small></span><strong className="price">{formatMoney(priceCents)}</strong></Card>
        <Card className="routeSummary compactSummary"><div className="summaryLine"><span className="dot"/><span><small>ПРИСТИГАНЕ</small><b>{locationLabel(destination)}</b></span></div><div className="summaryMeta"><span>{route ? `${route.distanceKm.toFixed(1)} км · ${route.durationMinutes} мин` : "Маршрутът се изчислява"}</span><span>{passengers} {passengers === 1 ? "пътник" : "пътници"}</span><span>{luggage ? "С багаж" : "Без багаж"}</span><span>{payment === "cash" ? "Кеш" : "Visa"}</span></div></Card>
    </CustomerScreen>
  );

  if (screen === "complete") return (
    <CustomerScreen logo className="customerRide customerComplete" centered actions={<Button onClick={finishRide}>ГОТОВО</Button>}>
        {storageNotice}
        {recoveryNotice}
        <div className="check">✓</div><div><span className="eyebrow">КУРСЪТ Е ЗАВЪРШЕН</span><h1>Пристигнахте</h1><p className="muted">Благодарим, че пътувахте с RIVO.</p></div>
        <Card className="receipt"><RideBadge vehicle={selected}/><div className="receiptTop"><span><b>Завършен курс</b></span><strong>{formatMoney(priceCents + tip * 100)}</strong></div><div className="receiptMeta"><span><small>TRIP ID</small><b>#RIVO-{tripId.slice(0, 8).toUpperCase()}</b></span><span><small>ДАТА И ЧАС</small><b>{tripDate}</b></span></div><div className="receiptRow"><span>Маршрут</span><b>{locationLabel(pickup).split(",")[0]} → {locationLabel(destination).split(",")[0]}</b></div><div className="receiptRow"><span>Време</span><b>{route ? `${route.durationMinutes} мин · ${route.distanceKm.toFixed(1)} км` : "Маршрутът не е наличен"}</b></div><div className="receiptRow"><span>Плащане</span><b>{payment === "cash" ? "Кеш" : "Visa •••• 4242"}</b></div><div className="receiptRow total"><span>Общо</span><strong>{formatMoney(priceCents + tip * 100)}</strong></div></Card>
        {bookedFare?.discountCents > 0 && <><AppliedOffer fare={bookedFare}/><div className="receiptRow"><span>Спестено с офертата</span><b>{formatMoney(bookedFare.discountCents)}</b></div></>}
        <div className="ratingBlock"><b>Как беше пътуването?</b><div className="stars" role="group" aria-label="Оценка на пътуването">{[1,2,3,4,5].map(n => <button key={n} className={n <= rating ? "" : "off"} aria-label={`${n} ${n === 1 ? "звезда" : "звезди"}`} aria-pressed={n === rating} onClick={() => updateReceipt({ rating: n })}>★</button>)}</div></div>
        <div className="tipBlock"><span className="eyebrow">БЛАГОДАРИ НА ИВАН</span><div className="tipGrid">{[0,2,5,10].map(n => <button key={n} className={tip === n ? "selected" : ""} aria-pressed={tip === n} onClick={() => updateReceipt({ tipCents: n * 100 })}>{n === 0 ? "Без бакшиш" : `+${n} €`}</button>)}</div></div>
    </CustomerScreen>
  );

  return (
    <CustomerScreen title="Профил" onBack={back} className="customerProfile">
      <Card className="profileHero"><div className="avatar">{avatar}</div><div><h2>{customer.name || "Твоят профил"}</h2><small>{customer.rides.length} {customer.rides.length === 1 ? "курс" : "курса"} в историята</small></div></Card>
      <p className="profileLocalNote">Името, адресите и историята се пазят на този телефон.</p>
      {storageNotice}
      {recoveryNotice}
      <form className="profileNameForm card" onSubmit={event => { event.preventDefault(); const saved = updateProfile(profile => ({ ...profile, name: nameDraft })); setNameDraft(nameDraft.trim()); if (saved) toast("Името е запазено"); }}>
        <label htmlFor="customer-name">Твоето име</label>
        <input id="customer-name" autoComplete="given-name" maxLength={40} placeholder="Как да те наричаме?" value={nameDraft} onChange={event => setNameDraft(event.target.value)}/>
        <Button secondary type="submit">Запази името</Button>
      </form>
      <button className="card offerProfileLink" onClick={openOffers}><Bell size={22} aria-hidden="true"/><span><b>Известия и оферти</b><small>Дневна оферта и настройки за телефона</small></span></button>
      <div className="eyebrow">ЗАПАЗЕНИ МЕСТА</div>
      <div className="savedPlaceList profilePlaces">{savedPlaces.map(({ id, name, location, icon }) => <div className="profilePlaceRow" key={id}>
        <button className="place" onClick={() => location ? choosePlace(location) : editSavedPlace(id)}><span className="placeIcon"><PlaceIcon icon={icon}/></span><span><b>{name}</b><small>{location?.label || "Добави адрес"}</small></span></button>
        {location && <button className="editPlaceButton" aria-label={`Промени ${name}`} onClick={() => editSavedPlace(id)}><Pencil size={18} aria-hidden="true"/></button>}
      </div>)}</div>
      <div className="eyebrow">ЗАВЪРШЕНИ ПЪТУВАНИЯ</div>
      {customer.rides.length === 0 ? <Card className="emptyCustomerHistory"><History size={24} aria-hidden="true"/><b>Все още нямаш завършени пътувания.</b><small>Тук ще виждаш маршрутите и сумите от тестовите си курсове.</small></Card> : <div className="historyList">{customer.rides.map(ride => <button className="card historyRow customerHistoryRow" key={ride.id} aria-label={`Повтори маршрут ${ride.pickup.label} до ${ride.destination.label}`} onClick={() => repeatRide(ride)}>
        <span><b>{ride.pickup.label} → {ride.destination.label}</b><small>{formatRideDate(ride.completedAt)}</small><small>{ride.discountCents ? `С отстъпка ${formatMoney(ride.discountCents)} · ` : "RIVO · "}Повтори маршрута</small></span><strong>{formatMoney(ride.priceCents + ride.tipCents)}</strong>
      </button>)}</div>}
      <div className="eyebrow">RIVO ЕКОСИСТЕМА</div>
      <a className="card switchCard" href="/ride"><span className="switchIcon">R</span><span><b>Обща заявка</b><small>Клиент и шофьор · затворен тест</small></span><ChevronRight className="cardChevron yellow" size={19} strokeWidth={1.8}/></a>
      <button className="card switchCard" onClick={openDriver}><span className="switchIcon">R</span><span><b>RIVO Driver</b><small>Шофьорско приложение</small></span><ChevronRight className="cardChevron yellow" size={19} strokeWidth={1.8}/></button>
      <button className="card switchCard" onClick={openAdmin}><span className="switchIcon white">A</span><span><b>RIVO Control</b><small>Администрация и партньорски автомобили</small></span><ChevronRight className="cardChevron yellow" size={19} strokeWidth={1.8}/></button>
    </CustomerScreen>
  );
}
