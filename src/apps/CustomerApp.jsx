import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Header, Logo, MapMock, Pill, VehicleImage } from "../components/UI";
import { recentPlaces, vehicles } from "../data/mockData";

export default function CustomerApp({ pricing, openDriver, openAdmin, toast }) {
  const [screen, setScreen] = useState("home");
  const [history, setHistory] = useState([]);
  const [ride, setRide] = useState("premium");
  const [destination, setDestination] = useState("София, Център");
  const [eta, setEta] = useState(vehicles.premium.eta);
  const [tripProgress, setTripProgress] = useState(18);
  const [rating, setRating] = useState(5);
  const [tip, setTip] = useState(0);
  const selected = vehicles[ride];
  const price = pricing[ride];

  const go = (name) => {
    setHistory(h => [...h, screen]);
    setScreen(name);
  };
  const back = () => {
    setHistory(h => {
      const next = [...h];
      setScreen(next.pop() || "home");
      return next;
    });
  };

  useEffect(() => {
    if (screen !== "arriving") return;
    setEta(selected.eta);
    const id = setInterval(() => setEta(v => Math.max(0, v - 1)), 1800);
    return () => clearInterval(id);
  }, [screen, selected.eta]);

  useEffect(() => {
    if (screen !== "trip") return;
    setTripProgress(18);
    const id = setInterval(() => setTripProgress(v => Math.min(92, v + 6)), 1000);
    return () => clearInterval(id);
  }, [screen]);

  if (screen === "home") return (
    <>
      <Header logo right={<button className="iconBtn profileBtn" onClick={() => go("profile")}>K</button>} />
      <main className="content">
        <MapMock />
        <button className="destinationCard" onClick={() => go("destination")}>
          <span className="destinationIcon">→</span>
          <span><b>Къде отиваш?</b><small>Въведи адрес или избери последно място</small></span>
        </button>
        <div className="eyebrow">Избери изживяване</div>
        <div className="serviceGrid">
          {Object.values(vehicles).map(v => (
            <button key={v.id} className="serviceCard" onClick={() => { setRide(v.id); go("destination"); }}>
              <VehicleImage src={v.image} alt={v.model} compact />
              <b>{v.label}</b><small>{v.model}</small><span>~{v.eta} мин</span>
            </button>
          ))}
        </div>
      </main>
    </>
  );

  if (screen === "destination") return (
    <>
      <Header title="Дестинация" onBack={back}/>
      <main className="content">
        <div><h1>Къде отиваш?</h1><p className="muted">Избери адрес и после автомобил.</p></div>
        <Card className="field"><span className="dot"/><div><label>ВЗИМАНЕ</label><b>Текущо местоположение</b></div></Card>
        <Card className="field"><span className="dot gray"/><div className="grow"><label>ДЕСТИНАЦИЯ</label><input value={destination} onChange={e => setDestination(e.target.value)}/></div></Card>
        <div className="eyebrow">Последни</div>
        {recentPlaces.map(([name, detail]) => (
          <button className="place" key={name} onClick={() => setDestination(name)}>
            <span className="placeIcon">⌁</span><span><b>{name}</b><small>{detail}</small></span>
          </button>
        ))}
        <div className="spacer"/>
        <Button onClick={() => go("rides")}>ПРОДЪЛЖИ</Button>
      </main>
    </>
  );

  if (screen === "rides") return (
    <>
      <Header title="Избери RIVO" onBack={back}/>
      <main className="content">
        <Card className="route"><div><b>Перник → {destination.split(",")[0]}</b><small>~31 км · около 38 мин</small></div><b className="yellow">↗</b></Card>
        <div><h1>Твоят автомобил</h1><p className="muted">Цената е фиксирана предварително.</p></div>
        {Object.values(vehicles).map(v => (
          <button key={v.id} className={`rideCard ${ride === v.id ? "selected" : ""}`} onClick={() => setRide(v.id)}>
            <div>
              <div className="rideTop"><span><b>{v.label}</b><small>{v.detail}</small></span><strong>{pricing[v.id]} €</strong></div>
              <small>{v.id === "city" ? "Подходящо за градски курс" : "Подходящо за багаж и дълъг маршрут"}</small>
              <span className="yellow mini">Идва след ~{v.eta} мин</span>
            </div>
            <VehicleImage src={v.image} alt={v.model} compact/>
          </button>
        ))}
        <Card className="payment" onClick={() => toast("Методът на плащане е променен")}><span>Плащане</span><b>Кеш ▾</b></Card>
        <div className="spacer"/>
        <Button onClick={() => go("arriving")}>ПОРЪЧАЙ {selected.label}</Button>
      </main>
    </>
  );

  if (screen === "arriving") return (
    <>
      <Header logo right={<Pill live>ШОФЬОРЪТ ИДВА</Pill>}/>
      <main className="content">
        <div><h1>{eta ? `Идва след ${eta} мин` : "Шофьорът пристигна"}</h1><p className="muted">{selected.model} · {selected.label}</p></div>
        <MapMock mode="driver" progress={68 - eta * 6}/>
        <Card className="driverRow">
          <VehicleImage src={selected.image} alt={selected.model} compact/>
          <div className="grow"><b>Иван · ★ 4.9</b><small>{selected.model} · CB 5237 MK</small></div>
          <div className="actions"><button onClick={() => toast("Обаждане към Иван…")}>☎</button><button onClick={() => toast("Отваряме чат…")}>✉</button></div>
        </Card>
        <div className="twoCols"><Button secondary onClick={() => toast("Курсът е споделен")}>Сподели</Button><Button secondary onClick={() => toast("RIVO Safety")}>Помощ</Button></div>
        <div className="spacer"/>
        <Button onClick={() => go("trip")}>ДЕМО: ШОФЬОРЪТ ПРИСТИГНА</Button>
      </main>
    </>
  );

  if (screen === "trip") return (
    <>
      <Header logo right={<Pill live>В ПЪТУВАНЕ</Pill>}/>
      <main className="content">
        <div><h1>{Math.max(1, 16 - Math.floor(tripProgress / 7))} мин до {destination.split(",")[0]}</h1><p className="muted">Курсът се следи в реално време.</p></div>
        <MapMock mode="driver" progress={tripProgress}/>
        <div className="progress"><i style={{width:`${tripProgress}%`}}/></div>
        <Card className="route">
          <div className="routeCar"><img src={selected.image}/><span><b>{destination}</b><small>Иван · {selected.model}</small></span></div>
          <strong className="price">{price} €</strong>
        </Card>
        <div className="spacer"/>
        <Button onClick={() => go("complete")}>ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО</Button>
      </main>
    </>
  );

  if (screen === "complete") return (
    <>
      <Header logo/>
      <main className="content centered">
        <div className="check">✓</div>
        <div><h1>Пристигнахте</h1><p className="muted">Благодарим, че пътувахте с RIVO.</p></div>
        <Card className="receipt">
          <VehicleImage src={selected.image} alt={selected.model}/>
          <div className="receiptRow"><span>{selected.label}</span><b>{selected.model}</b></div>
          <div className="receiptRow"><span>Перник → {destination.split(",")[0]}</span><b>38 мин</b></div>
          <div className="receiptRow total"><span>Общо</span><strong>{price + tip} €</strong></div>
        </Card>
        <b>Как беше пътуването?</b>
        <div className="stars">{[1,2,3,4,5].map(n => <button key={n} className={n <= rating ? "" : "off"} onClick={() => setRating(n)}>★</button>)}</div>
        <div className="tipGrid">{[2,5,10].map(n => <button key={n} className={tip === n ? "selected" : ""} onClick={() => setTip(n)}>{n} €</button>)}</div>
        <div className="spacer"/>
        <Button onClick={() => { setHistory([]); setScreen("home"); setTip(0); }}>ГОТОВО</Button>
      </main>
    </>
  );

  return (
    <>
      <Header title="Профил" onBack={back}/>
      <main className="content">
        <Card className="profile"><div className="avatar">K</div><div><b>Кристиян</b><small>RIVO клиент</small></div></Card>
        <div className="eyebrow">RIVO ЕКОСИСТЕМА</div>
        <Card className="switchCard" onClick={openDriver}><span className="switchIcon">R</span><span><b>RIVO Driver</b><small>Шофьорско приложение</small></span><b className="yellow">→</b></Card>
        <Card className="switchCard" onClick={openAdmin}><span className="switchIcon white">A</span><span><b>RIVO Control</b><small>Администрация и автопарк</small></span><b className="yellow">→</b></Card>
        <div className="eyebrow">Последни пътувания</div>
        <Card className="historyRow"><span><b>Перник → София</b><small>RIVO Premium · BMW 530d Touring</small></span><b>34 €</b></Card>
        <Card className="historyRow"><span><b>Перник · Център</b><small>RIVO City · Audi A1</small></span><b>8 €</b></Card>
      </main>
    </>
  );
}
