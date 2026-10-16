import React, { useEffect, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { Button, Card, Header, MapMock, Pill, VehicleImage } from "../components/UI";
import { DEMO_DRIVER_VEHICLE } from "../data/mockData";
import { calculateFare, formatMoney } from "../../shared/fare.js";
import "./DriverApp.css";

function DriverScreen({ title, right, onBack, className = "", centered = false, actions, children }) {
  return <section className={`driverScreen ${className}`} aria-label="Шофьорско приложение">
    <Header title={title} right={right} onBack={onBack}/>
    <main className={`content driverContent${centered ? " centered" : ""}`}>{children}</main>
    <footer className="driverActions">{actions}</footer>
  </section>;
}

export default function DriverApp({ close, tariff, toast }) {
  const [screen, setScreen] = useState("home");
  const [online, setOnline] = useState(true);
  const [wait, setWait] = useState(0);
  const [progress, setProgress] = useState(18);
  const vehicle = DEMO_DRIVER_VEHICLE;
  const demoFare = calculateFare(31_000, tariff);

  useEffect(() => {
    if (screen !== "waiting") return;
    setWait(0);
    const id = setInterval(() => setWait(v => v + 1), 1000);
    return () => clearInterval(id);
  }, [screen]);

  useEffect(() => {
    if (screen !== "trip") return;
    setProgress(18);
    const id = setInterval(() => setProgress(v => Math.min(94, v + 6)), 1200);
    return () => clearInterval(id);
  }, [screen]);

  const waitLabel = `${String(Math.floor(wait/60)).padStart(2,"0")}:${String(wait%60).padStart(2,"0")}`;

  if (screen === "home") return (
    <DriverScreen title="RIVO DRIVER" onBack={close} right={<Pill>ДЕМО</Pill>} className="driverHome" actions={<>
      <Button disabled={!online} onClick={() => setScreen("request")}>ДЕМО: НОВА ЗАЯВКА</Button>
      <button className="driverExit" onClick={close}>КЪМ КЛИЕНТСКОТО ПРИЛОЖЕНИЕ</button>
    </>}>
        <div className="driverIntro"><h1>Здравей, Иван</h1><p className="muted">{vehicle.model} · CB 5237 MK</p></div>
        <Card className="onlineRow">
          <span><b>Статус</b><small>{online ? "Онлайн · приемаш заявки" : "Офлайн · не приемаш заявки"}</small></span>
          <button className="driverAvailability" role="switch" aria-label="Приемане на заявки" aria-checked={online} onClick={() => setOnline(v => !v)}><span className={`toggle ${online ? "on" : ""}`} aria-hidden="true"><i/></span></button>
        </Card>
        <div className="kpiGrid">
          <Card className="kpi"><span className="eyebrow">ДНЕС</span><strong>86 €</strong><small>4 курса</small></Card>
          <Card className="kpi"><span className="eyebrow">ОНЛАЙН</span><strong>3ч 18м</strong><small>4.9 ★ рейтинг</small></Card>
        </div>
        <Card className="vehicleHero"><span className="eyebrow">ТВОЯТ АВТОМОБИЛ</span><VehicleImage src={vehicle.image} alt={vehicle.model}/><div className="spaceBetween"><span><b>RIVO</b><small>{vehicle.model}</small></span><b className={online ? "yellow" : "muted"}>{online ? "Онлайн" : "Офлайн"}</b></div></Card>
    </DriverScreen>
  );

  if (screen === "request") return (
    <DriverScreen title="НОВА ЗАЯВКА" right={<Pill live>RIVO</Pill>} className="driverRequest" actions={<div className="twoCols"><Button secondary onClick={() => setScreen("home")}>ОТКАЖИ</Button><Button onClick={() => setScreen("pickup")}>ПРИЕМИ</Button></div>}>
        <Card className="request">
          <div className="spaceBetween"><span><span className="eyebrow">ПРЕДВАРИТЕЛНА ОЦЕНКА</span><h2>{formatMoney(demoFare.priceCents)}</h2><small>Примерна тарифа</small></span><span className="rightText"><b>~38 мин</b><small>31 км</small></span></div>
          <VehicleImage src={vehicle.image} alt={vehicle.model}/>
          <div className="addressStep"><i/><span><b>Перник, Изток</b><small>Вземане · ~4 мин от теб</small></span></div>
          <div className="addressStep end"><i/><span><b>София, Център</b><small>Дестинация</small></span></div>
        </Card>
        <Card className="customerRow"><div className="avatar">K</div><span><b>Кристиян</b><small>4.9 ★ · 27 пътувания</small></span></Card>
    </DriverScreen>
  );

  if (screen === "pickup") return (
    <DriverScreen title="КЪМ КЛИЕНТА" right={<Pill live>RIVO</Pill>} className="driverNavigation" actions={<Button onClick={() => setScreen("waiting")}>ПРИСТИГНАХ ПРИ КЛИЕНТА</Button>}>
        <Card className="navCard"><span className="turn">↱</span><span><small>СЛЕД 300 М</small><b>Завий надясно</b><small>ул. „Юрий Гагарин“</small></span></Card>
        <MapMock mode="driver" progress={38}/>
        <Card className="customerRow"><div className="avatar">K</div><span><b>Кристиян</b><small>Перник, Изток</small></span><div className="actions"><button aria-label="Обади се на пътника" onClick={() => toast("Обажданията още не са активни")}><Phone size={18} aria-hidden="true"/></button><button aria-label="Пиши на пътника" onClick={() => toast("Чатът още не е активен")}><MessageCircle size={18} aria-hidden="true"/></button></div></Card>
    </DriverScreen>
  );

  if (screen === "waiting") return (
    <DriverScreen title="ВЗЕМАНЕ" right={<Pill live>ПРИСТИГНАЛ</Pill>} className="driverWaiting" centered actions={<Button onClick={() => setScreen("trip")}>СТАРТИРАЙ КУРСА</Button>}>
        <div className="driverWaitingStatus"><span className="eyebrow">ИЗЧАКВАНЕ</span><div className="waitTime" role="timer" aria-label="Време на изчакване">{waitLabel}</div><p className="muted">Клиентът е уведомен, че си пристигнал.</p></div>
        <Card className="customerRow full"><div className="avatar">K</div><span><b>Кристиян</b><small>Перник, Изток · RIVO</small></span></Card>
        <VehicleImage src={vehicle.image} alt={vehicle.model}/>
    </DriverScreen>
  );

  if (screen === "trip") return (
    <DriverScreen title="АКТИВЕН КУРС" right={<Pill live>В КУРС</Pill>} className="driverNavigation" actions={<Button onClick={() => setScreen("complete")}>ЗАВЪРШИ КУРСА</Button>}>
        <Card className="navCard"><span className="turn">↑</span><span><small>ПРОДЪЛЖИ</small><b>бул. „Цар Борис III“</b><small>8.4 км до дестинацията</small></span></Card>
        <MapMock mode="driver" progress={progress}/>
        <div className="progress" role="progressbar" aria-label="Ход на демонстрационното пътуване" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{width:`${progress}%`}}/></div>
        <Card className="route"><span><b>София, Център</b><small>Кристиян · RIVO</small></span><strong className="price">{formatMoney(demoFare.priceCents)}</strong></Card>
    </DriverScreen>
  );

  return (
    <DriverScreen title="КУРС ЗАВЪРШЕН" className="driverComplete" centered actions={<Button onClick={() => setScreen("home")}>ОБРАТНО ОНЛАЙН</Button>}>
        <div className="check" aria-hidden="true">✓</div><div className="driverIntro"><h1>Готово</h1><p className="muted">Пътуването е приключено успешно.</p></div>
        <Card className="earnCard"><span className="eyebrow">ПРИХОД ОТ КУРСА</span><strong>{formatMoney(demoFare.priceCents)}</strong><small>RIVO · 38 мин · 31 км · примерна тарифа</small></Card>
        <div className="kpiGrid full"><Card className="kpi"><span className="eyebrow">ДНЕС</span><strong>{formatMoney(8600 + demoFare.priceCents)}</strong><small>5 курса</small></Card><Card className="kpi"><span className="eyebrow">РЕЙТИНГ</span><strong>4.9 ★</strong><small>последни 100 курса</small></Card></div>
    </DriverScreen>
  );
}
