import React, { lazy, useEffect, useRef, useState } from "react";
import { ArrowRight, CarFront, CheckCircle2, LogOut, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, Card, Header, Pill } from "../components/UI";
import { accountRequest, sendCode, signOut, verifyCode } from "../services/accountService.js";
import { accountDate } from "../../shared/account-date.js";
import "./pilot.css";
import "./account.css";

const PilotApp = lazy(() => import("./PilotApp.jsx"));
const LABELS = { pending: "Очаква преглед", approved: "Одобрен шофьор", rejected: "Неодобрена кандидатура", suspended: "Достъпът е спрян" };
const VALID = app => app?.status === "approved" && app.permitValidUntil >= accountDate();

function Login({ onSuccess, run, busy }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [otp, setOtp] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const submitting = useRef(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const send = async () => { await sendCode(sentTo || email.trim()); setSentTo(sentTo || email.trim()); setOtp(""); setResendAt(Date.now() + 60000); setNow(Date.now()); };
  return <form className="pilotForm accountLogin" onSubmit={e => {
    e.preventDefault(); if (submitting.current) return;
    submitting.current = true;
    run(async () => { if (sentTo) { await verifyCode(sentTo, otp); await onSuccess(); } else await send(); }).finally(() => { submitting.current = false; });
  }}>
    <span className="accountSymbol"><Mail size={28}/></span>
    <div><span className="eyebrow">ТВОЯТ ПРОФИЛ В RIVO</span><h1>{sentTo ? "Провери имейла си." : "Влизаш с имейл.\nПътуваш с RIVO."}</h1>
      <p className="muted">{sentTo ? <>Изпратихме еднократен код на <strong>{sentTo}</strong>. Провери и папката „Спам“.</> : "Ще получиш код от 6 цифри. При първо влизане създаваме твоя профил."}</p></div>
    {sentTo ? <>
      <label className="pilotField">Код от имейла<input autoFocus type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} disabled={busy} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="accountOtp"/></label>
      <Button type="submit" disabled={busy || otp.length !== 6}>{busy ? "ПРОВЕРЯВАМЕ…" : "ВЛЕЗ В RIVO"}</Button>
      <button className="accountTextButton" type="button" disabled={busy || remaining > 0} onClick={() => run(send)}>{remaining ? `Нов код след ${remaining} сек.` : "Изпрати нов код"}</button>
      <button className="accountTextButton" type="button" disabled={busy} onClick={() => { setSentTo(""); setOtp(""); }}>Промени имейла</button>
    </> : <>
      <label className="pilotField">Имейл<input type="email" name="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required value={email} disabled={busy} onChange={e => setEmail(e.target.value)} placeholder="tvoiat@email.com"/></label>
      <Button type="submit" disabled={busy}>{busy ? "ИЗПРАЩАМЕ…" : "ИЗПРАТИ МИ КОД"}</Button>
    </>}
    <p className="pilotNote">Затворен тест на RIVO. Цените са тестови и не се обработват плащания.</p>
  </form>;
}

function DriverApplication({ app, run, busy, refresh }) {
  const [editing, setEditing] = useState(!app);
  const fields = [["legalName", "Име по документи", 80], ["phone", "Телефон за връзка", 20], ["vehicleModel", "Марка и модел", 80], ["vehiclePlate", "Регистрационен номер", 20], ["certificateNumber", "Номер на удостоверение за водач", 80], ["permitNumber", "Номер на разрешение за автомобила", 80]];
  return <section className="accountSection">
    <div className="accountHeading"><CarFront size={23}/><h2>Карай с RIVO</h2></div>
    {app && <Card className="accountStatus"><b>{LABELS[app.status]}</b><p>{app.status === "approved" && !VALID(app) ? "Разрешението е изтекло. Обнови кандидатурата си за нов преглед." : app.status === "pending" ? "Екипът на RIVO ще провери данните и документите ти. Приемането на заявки се отключва след одобрение." : app.status === "approved" ? "Можеш да приемаш заявки за тестови курсове." : "Прегледай бележката и при нужда изпрати обновена кандидатура."}</p>{app.note && <p><strong>Бележка от RIVO:</strong> {app.note}</p>}
      <button type="button" className="accountTextButton" disabled={busy} onClick={() => run(refresh)}><RefreshCw size={16}/> Провери статуса</button>
      <a className="accountLink" href="/account/drive">{VALID(app) ? "КЪМ ЗАЯВКИТЕ" : "КЪМ ШОФЬОРСКИЯ РЕЖИМ"}<ArrowRight size={18}/></a>
      <button type="button" className="accountTextButton" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "Затвори редакцията" : "Промени данните"}</button>
    </Card>}
    {editing && <form className="pilotForm" onSubmit={e => {
      e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget));
      run(async () => { await accountRequest("apply", { ...data, licensed: data.licensed === "on" }); setEditing(false); await refresh(); });
    }}>
      <p className="muted">За действащи лицензирани таксиметрови шофьори със собствен автомобил в Перник.</p>
      {fields.map(([key, label, max]) => <label key={key} className="pilotField">{label}<input name={key} required minLength={2} maxLength={max} type={key === "phone" ? "tel" : "text"} autoComplete={key === "phone" ? "tel" : "off"} defaultValue={app?.[key] || ""} disabled={busy}/></label>)}
      <label className="pilotField">Разрешението е валидно до<input type="date" name="permitValidUntil" min={accountDate()} defaultValue={app?.permitValidUntil || ""} required disabled={busy}/></label>
      <label className="accountCheck"><input type="checkbox" name="licensed" required disabled={busy}/><span>Потвърждавам, че съм действащ лицензиран таксиметров шофьор и посоченият автомобил има валидно разрешение.</span></label>
      <p className="pilotNote">При промяна кандидатурата отново минава през преглед. Не въвеждай ЕГН. Документите се проверяват лично от екипа на RIVO.</p>
      <Button type="submit" disabled={busy}>{busy ? "ИЗПРАЩАМЕ…" : "ИЗПРАТИ ЗА ПРЕГЛЕД"}</Button>
    </form>}
  </section>;
}

function Reviews({ run, busy }) {
  const [rows, setRows] = useState(null);
  const refresh = async () => setRows((await accountRequest("applications")).applications);
  useEffect(() => { run(refresh); }, []);
  return <section className="accountSection"><div className="accountHeading"><ShieldCheck size={23}/><h1>Кандидатури</h1></div>
    <p className="muted">Провери самоличността, документите, разрешението и автомобила преди одобрение.</p>
    <button className="accountTextButton" disabled={busy} onClick={() => run(refresh)}><RefreshCw size={16}/> Обнови списъка</button>
    {rows?.length === 0 && <p>Няма подадени кандидатури.</p>}
    {rows?.map(app => <Card key={`${app.accountId}:${app.revision}`} className="accountReview"><b>{app.legalName}</b><span className="eyebrow">{LABELS[app.status]}</span><p>{app.email}<br/>{app.phone}<br/>{app.vehicleModel} · {app.vehiclePlate}</p>
      <dl><dt>Удостоверение</dt><dd>{app.certificateNumber}</dd><dt>Разрешение</dt><dd>{app.permitNumber}</dd><dt>Валидно до</dt><dd>{app.permitValidUntil}</dd></dl>
      {app.note && <p>Последна бележка: {app.note}</p>}
      <form className="pilotForm" onSubmit={e => {
        e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget));
        run(async () => { await accountRequest("review", { accountId: app.accountId, revision: app.revision, status: data.status, note: data.note, documentsChecked: data.checked === "on" }); await refresh(); });
      }}>
        <label className="pilotField">Решение<select name="status" defaultValue="approved" disabled={busy}><option value="approved">Одобри</option><option value="rejected">Откажи</option><option value="suspended">Спри достъпа</option></select></label>
        <label className="pilotField">Бележка от проверката<textarea name="note" required minLength={2} maxLength={500} disabled={busy}/></label>
        <label className="accountCheck"><input type="checkbox" name="checked" disabled={busy}/><span>Проверих документите, валидното разрешение и автомобила. Задължително при одобрение.</span></label>
        <Button type="submit" disabled={busy}>ЗАПАЗИ РЕШЕНИЕТО</Button>
      </form>
    </Card>)}
  </section>;
}

export default function AccountApp() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const path = window.location.pathname.replace(/\/$/, "");
  const refresh = async () => { const result = await accountRequest(); if (mounted.current) setData(result); };
  const run = async task => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setSaved(false);
    try { await task(); } catch (e) { if (mounted.current) { setError(e.message); if (e.status === 401) setData(null); } }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  useEffect(() => {
    mounted.current = true;
    refresh().catch(e => { if (mounted.current && e.status !== 401) setError(e.message); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, []);
  const riding = data?.profile.name && ["/account/ride", "/account/drive"].includes(path);
  if (riding && (path === "/account/ride" || data.application)) return <PilotApp customerUi={path === "/account/ride" ? "rivo" : undefined} driverUi={path === "/account/drive" ? "rivo" : undefined} member/>;
  return <div className="shell"><div className="app pilotApp accountApp"><Header logo right={<Pill>ПРОФИЛ</Pill>}/><main className="content pilotContent">
    {error && <div role="alert" className="pilotError">{error}<button type="button" disabled={busy} onClick={() => run(refresh)}>Опитай отново</button></div>}
    {loading ? <p role="status" className="muted">Възстановяваме профила…</p> : !data ? <Login onSuccess={refresh} run={run} busy={busy}/> : <>
      <div className="accountIdentity"><span className="accountSymbol"><CheckCircle2 size={28}/></span><div><span className="eyebrow">ПОТВЪРДЕН ИМЕЙЛ</span><p>{data.profile.email}</p></div></div>
      {path === "/account/review" ? data.canReview ? <Reviews run={run} busy={busy}/> : <p role="alert">Нямаш достъп до одобренията.</p> : <>
        <h1>{data.profile.name ? `Здравей, ${data.profile.name}.` : "Как да те наричаме?"}</h1>
        <form className="pilotForm" onSubmit={e => { e.preventDefault(); const name = new FormData(e.currentTarget).get("name"); run(async () => { await accountRequest("profile", { name }); await refresh(); setSaved(true); }); }}>
          <label className="pilotField">Твоето име<input key={data.profile.id} name="name" defaultValue={data.profile.name} autoComplete="name" minLength={2} maxLength={80} required disabled={busy}/></label>
          <Button type="submit" disabled={busy}>ЗАПАЗИ ПРОФИЛА</Button>{saved && <p role="status" className="accountSaved">Профилът е запазен.</p>}
        </form>
        {data.profile.name && <><a className="accountLink" href="/account/ride">ПОРЪЧАЙ RIVO<ArrowRight size={20}/></a><p className="pilotNote">Курсовете ти се пазят към профила и се възстановяват след следващо влизане.</p></>}
        <DriverApplication app={data.application} run={run} busy={busy} refresh={refresh}/>
        {data.canReview && <a className="accountLink" href="/account/review"><ShieldCheck size={20}/> ПРЕГЛЕД НА ШОФЬОРИ<ArrowRight size={18}/></a>}
      </>}
      {path !== "/account" && <a className="pilotBack" href="/account">Към профила</a>}
      <button className="accountTextButton" disabled={busy} onClick={() => run(async () => { await signOut(); setData(null); })}><LogOut size={17}/> Изход от профила</button>
    </>}
    <a className="pilotBack" href="/">Към RIVO</a>
  </main></div></div>;
}
