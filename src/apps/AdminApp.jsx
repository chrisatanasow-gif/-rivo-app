import React, { useState } from "react";
import { Button, Card, Header, Pill } from "../components/UI";
import { trips } from "../data/mockData";

export default function AdminApp({ close, pricing, setPricing, toast }) {
  const [tab, setTab] = useState("fleet");
  const [city, setCity] = useState(pricing.city);
  const [premium, setPremium] = useState(pricing.premium);

  const save = () => {
    const c = Math.max(1, Number(city) || 26);
    const p = Math.max(c, Number(premium) || 34);
    setPricing({ city: c, premium: p });
    toast("Цените са обновени");
  };

  return (
    <>
      <Header title="RIVO CONTROL" onBack={close} right={<Pill>ADMIN</Pill>}/>
      <main className="content">
        <div><h1>Контролен център</h1><p className="muted">Операции, цени и автопарк.</p></div>
        <div className="kpiGrid">
          <Card className="kpi"><span className="eyebrow">ОБОРОТ ДНЕС</span><strong>312 €</strong><small>+18% спрямо вчера</small></Card>
          <Card className="kpi"><span className="eyebrow">КУРСОВЕ</span><strong>14</strong><small>2 активни</small></Card>
          <Card className="kpi"><span className="eyebrow">ШОФЬОРИ</span><strong>3</strong><small>2 онлайн</small></Card>
          <Card className="kpi"><span className="eyebrow">РЕЙТИНГ</span><strong>4.9 ★</strong><small>последни 100 курса</small></Card>
        </div>

        <div className="tabs">
          {["fleet","pricing","live"].map(t => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "fleet" ? "Автопарк" : t === "pricing" ? "Цени" : "На живо"}</button>)}
        </div>

        {tab === "fleet" && <section className="panel">
          <div className="eyebrow">АВТОПАРК</div>
          <Card className="adminRow"><span className="adminVehicle">P</span><span className="grow"><b>BMW 530d Touring</b><small>RIVO Premium · CB 5237 MK</small></span><Pill live>В КУРС</Pill></Card>
          <Card className="adminRow"><span className="adminVehicle">C</span><span className="grow"><b>Audi A1</b><small>RIVO City · CB 1287 MK</small></span><Pill live>ОНЛАЙН</Pill></Card>
          <Card className="adminRow"><span className="adminVehicle">+</span><span className="grow"><b>Следващ автомобил</b><small>Свободен слот в автопарка</small></span><Pill>НЕАКТИВЕН</Pill></Card>
        </section>}

        {tab === "pricing" && <section className="panel">
          <div className="eyebrow">ЦЕНООБРАЗУВАНЕ</div>
          <Card className="priceEditor">
            <label><span><b>RIVO City</b><small>Демо фиксирана цена</small></span><input value={city} onChange={e => setCity(e.target.value)} inputMode="decimal"/></label>
            <label><span><b>RIVO Premium</b><small>Демо фиксирана цена</small></span><input value={premium} onChange={e => setPremium(e.target.value)} inputMode="decimal"/></label>
          </Card>
          <Button onClick={save}>ЗАПАЗИ ЦЕНИТЕ</Button>
          <p className="muted">Цените се пазят на това устройство и веднага се отразяват в клиентското приложение.</p>
        </section>}

        {tab === "live" && <section className="panel">
          <div className="eyebrow">RIVO LIVE</div>
          <div className="adminMap">
            <svg viewBox="0 0 390 250" fill="none"><path d="M-25 220C43 185 101 157 160 106C216 58 285 46 420 22" stroke="#242832" strokeWidth="16" strokeLinecap="round"/><path d="M15 20C83 64 119 99 154 149C190 202 251 217 410 245" stroke="#1e222a" strokeWidth="11" strokeLinecap="round"/></svg>
            <i className="liveCar c1">A1</i><i className="liveCar c2">F11</i><i className="liveCar c3">R</i>
          </div>
          {trips.map(t => <Card className="adminRow" key={t.id}><span className="grow"><b>{t.id} · {t.service}</b><small>{t.route} · {t.driver}</small></span><strong className="yellow">{t.price} €</strong></Card>)}
        </section>}

        <div className="spacer"/>
        <Button secondary onClick={close}>КЪМ КЛИЕНТСКОТО ПРИЛОЖЕНИЕ</Button>
      </main>
    </>
  );
}
