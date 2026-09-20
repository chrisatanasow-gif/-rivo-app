import React, { useEffect, useState } from "react";
import { Button, Card, Header, MapMock, Pill, VehicleImage } from "../components/UI";
import { vehicles } from "../data/mockData";

export default function DriverApp({ close, toast }) {
  const [screen, setScreen] = useState("home");
  const [online, setOnline] = useState(true);
  const [wait, setWait] = useState(0);
  const [progress, setProgress] = useState(18);
  const bmw = vehicles.premium;

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
    <>
      <Header title="RIVO DRIVER" onBack={close} right={<Pill>DRIVER</Pill>}/>
      <main className="content">
        <div><h1>Здравей, Иван</h1><p className="muted">BMW 530d Touring · CB 5237 MK</p></div>
        <Card className="onlineRow">
          <span><b>Статус</b><small>{online ? "Онлайн · приемаш заявки" : "Офлайн · не приемаш заявки"}</small></span>
          <button className={`toggle ${online ? "on" : ""}`} onClick={() => setOnline(v => !v)}><i/></button>
        </Card>
        <div className="kpiGrid">
          <Card className="kpi"><span className="eyebrow">ДНЕС</span><strong>86 €</strong><small>4 курса</small></Card>
          <Card className="kpi"><span className="eyebrow">ОНЛАЙН</span><strong>3ч 18м</strong><small>4.9 ★ рейтинг</small></Card>
        </div>
        <Card className="vehicleHero"><span className="eyebrow">ТВОЯТ АВТОМОБИЛ</span><VehicleImage src={bmw.image} alt={bmw.model}/><div className="spaceBetween"><span><b>RIVO PREMIUM</b><small>BMW 530d Touring F11</small></span><b className="yellow">Готов</b></div></Card>
        <div className="spacer"/>
        <Button onClick={() => online ? setScreen("request") : toast("Първо се включи онлайн")}>ДЕМО: НОВА ЗАЯВКА</Button>
        <Button secondary onClick={close}>КЛИЕНТСКО ПРИЛОЖЕНИЕ</Button>
      </main>
    </>
  );

  if (screen === "request") return (
    <>
      <Header title="НОВА ЗАЯВКА" right={<Pill live>12 сек</Pill>}/>
      <main className="content">
        <Card className="request">
          <div className="spaceBetween"><span><span className="eyebrow">RIVO PREMIUM</span><h2>34 €</h2></span><span className="rightText"><b>~38 мин</b><small>31 км</small></span></div>
          <VehicleImage src={bmw.image} alt={bmw.model}/>
          <div className="addressStep"><i/><span><b>Перник, Изток</b><small>Вземане · ~4 мин от теб</small></span></div>
          <div className="addressStep end"><i/><span><b>София, Център</b><small>Дестинация</small></span></div>
        </Card>
        <Card className="customerRow"><div className="avatar">K</div><span><b>Кристиян</b><small>4.9 ★ · 27 пътувания</small></span></Card>
        <div className="spacer"/>
        <div className="twoCols"><Button secondary onClick={() => setScreen("home")}>ОТКАЖИ</Button><Button onClick={() => setScreen("pickup")}>ПРИЕМИ</Button></div>
      </main>
    </>
  );

  if (screen === "pickup") return (
    <>
      <Header title="КЪМ КЛИЕНТА" right={<Pill live>PREMIUM</Pill>}/>
      <main className="content">
        <Card className="navCard"><span className="turn">↱</span><span><small>СЛЕД 300 М</small><b>Завий надясно</b><small>ул. „Юрий Гагарин“</small></span></Card>
        <MapMock mode="driver" progress={38}/>
        <Card className="customerRow"><div className="avatar">K</div><span><b>Кристиян</b><small>Перник, Изток</small></span><div className="actions"><button onClick={() => toast("Обаждане…")}>☎</button><button onClick={() => toast("Чат…")}>✉</button></div></Card>
        <div className="spacer"/>
        <Button onClick={() => setScreen("waiting")}>ПРИСТИГНАХ ПРИ КЛИЕНТА</Button>
      </main>
    </>
  );

  if (screen === "waiting") return (
    <>
      <Header title="ВЗЕМАНЕ" right={<Pill live>ПРИСТИГНАЛ</Pill>}/>
      <main className="content centered">
        <span className="eyebrow">ИЗЧАКВАНЕ</span><div className="waitTime">{waitLabel}</div><p className="muted">Клиентът е уведомен, че си пристигнал.</p>
        <Card className="customerRow full"><div className="avatar">K</div><span><b>Кристиян</b><small>Перник, Изток · RIVO Premium</small></span></Card>
        <VehicleImage src={bmw.image} alt={bmw.model}/>
        <div className="spacer"/>
        <Button onClick={() => setScreen("trip")}>СТАРТИРАЙ КУРСА</Button>
      </main>
    </>
  );

  if (screen === "trip") return (
    <>
      <Header title="АКТИВЕН КУРС" right={<Pill live>14 мин</Pill>}/>
      <main className="content">
        <Card className="navCard"><span className="turn">↑</span><span><small>ПРОДЪЛЖИ</small><b>бул. „Цар Борис III“</b><small>8.4 км до дестинацията</small></span></Card>
        <MapMock mode="driver" progress={progress}/>
        <div className="progress"><i style={{width:`${progress}%`}}/></div>
        <Card className="route"><span><b>София, Център</b><small>Кристиян · RIVO Premium</small></span><strong className="price">34 €</strong></Card>
        <div className="spacer"/>
        <Button onClick={() => setScreen("complete")}>ЗАВЪРШИ КУРСА</Button>
      </main>
    </>
  );

  return (
    <>
      <Header title="КУРС ЗАВЪРШЕН"/>
      <main className="content centered">
        <div className="check">✓</div><h1>Готово</h1><p className="muted">Пътуването е приключено успешно.</p>
        <Card className="earnCard"><span className="eyebrow">ПРИХОД ОТ КУРСА</span><strong>34 €</strong><small>RIVO Premium · 38 мин · 31 км</small></Card>
        <div className="kpiGrid full"><Card className="kpi"><span className="eyebrow">ДНЕС</span><strong>120 €</strong><small>5 курса</small></Card><Card className="kpi"><span className="eyebrow">РЕЙТИНГ</span><strong>4.9 ★</strong><small>последни 100 курса</small></Card></div>
        <div className="spacer"/>
        <Button onClick={() => setScreen("home")}>ОБРАТНО ОНЛАЙН</Button>
      </main>
    </>
  );
}
