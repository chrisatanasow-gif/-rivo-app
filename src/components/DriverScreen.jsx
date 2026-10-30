import React from "react";
import { Header } from "./UI.jsx";
import "../apps/DriverApp.css";

export default function DriverScreen({ title, right, onBack, className = "", centered = false, actions, overlay, children }) {
  return <section className={`driverScreen ${className}`} aria-label="Шофьорско приложение">
    <Header title={title} right={right} onBack={onBack}/>
    <main className={`content driverContent${centered ? " centered" : ""}`}>{children}</main>
    <footer className="driverActions">{actions}</footer>
    {overlay}
  </section>;
}
