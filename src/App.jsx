import React, { useState } from "react";
import CustomerApp from "./apps/CustomerApp";
import DriverApp from "./apps/DriverApp";
import AdminApp from "./apps/AdminApp";
import { Toast } from "./components/UI";
import { load, save } from "./lib/storage";
import PilotApp from "./apps/PilotApp";
import { DEFAULT_TARIFF, calculateFare } from "../shared/fare.js";

function loadTariff() {
  const stored = load("rivoTariffV2", null) || load("rivoTariffsV1", null)?.city || DEFAULT_TARIFF;
  try { calculateFare(1000, stored); return stored; }
  catch { return DEFAULT_TARIFF; }
}

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "");
  if (path === "/ride") return <PilotApp customerUi="rivo"/>;
  if (path === "/drive") return <PilotApp driverUi="rivo"/>;
  return path === "/pilot" ? <PilotApp/> : <PrototypeApp/>;
}

function PrototypeApp() {
  const [mode, setMode] = useState("customer");
  const [tariff, setTariffState] = useState(loadTariff);
  const [message, setMessage] = useState("");

  const setTariff = (next) => {
    setTariffState(next);
    save("rivoTariffV2", next);
  };

  const toast = (text) => {
    setMessage(text);
    window.clearTimeout(window.__rivoToast);
    window.__rivoToast = window.setTimeout(() => setMessage(""), 1700);
  };

  return (
    <div className="shell">
      <div className="app">
        {mode === "customer" && <CustomerApp tariff={tariff} openDriver={() => setMode("driver")} openAdmin={() => setMode("admin")} toast={toast}/>}
        {mode === "driver" && <DriverApp close={() => setMode("customer")} tariff={tariff} toast={toast}/>}
        {mode === "admin" && <AdminApp close={() => setMode("customer")} tariff={tariff} setTariff={setTariff} toast={toast}/>}
        <Toast message={message}/>
      </div>
    </div>
  );
}
