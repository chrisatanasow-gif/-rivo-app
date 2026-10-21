import React, { lazy, useState } from "react";
import AppLoadBoundary from "./components/AppLoadBoundary.jsx";
import { Toast } from "./components/UI";
import { load, save } from "./lib/storage";
import { DEFAULT_TARIFF, calculateFare } from "../shared/fare.js";

const CustomerApp = lazy(() => import("./apps/CustomerApp.jsx"));
const DriverApp = lazy(() => import("./apps/DriverApp.jsx"));
const AdminApp = lazy(() => import("./apps/AdminApp.jsx"));
const PilotApp = lazy(() => import("./apps/PilotApp.jsx"));

function loadTariff() {
  const stored = load("rivoTariffV2", null) || load("rivoTariffsV1", null)?.city || DEFAULT_TARIFF;
  try { calculateFare(1000, stored); return stored; }
  catch { return DEFAULT_TARIFF; }
}

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "");
  return <AppLoadBoundary>
    {path === "/ride" ? <PilotApp customerUi="rivo"/> : path === "/drive" ? <PilotApp driverUi="rivo"/> : path === "/pilot" ? <PilotApp/> : <PrototypeApp/>}
  </AppLoadBoundary>;
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
