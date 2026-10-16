import React, { useState } from "react";
import CustomerApp from "./apps/CustomerApp";
import DriverApp from "./apps/DriverApp";
import AdminApp from "./apps/AdminApp";
import { Toast } from "./components/UI";
import { load, save } from "./lib/storage";
import PilotApp from "./apps/PilotApp";
import { DEFAULT_TARIFFS, calculateFare } from "../shared/fare.js";

function loadTariffs() {
  const stored = load("rivoTariffsV1", DEFAULT_TARIFFS);
  try { calculateFare(1000, "city", stored); calculateFare(1000, "premium", stored); return stored; }
  catch { return DEFAULT_TARIFFS; }
}

export default function App() {
  return window.location.pathname.replace(/\/$/, "") === "/pilot" ? <PilotApp/> : <PrototypeApp/>;
}

function PrototypeApp() {
  const [mode, setMode] = useState("customer");
  const [tariffs, setTariffsState] = useState(loadTariffs);
  const [message, setMessage] = useState("");

  const setTariffs = (next) => {
    setTariffsState(next);
    save("rivoTariffsV1", next);
  };

  const toast = (text) => {
    setMessage(text);
    window.clearTimeout(window.__rivoToast);
    window.__rivoToast = window.setTimeout(() => setMessage(""), 1700);
  };

  return (
    <div className="shell">
      <div className="app">
        {mode === "customer" && <CustomerApp tariffs={tariffs} openDriver={() => setMode("driver")} openAdmin={() => setMode("admin")} toast={toast}/>}
        {mode === "driver" && <DriverApp close={() => setMode("customer")} tariffs={tariffs} toast={toast}/>}
        {mode === "admin" && <AdminApp close={() => setMode("customer")} tariffs={tariffs} setTariffs={setTariffs} toast={toast}/>}
        <Toast message={message}/>
      </div>
    </div>
  );
}
