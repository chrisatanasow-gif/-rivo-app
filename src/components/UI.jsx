import React from "react";

export function Logo() {
  return <div className="logo">RIVO</div>;
}

export function Header({ title, onBack, right, logo = false }) {
  return (
    <header className="header">
      <div>{onBack ? <button className="iconBtn" onClick={onBack}>‹</button> : null}</div>
      <div className="headerCenter">{logo ? <Logo /> : <b>{title}</b>}</div>
      <div className="headerRight">{right || null}</div>
    </header>
  );
}

export function Card({ children, className = "", onClick }) {
  return <div onClick={onClick} className={`card ${className}${onClick ? " clickable" : ""}`}>{children}</div>;
}

export function Pill({ children, live = false }) {
  return <span className={`pill ${live ? "live" : ""}`}>{children}</span>;
}

export function Button({ children, secondary = false, className = "", ...props }) {
  return <button className={`button ${secondary ? "secondary" : ""} ${className}`} {...props}>{children}</button>;
}

export function MapMock({ mode = "customer", progress = 36 }) {
  return (
    <div className="map">
      <svg viewBox="0 0 420 380" fill="none" aria-hidden="true">
        <path d="M-35 330C48 285 101 246 151 181C205 111 275 77 456 25" stroke="#242832" strokeWidth="18" strokeLinecap="round"/>
        <path d="M-35 75C68 119 107 166 139 227C170 287 218 316 282 425" stroke="#1d2128" strokeWidth="11" strokeLinecap="round"/>
        <path d="M52 -20C85 70 137 98 211 126C285 155 339 220 450 318" stroke="#191d24" strokeWidth="8" strokeLinecap="round"/>
        {mode !== "customer" && <path d="M70 304C133 258 171 220 213 180C260 136 300 101 353 68" stroke="#ffd400" strokeWidth="5" strokeLinecap="round"/>}
      </svg>
      <span className="mapLabel a">Център</span>
      <span className="mapLabel b">Изток</span>
      <span className="mapLabel c">София</span>
      <div className="pin"/>
      <div className="carMarker" style={{left:`${Math.min(74, 18 + progress * .56)}%`, top:`${Math.max(17, 72 - progress * .54)}%`}}>R</div>
    </div>
  );
}

export function VehicleImage({ src, alt, compact = false }) {
  return <div className={`vehicleImage ${compact ? "compact" : ""}`}><img src={src} alt={alt}/></div>;
}

export function Toast({ message }) {
  return <div className={`toast ${message ? "show" : ""}`}>{message}</div>;
}
