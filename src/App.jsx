import React, { useState } from "react";
import CustomerApp from "./apps/CustomerApp";
import DriverApp from "./apps/DriverApp";
import AdminApp from "./apps/AdminApp";
import { Toast } from "./components/UI";
import { load, save } from "./lib/storage";

export default function App() {
  const [mode, setMode] = useState("customer");
  const [pricing, setPricingState] = useState(() => load("rivoPricing", { city: 26, premium: 34 }));
  const [message, setMessage] = useState("");

  const setPricing = (next) => {
    setPricingState(next);
    save("rivoPricing", next);
  };

  const toast = (text) => {
    setMessage(text);
    window.clearTimeout(window.__rivoToast);
    window.__rivoToast = window.setTimeout(() => setMessage(""), 1700);
  };

  return (
    <div className="shell">
      <div className="app">
        {mode === "customer" && <CustomerApp pricing={pricing} openDriver={() => setMode("driver")} openAdmin={() => setMode("admin")} toast={toast}/>}
        {mode === "driver" && <DriverApp close={() => setMode("customer")} toast={toast}/>}
        {mode === "admin" && <AdminApp close={() => setMode("customer")} pricing={pricing} setPricing={setPricing} toast={toast}/>}
        <Toast message={message}/>
      </div>
    </div>
  );
}
