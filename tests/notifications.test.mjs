import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createECDH, randomBytes } from "node:crypto";
import vm from "node:vm";
import { PGlite } from "@electric-sql/pglite";
import { applyDailyOffer, dailyOffer, offerDateKey, offerNotification } from "../shared/daily-offers.js";
import { cleanPushSubscription, createNotificationsHandler } from "../server/notifications-handler.js";

const NOW = new Date("2026-10-17T08:00:00Z");
const token = "a".repeat(64), other = "b".repeat(64), secret = "cron-test-secret";
const ec = createECDH("prime256v1"); ec.generateKeys();
const subscription = { endpoint: "https://web.push.apple.com/test/example", keys: { p256dh: ec.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
let db, sent, errors;
const query = async (statement, parameters) => (await db.query(statement, parameters)).rows;
const handler = (extras = {}) => createNotificationsHandler({ query, publicKey: subscription.keys.p256dh, sendPush: async (value, payload) => sent.push({ value, payload }), cronSecret: secret, production: true, now: () => NOW, reportError: err => errors.push(err.code || err.statusCode || err.name), ...extras });
async function call(action, { method = "GET", token: key = token, data, headers = {}, handle = handler() } = {}) {
  let payload;
  const res = { headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, end(value) { payload = JSON.parse(value); } };
  await handle({ url: `/api/notifications?action=${action}`, method, body: data,
    headers: { host: "rivo.test", origin: "https://rivo.test", "content-type": "application/json", authorization: `Bearer ${key}`, ...headers } }, res);
  return { status: res.statusCode, headers: res.headers, data: payload };
}
const subscribe = (key = token, value = subscription) => call("subscribe", { method: "POST", token: key, data: { subscription: value } });
before(async () => { db = new PGlite(); await db.exec(await readFile(new URL("../server/notifications-schema.sql", import.meta.url), "utf8")); });
beforeEach(async () => { await db.exec("TRUNCATE rivo_push_deliveries, rivo_push_subscriptions"); sent = []; errors = []; });
after(async () => { await db?.close(); });

test("Sofia day and expiry stay correct across summer/winter and DST transitions", () => {
  for (const [input, date, expiry] of [
    ["2026-10-17T21:30:00Z", "2026-10-18", "2026-10-18T21:00:00.000Z"],
    ["2026-12-01T21:30:00Z", "2026-12-01", "2026-12-01T22:00:00.000Z"],
    ["2026-03-28T12:00:00Z", "2026-03-28", "2026-03-28T22:00:00.000Z"],
    ["2026-03-29T12:00:00Z", "2026-03-29", "2026-03-29T21:00:00.000Z"],
    ["2026-10-24T12:00:00Z", "2026-10-24", "2026-10-24T21:00:00.000Z"],
    ["2026-10-25T12:00:00Z", "2026-10-25", "2026-10-25T22:00:00.000Z"]
  ]) { assert.equal(offerDateKey(new Date(input)), date); assert.equal(dailyOffer(new Date(input)).expiresAt, expiry); }
});
test("offer rounds in cents, caps at 2 EUR, and never reapplies a used or expired selection", () => {
  const id = dailyOffer(NOW).id;
  assert.equal(applyDailyOffer({ priceCents: 174 }, id, false, NOW).priceCents, 157);
  assert.equal(applyDailyOffer({ priceCents: 2545 }, id, false, NOW).priceCents, 2345);
  assert.equal(applyDailyOffer({ priceCents: 450 }, id, true, NOW).priceCents, 450);
  assert.equal(applyDailyOffer({ priceCents: 450 }, "daily-2026-10-16", false, NOW).priceCents, 450);
  assert.equal(applyDailyOffer(null, id, false, NOW), null);
});
test("config exposes only public settings and truthfully disables the preview schedule", async () => {
  const response = await call("config", { handle: handler({ production: false }) });
  assert.equal(response.data.available, true); assert.equal(response.data.scheduled, false);
  assert.equal(JSON.stringify(response.data).includes(secret), false);
  const notReady = await call("config", { handle: handler({ sendPush: null }) });
  assert.equal(notReady.data.available, false); assert.equal(notReady.data.publicKey, null);
});
test("subscription persists per capability; other devices cannot inspect or remove it", async () => {
  assert.equal((await subscribe()).status, 200);
  const freshInstance = handler();
  assert.equal((await call("status", { handle: freshInstance })).data.active, true);
  assert.equal((await call("status", { token: other })).data.active, false);
  await call("unsubscribe", { method: "POST", token: other, data: {} });
  assert.equal((await call("status")).data.active, true);
  assert.equal((await subscribe(other)).status, 409);
  const stored = (await db.query("SELECT * FROM rivo_push_subscriptions")).rows[0];
  assert.notEqual(stored.token_hash, token); assert.equal(stored.consent_version, "daily-offers-v1");
});
test("untrusted URLs, malformed keys, cross-origin writes and missing capabilities are rejected", async () => {
  for (const endpoint of ["http://web.push.apple.com/x", "https://localhost/x", "https://web.push.apple.com.attacker.test/x", "https://127.0.0.1/x", "https://user:pass@web.push.apple.com/x", "https://web.push.apple.com:444/x"]) {
    assert.throws(() => cleanPushSubscription({ ...subscription, endpoint }));
  }
  assert.equal((await subscribe(token, { ...subscription, keys: { auth: "bad", p256dh: "bad" } })).status, 400);
  assert.equal((await call("subscribe", { method: "POST", data: { subscription }, headers: { origin: "https://other.test" } })).status, 403);
  assert.equal((await call("subscribe", { method: "POST", data: { subscription }, token: "invalid" })).status, 401);
  assert.equal((await call("subscribe", { method: "POST", data: { subscription }, headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM rivo_push_subscriptions")).rows[0].count, 0);
});
test("test push is bound to the subscription and rate limited", async () => {
  await subscribe();
  assert.equal((await call("test", { method: "POST", data: {} })).status, 200);
  assert.equal(sent.length, 1); assert.equal(sent[0].payload.title, "Тестово известие от RIVO");
  assert.equal((await call("test", { method: "POST", data: {} })).status, 429);
  assert.equal((await call("test", { method: "POST", data: {}, token: other })).status, 429);
  assert.equal(sent.length, 1);
});
test("daily sending requires the cron secret and never sends from Preview", async () => {
  await subscribe();
  assert.equal((await call("dispatch")).status, 401);
  const response = await call("dispatch", { token: secret, handle: handler({ production: false }) });
  assert.equal(response.data.skipped, "preview"); assert.equal(sent.length, 0);
  assert.equal((await call("dispatch", { token: secret, method: "POST" })).status, 405);
});
test("repeated and concurrent daily dispatches send once per recipient per Sofia day", async () => {
  await subscribe();
  await Promise.all([call("dispatch", { token: secret }), call("dispatch", { token: secret })]);
  await call("dispatch", { token: secret });
  assert.equal(sent.length, 1); assert.equal(sent[0].payload.tag, "rivo-daily-2026-10-17");
  assert.equal((await db.query("SELECT status FROM rivo_push_deliveries")).rows[0].status, "sent");
  await call("dispatch", { token: secret, handle: handler({ now: () => new Date("2026-10-18T08:00Z") }) });
  assert.equal(sent.length, 2); assert.deepEqual(errors, []);
});
test("opt-out removes the sender record and prevents subsequent scheduled pushes", async () => {
  await subscribe(); await call("dispatch", { token: secret });
  const response = await call("unsubscribe", { method: "POST", data: {} });
  assert.equal(response.data.active, false);
  await call("dispatch", { token: secret, handle: handler({ now: () => new Date("2026-10-18T08:00Z") }) });
  assert.equal(sent.length, 1);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM rivo_push_deliveries")).rows[0].count, 0);
});
test("expired subscriptions are removed; transient failures have bounded retries", async () => {
  await subscribe();
  const gone = await call("dispatch", { token: secret, handle: handler({ sendPush: async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); } }) });
  assert.equal(gone.data.expired, 1); assert.equal((await call("status")).data.active, false);
  await subscribe();
  const failing = handler({ sendPush: async () => { throw Object.assign(new Error("down"), { statusCode: 503 }); } });
  for (let n = 0; n < 4; n++) await call("dispatch", { token: secret, handle: failing });
  assert.equal((await db.query("SELECT attempts FROM rivo_push_deliveries")).rows[0].attempts, 3);
  assert.equal(errors.length, 3);
});

async function worker() {
  const listeners = {}, shown = [], opened = [];
  const self = { location: { origin: "https://rivo.test" }, addEventListener: (type, fn) => { listeners[type] = fn; },
    registration: { showNotification: async (title, options) => shown.push({ title, options }) },
    clients: { matchAll: async () => [{ url: "https://rivo.test/pilot", focus: async () => { throw new Error("must not reuse pilot"); } }], openWindow: async url => opened.push(url) } };
  vm.runInNewContext(await readFile(new URL("../public/sw.js", import.meta.url), "utf8"), { self, URL, Date, caches: {} });
  async function emit(type, data) { const promises = []; listeners[type]({ ...data, waitUntil: value => promises.push(value) }); await Promise.all(promises); }
  return { emit, shown, opened };
}
test("service worker displays valid unexpired offers with a collapse tag", async () => {
  const value = await worker();
  const payload = offerNotification(new Date());
  await value.emit("push", { data: { json: () => payload } });
  assert.equal(value.shown.length, 1); assert.equal(value.shown[0].options.tag, payload.tag); assert.equal(value.shown[0].options.renotify, false);
});
test("service worker ignores malformed, expired and external push links", async () => {
  const value = await worker(), current = offerNotification(new Date());
  await value.emit("push", { data: { json: () => { throw new Error("not json"); } } });
  for (const payload of [{ ...current, expiresAt: "2020-01-01" }, { ...current, url: "https://other.test/?offer=daily-2026-10-17" }, { ...current, url: "/pilot?offer=daily-2026-10-17" }]) await value.emit("push", { data: { json: () => payload } });
  assert.equal(value.shown.length, 0);
});
test("notification click opens the offer without hijacking the driver pilot or external sites", async () => {
  const value = await worker(); let closed = 0;
  await value.emit("notificationclick", { notification: { close: () => closed++, data: { url: "https://rivo.test/?offer=daily-2026-10-17" } } });
  assert.equal(closed, 1); assert.equal(value.opened[0], "https://rivo.test/?offer=daily-2026-10-17");
  await value.emit("notificationclick", { notification: { close() {}, data: { url: "https://other.test/" } } });
  assert.equal(value.opened.length, 1);
});
