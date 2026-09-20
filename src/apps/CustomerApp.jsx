import React, { useEffect, useState } from "react";
import { BriefcaseBusiness, ChevronRight, CreditCard, History, Home, LocateFixed, MapPin, MessageCircle, Navigation2, Phone, ShieldCheck, Share2 } from "lucide-react";
import { Button, Card, Header, MapMock, Pill, VehicleImage } from "../components/UI";
import { recentPlaces, vehicles } from "../data/mockData";

const savedPlaces = [
  { name: "Дом", address: "Перник, Изток", icon: Home },
  { name: "Работа", address: "София, Център", icon: BriefcaseBusiness }
];

function PlaceIcon({ icon: Icon }) {
  return <Icon className="placeGlyph" size={18} strokeWidth={1.8} aria-hidden="true"/>;
}

function RideClassBadge({ vehicle }) {
  const classLabel = vehicle.id === "city" ? "CITY CLASS" : "PREMIUM CLASS";
  return <div className="premiumBadge"><span className="premiumMark"><ShieldCheck size={17} strokeWidth={1.8}/></span><span><b>{vehicle.label}</b><small>{vehicle.model}</small></span><em>{classLabel}</em></div>;
}

function Stepper({ value, onChange }) {
  return <div className="stepper"><button aria-label="Намали пътниците" onClick={() => onChange(Math.max(1, value - 1))}>−</button><b>{value} {value === 1 ? "пътник" : "пътници"}</b><button aria-label="Добави пътник" onClick={() => onChange(Math.min(4, value + 1))}>+</button></div>;
}

function RouteSummary({ destination, timing, passengers, luggage, payment }) {
  return <Card className="routeSummary"><div className="summaryLine"><LocateFixed className="routeIcon" size={17} strokeWidth={1.8}/><span><small>ВЗИМАНЕ</small><b>Текущо местоположение</b></span></div><div className="summaryLine"><MapPin className="routeIcon mutedIcon" size={17} strokeWidth={1.8}/><span><small>ДЕСТИНАЦИЯ</small><b>{destination}</b></span></div><div className="summaryMeta"><span>{timing === "now" ? "Сега" : "Днес · 18:30"}</span><span>{passengers} {passengers === 1 ? "пътник" : "пътници"}</span><span>{luggage ? "С багаж" : "Без багаж"}</span><span>{payment === "cash" ? "Кеш" : "Visa"}</span></div></Card>;
}

function BookingDetails({ timing, setTiming, passengers, setPassengers, luggage, setLuggage, payment, setPayment, toast }) {
  return <section className="bookingOptions"><div className="eyebrow">ДЕТАЙЛИ ЗА КУРСА</div><div className="segmented"><button className={timing === "now" ? "active" : ""} onClick={() => setTiming("now")}>Сега</button><button className={timing === "later" ? "active" : ""} onClick={() => setTiming("later")}>Насрочи</button></div>{timing === "later" && <button className="optionRow" onClick={() => toast("Избери час за курса")}><span><small>ЧАС НА ВЗИМАНЕ</small><b>Днес · 18:30</b></span><ChevronRight size={19} strokeWidth={1.8}/></button>}<div className="optionRow"><span><small>ПЪТНИЦИ</small><b>Кой ще пътува?</b></span><Stepper value={passengers} onChange={setPassengers}/></div><button className="optionRow" onClick={() => setLuggage(value => !value)}><span><small>БАГАЖ</small><b>{luggage ? "1 голям багаж" : "Без багаж"}</b></span><span className={`toggle ${luggage ? "on" : ""}`}><i/></span></button><button className="optionRow" onClick={() => setPayment(value => value === "cash" ? "card" : "cash")}><span><small>ПЛАЩАНЕ</small><b>{payment === "cash" ? "Кеш" : "Visa •••• 4242"}</b></span><ChevronRight size={19} strokeWidth={1.8}/></button></section>;
}

export default function CustomerApp({ pricing, openDriver, openAdmin, toast }) {
  const [screen, setScreen] = useState("home");
  const [history, setHistory] = useState([]);
  const [ride, setRide] = useState("city");
  const [destination, setDestination] = useState("София, Център");
  const [eta, setEta] = useState(vehicles.city.eta);
  const [tripProgress, setTripProgress] = useState(18);
  const [rating, setRating] = useState(5);
  const [tip, setTip] = useState(0);
  const [passengers, setPassengers] = useState(1);
  const [luggage, setLuggage] = useState(false);
  const [timing, setTiming] = useState("now");
  const [payment, setPayment] = useState("cash");
  const historySeed = [
    { route: "Перник → София", service: `${vehicles.premium.label} · ${vehicles.premium.model}`, price: 34, date: "Днес, 09:40" },
    { route: "Перник · Център", service: `${vehicles.city.label} · ${vehicles.city.model}`, price: 8, date: "Вчера, 18:20" }
  ];
  const [historyItems, setHistoryItems] = useState(historySeed);
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

  const choosePlace = (name) => {
    setDestination(name);
    go("destination");
  };

  const finishRide = () => {
    setHistoryItems(items => [{ route: `Перник → ${destination.split(",")[0]}`, service: `${selected.label} · ${selected.model}`, price: price + tip, date: "Днес, току-що" }, ...items]);
    setHistory([]);
    setScreen("home");
    setTip(0);
  };

  useEffect(() => {
    const content = document.querySelector(".app .content");
    if (!content) return;

    const resetScroll = () => {
      content.scrollTop = 0;
      content.scrollLeft = 0;
    };

    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);
    return () => window.cancelAnimationFrame(frame);
  }, [screen]);

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
      <main className="content homeContent">
        <div className="homeIntro"><h1>Добър вечер, Кристиян</h1></div>
        <MapMock />
        <button className="destinationCard" onClick={() => go("destination")}>
          <span className="destinationIcon"><Navigation2 size={18} strokeWidth={1.8} aria-hidden="true"/></span><span><small>Къде отиваш?</small><b>{destination}</b><small>Натисни, за да промениш маршрута</small></span><ChevronRight className="cardChevron" size={20} strokeWidth={1.8}/>
        </button>
        <div className="savedPlaces">{savedPlaces.map(({ name, address, icon }) => <button key={name} onClick={() => choosePlace(address)}><span><PlaceIcon icon={icon}/></span><b>{name}</b></button>)}</div>
      </main>
    </>
  );

  if (screen === "destination") return (
    <>
      <Header title="Маршрут" onBack={back}/>
      <main className="content">
        <div><span className="eyebrow">СТЪПКА 1 ОТ 3</span><h1>Къде отиваме?</h1><p className="muted">Избери точна дестинация за по-добра цена.</p></div>
        <Card className="routeEditor"><div className="summaryLine"><LocateFixed className="routeIcon" size={17} strokeWidth={1.8}/><span><small>ВЗИМАНЕ</small><b>Текущо местоположение</b></span><LocateFixed className="locationMark" size={18} strokeWidth={1.8}/></div><div className="summaryLine destinationInput"><MapPin className="routeIcon mutedIcon" size={17} strokeWidth={1.8}/><span className="grow"><small>ДЕСТИНАЦИЯ</small><input value={destination} onChange={e => setDestination(e.target.value)} /></span></div></Card>
        <div className="eyebrow">ЗАПАЗЕНИ МЕСТА</div>
        <div className="savedPlaceList">{savedPlaces.map(({ name, address, icon }) => <button key={name} className="place" onClick={() => setDestination(address)}><span className="placeIcon"><PlaceIcon icon={icon}/></span><span><b>{name}</b><small>{address}</small></span><ChevronRight className="cardChevron" size={19} strokeWidth={1.8}/></button>)}</div>
        <div className="eyebrow">ПОСЛЕДНИ</div>
        <div className="savedPlaceList">{recentPlaces.slice(0, 2).map(([name, detail]) => <button className="place" key={name} onClick={() => setDestination(name)}><span className="placeIcon"><History className="placeGlyph" size={18} strokeWidth={1.8}/></span><span><b>{name}</b><small>{detail}</small></span><ChevronRight className="cardChevron" size={19} strokeWidth={1.8}/></button>)}</div>
        <div className="spacer"/><Button onClick={() => go("rides")} disabled={!destination.trim()}>ПРОДЪЛЖИ</Button>
      </main>
    </>
  );

  if (screen === "rides") return (
    <>
      <Header title="Твоят RIVO" onBack={back}/>
      <main className="content">
        <div><span className="eyebrow">СТЪПКА 2 ОТ 3</span><h1>Избери автомобил</h1><p className="muted">Фиксирана цена. Без изненади.</p></div>
        <RouteSummary destination={destination} timing={timing} passengers={passengers} luggage={luggage} payment={payment}/>
        <div className="rideChoices">{Object.values(vehicles).map(v => (
          <button key={v.id} className={`rideCard ${ride === v.id ? "selected" : ""}`} onClick={() => setRide(v.id)}>
            <div>
              <div className="rideTop"><span><b>{v.label}</b><small>{v.model}</small></span><strong className="price">{pricing[v.id]} €</strong></div>
              <small>{v.detail}</small>
              <span className="yellow mini">Идва след ~{v.eta} мин</span>
            </div>
            <VehicleImage src={v.image} alt={v.model} compact/>
          </button>
        ))}</div>
        <BookingDetails timing={timing} setTiming={setTiming} passengers={passengers} setPassengers={setPassengers} luggage={luggage} setLuggage={setLuggage} payment={payment} setPayment={setPayment} toast={toast}/>
        <Button onClick={() => go("confirm")}>ПРЕГЛЕДАЙ КУРСА · {price} €</Button>
      </main>
    </>
  );

  if (screen === "confirm") return (
    <>
      <Header title="Потвърди курса" onBack={back}/>
      <main className="content confirmContent">
        <div><span className="eyebrow">СТЪПКА 3 ОТ 3</span><h1>Всичко изглежда добре?</h1><p className="muted">Провери детайлите преди да поръчаш.</p></div>
        <RouteSummary destination={destination} timing={timing} passengers={passengers} luggage={luggage} payment={payment}/>
        <Card className="confirmVehicle"><div><span className="eyebrow">ТВОЯТ АВТОМОБИЛ</span><h2>{selected.label}</h2><small>{selected.model} · до 4 места</small></div><VehicleImage src={selected.image} alt={selected.model} compact/></Card>
        <Card className="priceSummary"><span><small>ФИКСИРАНА ЦЕНА</small><b>Общо за курса</b></span><strong>{price} €</strong></Card>
        <div className="spacer"/><Button onClick={() => setScreen("arriving")}>ПОРЪЧАЙ {selected.label}</Button><button className="quietAction" onClick={back}>Промени детайлите</button>
      </main>
    </>
  );

  if (screen === "arriving") return (
    <>
      <Header logo right={<Pill live>ШОФЬОРЪТ ИДВА</Pill>}/>
      <main className="content">
        <div className="statusHeader"><div><span className="eyebrow">КУРСЪТ Е ПОТВЪРДЕН</span><h1>{eta ? `Идва след ${eta} мин` : "Шофьорът пристигна"}</h1><p className="muted">{selected.model} · {selected.label}</p></div><span className="liveDot"/></div>
        <MapMock mode="driver" progress={68 - eta * 6}/>
        <Card className="driverProfile"><div className="driverAvatar">И</div><div className="grow"><b>Иван Петров</b><small>★ 4.9 · 248 курса</small><small>{selected.model} · CB 5237 MK</small></div><div className="actions"><button aria-label="Обади се на Иван" onClick={() => toast("Обаждане към Иван…")}><Phone size={17} strokeWidth={1.8}/></button><button aria-label="Отвори чат" onClick={() => toast("Отваряме чат…")}><MessageCircle size={17} strokeWidth={1.8}/></button></div></Card>
        <Card className="pickupSummary"><span><small>ВЗИМАНЕ</small><b>Текущо местоположение</b></span><Pill live>{eta ? "НА ПЪТ" : "ПРИСТИГНА"}</Pill></Card>
        <div className="twoCols"><Button secondary onClick={() => toast("Курсът е споделен")}><Share2 size={15} strokeWidth={1.8}/> Сподели</Button><Button secondary onClick={() => toast("RIVO Safety е активен")}><ShieldCheck size={15} strokeWidth={1.8}/> Safety</Button></div>
        <div className="spacer"/><Button onClick={() => setScreen("trip")}>ДЕМО: ШОФЬОРЪТ ПРИСТИГНА</Button><button className="quietAction" onClick={() => { setHistory([]); setScreen("home"); }}>Откажи курса</button>
      </main>
    </>
  );

  if (screen === "trip") return (
    <>
      <Header logo right={<Pill live>В ПЪТУВАНЕ</Pill>}/>
      <main className="content">
        <div className="statusHeader"><div><span className="eyebrow">{selected.label} · В ПЪТ</span><h1>{Math.max(1, 16 - Math.floor(tripProgress / 7))} мин до {destination.split(",")[0]}</h1><p className="muted">Пристигаме спокойно и навреме.</p></div><span className="liveDot"/></div>
        <MapMock mode="driver" progress={tripProgress}/><div className="progress"><i style={{width:`${tripProgress}%`}}/></div>
        <Card className="activeTripCard"><div className="driverAvatar">И</div><span className="grow"><b>Иван Петров</b><small>{selected.model} · CB 5237 MK</small></span><strong className="price">{price} €</strong></Card>
        <Card className="routeSummary compactSummary"><div className="summaryLine"><span className="dot"/><span><small>ПРИСТИГАНЕ</small><b>{destination}</b></span></div><div className="summaryMeta"><span>{passengers} {passengers === 1 ? "пътник" : "пътници"}</span><span>{luggage ? "С багаж" : "Без багаж"}</span><span>{payment === "cash" ? "Кеш" : "Visa"}</span></div></Card>
        <div className="spacer"/><Button onClick={() => setScreen("complete")}>ДЕМО: ЗАВЪРШИ ПЪТУВАНЕТО</Button>
      </main>
    </>
  );

  if (screen === "complete") return (
    <>
      <Header logo/>
      <main className="content centered">
        <div className="check">✓</div><div><span className="eyebrow">КУРСЪТ Е ЗАВЪРШЕН</span><h1>Пристигнахте</h1><p className="muted">Благодарим, че пътувахте с RIVO.</p></div>
        <Card className="receipt"><RideClassBadge vehicle={selected}/><div className="receiptTop"><span><b>Завършен курс</b><small>{selected.label}</small></span><strong>{price + tip} €</strong></div><div className="receiptRow"><span>Маршрут</span><b>Перник → {destination.split(",")[0]}</b></div><div className="receiptRow"><span>Време</span><b>38 мин · 31 км</b></div><div className="receiptRow"><span>Плащане</span><b>{payment === "cash" ? "Кеш" : "Visa •••• 4242"}</b></div><div className="receiptRow total"><span>Общо</span><strong>{price + tip} €</strong></div></Card>
        <div className="ratingBlock"><b>Как беше пътуването?</b><div className="stars">{[1,2,3,4,5].map(n => <button key={n} className={n <= rating ? "" : "off"} onClick={() => setRating(n)}>★</button>)}</div></div>
        <div className="tipBlock"><span className="eyebrow">БЛАГОДАРИ НА ИВАН</span><div className="tipGrid">{[0,2,5,10].map(n => <button key={n} className={tip === n ? "selected" : ""} onClick={() => setTip(n)}>{n === 0 ? "Без бакшиш" : `+${n} €`}</button>)}</div></div>
        <div className="spacer"/><Button onClick={finishRide}>ГОТОВО</Button>
      </main>
    </>
  );

  return (
    <>
      <Header title="Профил" onBack={back}/>
      <main className="content">
        <Card className="profileHero"><div className="avatar">K</div><div><h2>Кристиян</h2><small>RIVO клиент · 27 пътувания</small></div><span className="profileBadge">4.9 ★</span></Card>
        <div className="eyebrow">ЗАПАЗЕНИ МЕСТА</div>
        <div className="savedPlaceList profilePlaces">{savedPlaces.map(({ name, address, icon }) => <button className="place" key={name} onClick={() => { setDestination(address); go("destination"); }}><span className="placeIcon"><PlaceIcon icon={icon}/></span><span><b>{name}</b><small>{address}</small></span><ChevronRight className="cardChevron" size={19} strokeWidth={1.8}/></button>)}</div>
        <div className="eyebrow">ПЛАЩАНЕ</div><Card className="paymentProfile"><span className="paymentIcon"><CreditCard size={16} strokeWidth={1.8}/></span><span><b>Visa •••• 4242</b><small>Основен метод</small></span><ChevronRight className="cardChevron" size={19} strokeWidth={1.8}/></Card>
        <div className="eyebrow">ПОСЛЕДНИ ПЪТУВАНИЯ</div>
        <div className="historyList">{historyItems.map((item, index) => <Card className="historyRow" key={`${item.route}-${index}`}><span><b>{item.route}</b><small>{item.service}</small><small>{item.date}</small></span><strong>{item.price} €</strong></Card>)}</div>
        <div className="eyebrow">RIVO ЕКОСИСТЕМА</div>
        <Card className="switchCard" onClick={openDriver}><span className="switchIcon">R</span><span><b>RIVO Driver</b><small>Шофьорско приложение</small></span><ChevronRight className="cardChevron yellow" size={19} strokeWidth={1.8}/></Card>
        <Card className="switchCard" onClick={openAdmin}><span className="switchIcon white">A</span><span><b>RIVO Control</b><small>Администрация и автопарк</small></span><ChevronRight className="cardChevron yellow" size={19} strokeWidth={1.8}/></Card>
      </main>
    </>
  );
}
