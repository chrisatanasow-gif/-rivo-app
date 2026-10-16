import React, { useState } from "react";
import { Button, Card, Header, Pill } from "../components/UI";
import { trips } from "../data/mockData";

export default function AdminApp({ close, tariffs, setTariffs, toast }) {
  const [tab, setTab] = useState("fleet");
  const [values, setValues] = useState(() => Object.fromEntries(Object.entries(tariffs).map(([type, tariff]) => [type, { base: tariff.baseFareCents / 100, km: tariff.perKmCents / 100 }])));
  const [error, setError] = useState("");

  const save = () => {
    const next = {};
    for (const type of ["city", "premium"]) {
      const base = Number(String(values[type].base).replace(",", "."));
      const km = Number(String(values[type].km).replace(",", "."));
      if (!String(values[type].base).trim() || !String(values[type].km).trim() || !Number.isFinite(base) || !Number.isFinite(km) || base < 0 || base > 1000 || km < 0.01 || km > 1000) {
        setError("Въведи валидна начална такса и цена на километър."); return;
      }
      next[type] = { baseFareCents: Math.round(base * 100), perKmCents: Math.round(km * 100) };
    }
    setError(""); setTariffs(next);
    toast("Примерните тарифи са обновени");
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
            {[ ["city", "RIVO City"], ["premium", "RIVO Premium"] ].map(([type, label]) => <React.Fragment key={type}>
              <label><span><b>{label}</b><small>Начална такса · €</small></span><input aria-label={`${label} начална такса`} value={values[type].base} onChange={event => setValues(current => ({ ...current, [type]: { ...current[type], base: event.target.value } }))} inputMode="decimal"/></label>
              <label><span><b>{label}</b><small>Цена на километър · €/км</small></span><input aria-label={`${label} цена на километър`} value={values[type].km} onChange={event => setValues(current => ({ ...current, [type]: { ...current[type], km: event.target.value } }))} inputMode="decimal"/></label>
            </React.Fragment>)}
          </Card>
          <Button onClick={save}>ЗАПАЗИ ЦЕНИТЕ</Button>
          {error && <p role="alert">{error}</p>}
          <p className="muted">Примерните тарифи се пазят на това устройство за демонстрационните екрани. Вътрешният тест използва общите тарифи на RIVO.</p>
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
