import React, { lazy, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CarFront, CheckCircle2, LogOut, Mail, Pencil, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { Button, Card, Header, Pill } from "../components/UI";
import { accountRequest, sendCode, signOut, verifyCode } from "../services/accountService.js";
import { accountDate } from "../../shared/account-date.js";
import "./pilot.css";
import "./account.css";

const PilotApp = lazy(() => import("./PilotApp.jsx"));
const LABELS = { pending: "Очаква преглед", approved: "Одобрен шофьор", rejected: "Неодобрена кандидатура", suspended: "Достъпът е спрян" };
const VALID = app => app?.status === "approved" && app.permitValidUntil >= accountDate();

function Login({ onSuccess, run, busy, driver = false }) {
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
    <div><span className="eyebrow">{driver ? "КАРАЙ С RIVO" : "ТВОЯТ ПРОФИЛ В RIVO"}</span><h1>{sentTo ? "Провери имейла си." : driver ? "Зад волана.\nС RIVO." : "Влизаш с имейл.\nПътуваш с RIVO."}</h1>
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

function DriverApplication({ app, run, busy, refresh, onSaved }) {
  const [editing, setEditing] = useState(!app);
  const fields = [["legalName", "Име по документи", 80], ["phone", "Телефон за връзка", 20], ["vehicleModel", "Марка и модел", 80], ["vehiclePlate", "Регистрационен номер", 20], ["certificateNumber", "Номер на удостоверение за водач", 80], ["permitNumber", "Номер на разрешение за автомобила", 80]];
  return <section className="accountSection">
    <div className="accountHeading"><CarFront size={23}/><h1>Карай с RIVO</h1></div>
    {app && <Card className="accountStatus"><b>{LABELS[app.status]}</b><p>{app.status === "approved" && !VALID(app) ? "Разрешението е изтекло. Обнови кандидатурата си за нов преглед." : app.status === "pending" ? "Екипът на RIVO ще провери данните и документите ти. Приемането на заявки се отключва след одобрение." : app.status === "approved" ? "Можеш да приемаш заявки за тестови курсове." : "Прегледай бележката и при нужда изпрати обновена кандидатура."}</p>{app.note && <p><strong>Бележка от RIVO:</strong> {app.note}</p>}
      <button type="button" className="accountTextButton" disabled={busy} onClick={() => run(refresh)}><RefreshCw size={16}/> Провери статуса</button>
      <a className="accountLink" href="/account/drive">{VALID(app) ? "КЪМ ЗАЯВКИТЕ" : "КЪМ ШОФЬОРСКИЯ РЕЖИМ"}<ArrowRight size={18}/></a>
      <button type="button" className="accountTextButton" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "Затвори редакцията" : "Промени данните"}</button>
      <label className="accountCheck accountContactConsent"><input type="checkbox" checked={Boolean(app.contactPhoneShared)} disabled={busy} onChange={event => {
        const sharePhone = event.currentTarget.checked;
        run(async () => { const result = await accountRequest("contact-consent", { sharePhone }); onSaved(result.application); });
      }}/><span>Позволявам служебният ми телефон да се вижда само от пътника по моя приет активен курс. Мога да го изключа по всяко време.</span></label>
    </Card>}
    {editing && <form className="pilotForm" onSubmit={e => {
      e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget));
      run(async () => { const result = await accountRequest("apply", { ...data, licensed: data.licensed === "on", sharePhone: data.sharePhone === "on" }); onSaved(result.application); setEditing(false); });
    }}>
      <p className="muted">За действащи лицензирани таксиметрови шофьори със собствен автомобил в Перник.</p>
      {fields.map(([key, label, max]) => <label key={key} className="pilotField">{label}<input name={key} required minLength={2} maxLength={max} type={key === "phone" ? "tel" : "text"} autoComplete={key === "phone" ? "tel" : "off"} defaultValue={app?.[key] || ""} disabled={busy}/></label>)}
      <label className="pilotField">Разрешението е валидно до<input type="date" name="permitValidUntil" min={accountDate()} defaultValue={app?.permitValidUntil || ""} required disabled={busy}/></label>
      <label className="accountCheck"><input type="checkbox" name="licensed" required disabled={busy}/><span>Потвърждавам, че съм действащ лицензиран таксиметров шофьор и посоченият автомобил има валидно разрешение.</span></label>
      <label className="accountCheck"><input type="checkbox" name="sharePhone" defaultChecked={Boolean(app?.contactPhoneShared)} disabled={busy}/><span>Съгласявам се служебният ми телефон да се вижда само от пътника по приет активен курс. Мога да оттегля съгласието по всяко време.</span></label>
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

function NameForm({ profile, busy, onSave, first = false }) {
  return <form className="pilotForm" onSubmit={event => {
    event.preventDefault(); onSave(new FormData(event.currentTarget).get("name"));
  }}>
    <label className="pilotField">Твоето име<input key={`${profile.id}:${profile.name}`} name="name" defaultValue={profile.name} autoComplete="name" minLength={2} maxLength={80} required disabled={busy} placeholder="Как да те наричаме?"/></label>
    <Button type="submit" disabled={busy}>{busy ? "ЗАПАЗВАМЕ…" : first ? "ЗАПАЗИ И ПРОДЪЛЖИ" : "ЗАПАЗИ ПРОФИЛА"}</Button>
  </form>;
}

function ProfileHome({ data, run, busy, saveName, saved }) {
  const [editing, setEditing] = useState(false);
  return <>
    <div><span className="eyebrow">ТВОЯТ RIVO</span><h1>Здравей, {data.profile.name}.</h1><p className="muted">Накъде днес?</p></div>
    <a className="accountLink" href="/account/ride">ПОРЪЧАЙ RIVO<ArrowRight size={20}/></a>
    <p className="pilotNote">Курсовете ти се пазят към профила и се възстановяват след следващо влизане.</p>
    <Card className="accountProfileCard"><div className="accountHeading"><UserRound size={22}/><h2>Моят профил</h2></div>
      <div className="accountVerified"><CheckCircle2 size={16}/><span>{data.profile.email}</span></div>
      <button className="accountTextButton" type="button" disabled={busy} aria-expanded={editing} aria-controls="account-name-editor" onClick={() => setEditing(value => !value)}><Pencil size={16}/>{editing ? "Затвори редакцията" : "Редактирай името"}</button>
      {editing && <div id="account-name-editor"><NameForm profile={data.profile} busy={busy} onSave={name => run(async () => { await saveName(name); setEditing(false); })}/></div>}
      {saved && <p className="accountSaved" role="status">Профилът е запазен.</p>}
    </Card>
    <a className="accountOption" href="/account/driver-application"><CarFront size={25}/><span><b>Карай с RIVO</b><small>{data.application ? LABELS[data.application.status] : "Кандидатствай със своя таксиметров автомобил"}</small></span><ArrowRight size={18}/></a>
    {data.application && <a className="accountOption" href="/account/drive"><CarFront size={25}/><span><b>Шофьорски режим</b><small>{VALID(data.application) ? "Към твоите заявки" : "Приетите курсове и статусът на достъпа"}</small></span><ArrowRight size={18}/></a>}
    {data.canReview && <a className="accountOption" href="/account/review"><ShieldCheck size={25}/><span><b>ПРЕГЛЕД НА ШОФЬОРИ</b><small>Кандидатури и решения на RIVO</small></span><ArrowRight size={18}/></a>}
  </>;
}

export default function AccountApp() {
  const [data, setData] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reloadAuth, setReloadAuth] = useState(false);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const version = useRef(0);
  const path = window.location.pathname.replace(/\/$/, "");
  const refresh = useCallback(async signal => {
    const request = ++version.current;
    try {
      const result = await accountRequest("profile", undefined, { signal });
      if (!mounted.current || signal?.aborted || request !== version.current) return null;
      setData(result); setLoadState("ready"); return result;
    } catch (problem) {
      if (!mounted.current || signal?.aborted || request !== version.current) return null;
      if (problem.status === 401) { setData(null); setLoadState("signedOut"); return null; }
      throw problem;
    }
  }, []);
  const run = useCallback(async task => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setReloadAuth(false); setSaved(false);
    try { await task(); } catch (e) { if (mounted.current) { setError(e.message); setReloadAuth(e.code === "AUTH_LOAD_FAILED"); if (e.status === 401) { version.current++; setData(null); setLoadState("signedOut"); } } }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    refresh(controller.signal).catch(e => { if (mounted.current && !controller.signal.aborted) { setError(e.message); setLoadState("unavailable"); } });
    return () => { mounted.current = false; version.current++; controller.abort(); };
  }, [refresh]);
  const saveName = async name => {
    const result = await accountRequest("profile", { name });
    if (mounted.current) { version.current++; setData(previous => previous ? { ...previous, profile: result.profile } : previous); setSaved(true); }
  };
  const completeSignIn = async () => {
    setLoadState("loading");
    try { if (!await refresh()) throw new Error("Входът не беше запазен. Опитай отново."); }
    catch (problem) { if (mounted.current) setLoadState("unavailable"); throw problem; }
  };
  const applicationSaved = application => { if (mounted.current) { version.current++; setData(previous => previous ? { ...previous, application } : previous); } };
  const riding = data?.profile.name && ["/account/ride", "/account/drive"].includes(path);
  if (riding && (path === "/account/ride" || data.application)) return <PilotApp customerUi={path === "/account/ride" ? "rivo" : undefined} driverUi={path === "/account/drive" ? "rivo" : undefined} member/>;
  return <div className="shell"><div className="app pilotApp accountApp"><Header logo right={<Pill>ПРОФИЛ</Pill>}/><main className="content pilotContent">
    {error && loadState !== "unavailable" && <div role="alert" className="pilotError">{error}{reloadAuth && <button type="button" onClick={() => window.location.reload()}>Обнови страницата</button>}</div>}
    {loadState === "loading" ? <p role="status" className="muted">Възстановяваме профила…</p> : loadState === "unavailable" ? <Card className="accountConnection"><RefreshCw size={28}/><h1>Да възстановим връзката.</h1><p role="alert" className="muted">{error || "Профилът временно не е достъпен."}</p><Button disabled={busy} onClick={() => run(refresh)}>{busy ? "СВЪРЗВАМЕ СЕ…" : "ОПИТАЙ ОТНОВО"}</Button></Card> : !data ? <Login driver={["/account/drive", "/account/driver-application"].includes(path)} onSuccess={completeSignIn} run={run} busy={busy}/> : <>
      {!data.profile.name ? <>
        <div className="accountIdentity"><span className="accountSymbol"><CheckCircle2 size={28}/></span><div><span className="eyebrow">ПОТВЪРДЕН ИМЕЙЛ</span><p>{data.profile.email}</p></div></div>
        <h1>Как да те наричаме?</h1><p className="muted">Това име ще се показва в твоите курсове.</p>
        <NameForm first profile={data.profile} busy={busy} onSave={name => run(() => saveName(name))}/>
      </> : path === "/account/review" ? data.canReview ? <Reviews run={run} busy={busy}/> : <p role="alert">Нямаш достъп до одобренията.</p> : path === "/account/driver-application" || path === "/account/drive" && !data.application ? <DriverApplication app={data.application} run={run} busy={busy} refresh={refresh} onSaved={applicationSaved}/> : <ProfileHome data={data} run={run} busy={busy} saveName={saveName} saved={saved}/>}
      {path !== "/account" && <a className="pilotBack" href="/account">Към профила</a>}
      <button className="accountTextButton" disabled={busy} onClick={() => run(async () => { await signOut(); version.current++; setData(null); setLoadState("signedOut"); })}><LogOut size={17}/> Изход от профила</button>
    </>}
    <a className="pilotBack" href="/">Към RIVO</a>
  </main></div></div>;
}
