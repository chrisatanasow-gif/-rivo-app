import React, { useEffect, useRef } from "react";
import { AlertCircle, ChevronRight, LoaderCircle, LocateFixed, MapPin, Search } from "lucide-react";
import { Button, Header } from "./UI.jsx";
import "../apps/CustomerApp.css";

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
