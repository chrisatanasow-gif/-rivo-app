import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import { PGlite } from "@electric-sql/pglite";
import { createRideAlerts, sessionHash } from "../server/ride-alerts.js";
import { createPilotHandler } from "../server/pilot-handler.js";
import { memberQuery } from "../server/member-query.js";

let db, alerts, handler, identities, sent, failures;
const query = async (sql, parameters = []) => (await db.query(sql, parameters)).rows;
const req = (cookie, path = "") => ({ headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json", cookie }, url: path });
async function call(person, action, body, extra = {}) {
  let data; const headers = {};
  const request = { ...req(person?.cookie || "", `/api/member-rides?role=${person?.role || "driver"}&action=${action}`), method: body === undefined ? "GET" : "POST", body, ...extra };
  const response = { statusCode: 200, setHeader: (k,v) => { headers[k] = v; }, end: value => { data = JSON.parse(value); } };
  await handler(request, response);
  return { status: response.statusCode, data, headers };
}
async function person(role, approved = true, accountId = randomUUID()) {
  await query("INSERT INTO rivo_accounts(id,auth_subject,email,display_name) VALUES ($1,$2,$3,'Тест') ON CONFLICT DO NOTHING", [accountId, randomUUID(), `${randomUUID()}@example.invalid`]);
  const id = randomUUID(), cookie = `__Secure-neon-auth.session_token=${randomUUID()}`;
  const [row] = await query(`INSERT INTO rivo_member_sessions(id,token_hash,gate_hash,role,display_name,expires_at,account_id) VALUES ($1,$2,'test',$3,'Тест','2000-01-01',$4) RETURNING *`, [id,randomUUID(),role,accountId]);
  if (role === "driver") await query(`INSERT INTO rivo_driver_applications(account_id,status,legal_name,phone,vehicle_model,vehicle_plate,certificate_number,permit_number,permit_valid_until)
    VALUES ($1,$2,'Тест','+359888000000','Test','TEST','TEST','TEST','2027-12-31')`, [accountId,approved ? "approved" : "pending"]);
  const identity = { ...row, cookie, auth_session_hash: sessionHash(req(cookie)), auth_expires_at: new Date(Date.now()+3600000).toISOString() };
  identities.set(cookie,identity); return identity;
}
async function goOnline(driver) {
  const presence = (await call(driver,"state")).data.presence;
  const response = await call(driver,"presence",{command:"online",revision:presence.revision,leaseId:randomUUID()});
  assert.equal(response.status,200); return response.data.presence;
}
function subscription(id = randomUUID()) {
  const key = Buffer.alloc(65,1); key[0]=4;
  return { endpoint:`https://fcm.googleapis.com/fcm/send/${id}`, keys:{p256dh:key.toString("base64url"),auth:Buffer.alloc(16,1).toString("base64url")} };
}
async function subscribe(who, sub = subscription()) {
  assert.equal((await call(who,"notification-subscription",{command:"subscribe",subscription:sub})).status,200);
  return sub;
}
async function create(customer, key = randomUUID()) {
  const draft = { pickup:{label:"Център, Перник",lat:42.6052,lng:23.0379},destination:{label:"Изток, Перник",lat:42.6048,lng:23.0422},passengers:1,idempotencyKey:key };
  const quote = await call(customer,"quote",draft);
  return call(customer,"create",{...draft,quoteToken:quote.data.quote.token});
}
const change = (who,ride,command) => call(who,"transition",{rideId:ride.id,command});
const check = (who, push) => call(who,`notification-check&eventId=${push.eventId}&deviceId=${push.deviceId}`);

before(async () => {
  db = new PGlite();
  for (const name of ["pilot","accounts","ride-alerts"]) await db.exec(await readFile(new URL(`../server/${name}-schema.sql`,import.meta.url),"utf8"));
});
beforeEach(async () => {
  await db.exec("TRUNCATE rivo_accounts CASCADE"); identities = new Map(); sent=[]; failures=[];
  alerts = createRideAlerts({query,publicKey:"test-public-key",sendPush:async (sub,payload) => { sent.push({sub,payload}); if (failures.length) throw failures.shift(); },reportError:()=>{}});
  handler = createPilotHandler({query:memberQuery(query),rideAlerts:alerts,resolveParticipant:async request => {
    const who = identities.get(request.headers.cookie); if (!who) return null;
    const [app] = await query("SELECT status, permit_valid_until >= (now() AT TIME ZONE 'Europe/Sofia')::date AS valid FROM rivo_driver_applications WHERE account_id=$1",[who.account_id]);
    return {...who,can_accept:who.role==="driver" && app?.status==="approved" && app.valid};
  },resolveRoute:async()=>({distanceMeters:1800,durationSeconds:300,routeSource:"test-fixture"}),reportError:e=>{throw e;}});
});
after(async()=>db.close());

test("additive migration can be repeated with dollar-quoted functions intact",async()=>{
  const schema=await readFile(new URL("../server/ride-alerts-schema.sql",import.meta.url),"utf8");
  const statements=schema.replace(/^--.*$/gm,"").match(/(?:\$\$[\s\S]*?\$\$|[^;])+/g).map(x=>x.trim()).filter(Boolean);
  for(const statement of statements) await db.exec(statement);
  assert.equal((await query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='rivo_member_driver_availability'"))[0].n,1);
});
test("offline, pending and expired drivers cannot list or accept; online can",async()=>{
  const customer=await person("customer"),driver=await person("driver"),pending=await person("driver",false);
  const ride=(await create(customer)).data.ride;
  assert.equal((await call(driver,"state")).data.requests.length,0);
  assert.equal((await change(driver,ride,"accept")).status,409);
  assert.equal((await call(pending,"presence",{command:"online",revision:0,leaseId:randomUUID()})).status,403);
  await goOnline(driver); assert.equal((await call(driver,"state")).data.requests[0].id,ride.id);
  await query("UPDATE rivo_driver_presence SET expires_at=now()-interval '1 second'");
  assert.equal((await call(driver,"state")).data.requests.length,0);
  assert.equal((await change(driver,ride,"accept")).status,409);
  await goOnline(driver); assert.equal((await change(driver,ride,"accept")).status,200);
});
test("late heartbeats and stale online revisions cannot revive offline shifts",async()=>{
  const driver=await person("driver"),p=await goOnline(driver);
  assert.equal((await call(driver,"presence",{command:"heartbeat",leaseId:p.leaseId})).status,200);
  assert.equal((await call(driver,"presence",{command:"offline",leaseId:p.leaseId})).data.presence.online,false);
  assert.equal((await call(driver,"presence",{command:"heartbeat",leaseId:p.leaseId})).status,409);
  assert.equal((await call(driver,"presence",{command:"online",revision:p.revision,leaseId:randomUUID()})).status,409);
  const p2=await goOnline(driver);
  assert.equal((await call(driver,"presence",{command:"offline",leaseId:p.leaseId})).status,409);
  assert.equal((await call(driver,"state")).data.presence.leaseId,p2.leaseId);
});
test("offline during assigned ride keeps arrive/start/complete; suspension stops new work",async()=>{
  const customer=await person("customer"),driver=await person("driver"),p=await goOnline(driver),ride=(await create(customer)).data.ride;
  assert.equal((await change(driver,ride,"accept")).status,200);
  await call(driver,"presence",{command:"offline",leaseId:p.leaseId});
  await query("UPDATE rivo_driver_applications SET status='suspended' WHERE account_id=$1",[driver.account_id]);
  for(const command of ["arrive","start","complete"]) assert.equal((await change(driver,ride,command)).status,200);
  assert.equal((await call(driver,"state")).data.presence.online,false);
  assert.equal((await call(driver,"presence",{command:"online",revision:2,leaseId:randomUUID()})).status,403);
});
test("database trigger also blocks an older member handler without availability code",async()=>{
  const customer=await person("customer"),driver=await person("driver"),ride=(await create(customer)).data.ride;
  await assert.rejects(query("UPDATE rivo_member_rides SET status='accepted',driver_id=$2 WHERE id=$1",[ride.id,driver.id]),e=>e.code==="P0001");
});
test("events are committed with rides, scoped to eligible drivers, idempotent create never repeats",async()=>{
  const customer=await person("customer"),driver=await person("driver"),other=await person("driver"),key=randomUUID();
  await subscribe(driver); await subscribe(other); await goOnline(driver);
  const ride=(await create(customer,key)).data.ride;
  assert.equal((await create(customer,key)).data.ride.id,ride.id);
  assert.equal((await query("SELECT count(*)::int AS n FROM rivo_ride_events"))[0].n,1);
  await Promise.all([alerts.dispatch(),alerts.dispatch()]);
  assert.equal(sent.length,1); assert.equal(sent[0].payload.role,"driver");
  assert.equal((await check(driver,sent[0].payload)).data.notification.eventId,sent[0].payload.eventId);
  assert.equal((await check(other,sent[0].payload)).data.notification,null);
  assert.equal((await check(null,sent[0].payload)).status,401);
  assert.ok(!JSON.stringify(sent[0].payload).includes("Център"));
});
test("customer status alerts match latest revision; late accepted alert is suppressed",async()=>{
  const customer=await person("customer"),driver=await person("driver");
  await subscribe(customer); await goOnline(driver); const ride=(await create(customer)).data.ride;
  await change(driver,ride,"accept"); await alerts.dispatch(); const accepted=sent[0].payload;
  assert.equal(accepted.title,"Шофьорът прие");
  await change(driver,ride,"arrive");
  assert.equal((await check(customer,accepted)).data.notification,null);
  await alerts.dispatch(); assert.equal(sent.at(-1).payload.title,"Шофьорът пристигна");
  await change(driver,ride,"cancel"); await alerts.dispatch(); assert.equal(sent.at(-1).payload.title,"Курсът е отказан");
});
test("opt-out and session sign-out revoke pending sends, display checks and availability",async()=>{
  const customer=await person("customer"),driver=await person("driver"),sub=await subscribe(driver);
  await goOnline(driver); await create(customer); await alerts.dispatch(); const incoming=sent[0].payload;
  await call(driver,"notification-subscription",{command:"unsubscribe",endpoint:sub.endpoint});
  assert.equal((await check(driver,incoming)).data.notification,null);
  await subscribe(driver,sub); await alerts.revoke(req(driver.cookie)); await alerts.dispatch();
  assert.equal(sent.length,1);
  assert.equal((await call(driver,"state")).data.presence.online,false);
  assert.equal((await query("SELECT count(*)::int AS n FROM rivo_ride_subscriptions"))[0].n,0);
});
test("provider failures retry durably without duplicate claims; expired endpoints are removed",async()=>{
  const customer=await person("customer"),driver=await person("driver");
  await subscribe(driver); await goOnline(driver); await create(customer);
  failures.push({statusCode:503}); await alerts.dispatch(); await alerts.dispatch(); assert.equal(sent.length,1);
  await query("UPDATE rivo_ride_deliveries SET retry_at=now()-interval '1 second'");
  await Promise.all([alerts.dispatch(),alerts.dispatch()]); assert.equal(sent.length,2);
  assert.equal(sent[0].payload.tag,sent[1].payload.tag);
  assert.equal((await query("SELECT attempts,status FROM rivo_ride_deliveries"))[0].status,"sent");
  const customer2=await person("customer"); await create(customer2); failures.push({statusCode:410}); await alerts.dispatch();
  assert.equal((await query("SELECT count(*)::int AS n FROM rivo_ride_subscriptions"))[0].n,0);
});
test("stale, busy, suspended, own-account and expired-session notifications are suppressed",async()=>{
  const customer=await person("customer"),driver=await person("driver");
  await subscribe(driver); const p=await goOnline(driver); const ride=(await create(customer)).data.ride;
  await call(driver,"presence",{command:"offline",leaseId:p.leaseId}); await alerts.dispatch(); assert.equal(sent.length,0);
  await goOnline(driver); await change(driver,ride,"accept"); await alerts.dispatch(); assert.equal(sent.length,0);
  const another=await person("customer"); await create(another);
  assert.equal((await query("SELECT count(*)::int AS n FROM rivo_ride_events WHERE kind='request'"))[0].n,1);
  await change(driver,ride,"cancel"); await query("UPDATE rivo_ride_subscriptions SET auth_expires_at=now()-interval '1 second'");
  await alerts.dispatch(); assert.equal(sent.length,0);
});
test("push subscriptions reject SSRF, cross-origin and unowned opt-outs",async()=>{
  const driver=await person("driver"),other=await person("driver"),sub=await subscribe(driver);
  assert.equal((await call(other,"notification-subscription",{command:"unsubscribe",endpoint:sub.endpoint})).status,200);
  assert.equal((await query("SELECT count(*)::int AS n FROM rivo_ride_subscriptions"))[0].n,1);
  for(const endpoint of ["http://127.0.0.1/","https://example.org/","https://fcm.googleapis.com.evil.test/"])
    assert.equal((await call(driver,"notification-subscription",{command:"subscribe",subscription:{...sub,endpoint}})).status,400);
  assert.equal((await call(driver,"presence",{command:"online"},{headers:{...req(driver.cookie).headers,origin:"https://evil.test"}})).status,403);
});

test("service worker confirms live ownership/status before showing, validates click targets",async()=>{
  const handlers={},shown=[],opened=[];
  let notification, ok=true, path;
  const self={location:{origin:"https://rivo.test"},addEventListener:(event,fn)=>{handlers[event]=fn;},registration:{showNotification:async(title,options)=>shown.push({title,...options})},clients:{matchAll:async()=>[],openWindow:async value=>opened.push(value)}};
  runInNewContext(await readFile(new URL("../public/sw.js",import.meta.url),"utf8"),{self,URL,Date,AbortSignal,fetch:async url=>{path=url;return {ok,json:async()=>({notification})};}});
  const payload={type:"ride",title:"Шофьорът пристигна",body:"Отвори RIVO",eventId:"10",deviceId:randomUUID(),role:"customer",tag:"rivo-ride-10",expiresAt:new Date(Date.now()+60000).toISOString(),url:`/account/ride?ride=${randomUUID()}`};
  async function push(value){let pending;handlers.push({data:{json:()=>value},waitUntil:value=>{pending=value;}});await pending;}
  notification=payload; await push(payload); assert.equal(shown.length,1);assert.ok(path.includes("notification-check"));
  notification=null;await push(payload);ok=false;await push(payload);assert.equal(shown.length,1);
  ok=true;notification=payload;await push({...payload,url:"https://evil.test/account/ride"});assert.equal(shown.length,1);
  let pending;handlers.notificationclick({notification:{close(){},data:{url:`https://rivo.test${payload.url}`}},waitUntil:value=>{pending=value;}});await pending;
  assert.equal(opened[0],`https://rivo.test${payload.url}`);
});
