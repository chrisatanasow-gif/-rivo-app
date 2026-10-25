import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createAuthHandler, createAuthTransport, createIdentityResolver } from "../server/account-auth.js";
import { createAccounts } from "../server/accounts.js";
import { createPilotHandler } from "../server/pilot-handler.js";
import { authFixture } from "./helpers/auth-fixture.mjs";
import { memberQuery } from "../server/member-query.js";
import { createRideAlerts } from "../server/ride-alerts.js";

let db, provider, auth, accounts, rides, legacy;
const query = async (sql, params) => (await db.query(sql, params)).rows;
const request = async (handler, path, body, cookie = "", extra = {}) => {
  let output; const headers = {};
  const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: value => { output = JSON.parse(value); } };
  await handler({ url: path, method: body === undefined ? "GET" : "POST", body, headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json", cookie, ...extra }, socket: { remoteAddress: "127.0.0.1" } }, res);
  return { status: res.statusCode, data: output, headers };
};
const authReq = (action, body, cookie, headers) => request(auth, `/api/auth/${action}`, body, cookie, headers);
const accountReq = (action, body, cookie) => request(accounts.handle, `/api/account?action=${action}`, body, cookie);
const rideReq = (role, action, body, cookie, handler = rides) => request(handler, `/api/member-rides?role=${role}&action=${action}`, body, cookie);
async function login(email = "customer@example.invalid") {
  assert.equal((await authReq("email-otp/send-verification-otp", { email })).status, 200);
  const response = await authReq("sign-in/email-otp", { email, otp: "123456" });
  assert.equal(response.status, 200);
  return response.headers["set-cookie"][0].split(";")[0];
}
async function named(email, name = "Пътник Тест") { const cookie = await login(email); assert.equal((await accountReq("profile", { name }, cookie)).status, 200); return cookie; }
const draft = () => ({ idempotencyKey: randomUUID(), pickup: { label: "Център, Перник", lat: 42.6052, lng: 23.0379 }, destination: { label: "Изток, Перник", lat: 42.6048, lng: 23.0422 }, passengers: 1 });
async function createRide(cookie, handler = rides) { const body = draft(); const quote = await rideReq("customer", "quote", body, cookie, handler); assert.equal(quote.status, 200); return rideReq("customer", "create", { ...body, quoteToken: quote.data.quote.token }, cookie, handler); }
const application = () => ({ legalName: "Шофьор Тест", phone: "+359888123456", vehicleModel: "Тестов автомобил", vehiclePlate: "PK 1234 AA", certificateNumber: "TEST-CERT-123", permitNumber: "TEST-PERMIT-123", permitValidUntil: "2027-12-31", licensed: true });
async function apply(cookie) { const response = await accountReq("apply", application(), cookie); assert.equal(response.status, 200); return response.data.application; }
async function review(owner, app, status = "approved", extra = {}) { return accountReq("review", { accountId: app.accountId, revision: app.revision, status, documentsChecked: true, note: "Проверени тестови документи", ...extra }, owner); }
async function online(cookie) {
  const state = await rideReq("driver", "state", undefined, cookie);
  const response = await rideReq("driver", "presence", { command: "online", revision: state.data.presence.revision, leaseId: randomUUID() }, cookie);
  assert.equal(response.status, 200);
}

before(async () => {
  db = new PGlite();
  for (const name of ["pilot", "accounts", "ride-alerts"]) await db.exec(await readFile(new URL(`../server/${name}-schema.sql`, import.meta.url), "utf8"));
});
beforeEach(async () => {
  await db.exec("TRUNCATE rivo_driver_reviews, rivo_driver_applications, rivo_member_quotes, rivo_member_rides, rivo_member_sessions, rivo_accounts, rivo_account_limits, rivo_pilot_quotes, rivo_pilot_rides, rivo_pilot_sessions, rivo_pilot_login_attempts CASCADE");
  provider = authFixture();
  const transport = createAuthTransport({ baseUrl: "https://ep-test.neonauth.eu-central-1.aws.neon.tech/rivo_pilot/auth", fetcher: provider.fetcher });
  accounts = createAccounts({ query, resolveIdentity: createIdentityResolver({ transport }), reviewerEmails: ["reviewer@example.invalid"] });
  const options = { query, resolveRoute: async () => ({ distanceMeters: 5000, durationSeconds: 600, routeSource: "test-fixture" }), reportError: e => { throw e; } };
  const rideAlerts = createRideAlerts({ query, publicKey: "test-key", sendPush: async () => {} });
  auth = createAuthHandler({ query, transport, beforeSignOut: rideAlerts.revoke, rateSecret: "local-test-rate-secret-with-at-least-32-characters", reportError: e => { throw e; } });
  rides = createPilotHandler({ ...options, query: memberQuery(query), resolveParticipant: accounts.participantFor, rideAlerts });
  legacy = createPilotHandler({ ...options, accessCode: "local-test-invitation", secureCookies: false });
});
after(async () => { await db?.close(); });

test("email OTP uses host-only HttpOnly cookies and never returns provider tokens", async () => {
  await authReq("email-otp/send-verification-otp", { email: "customer@example.invalid", type: "forget-password", role: "admin" });
  assert.equal(provider.lastRequest.body.type, "sign-in");
  assert.equal((await authReq("sign-in/email-otp", { email: "customer@example.invalid", otp: "000000" })).status, 400);
  const response = await authReq("sign-in/email-otp", { email: "customer@example.invalid", otp: "123456" });
  assert.deepEqual(response.data, { success: true });
  const cookie = response.headers["set-cookie"][0];
  assert.ok(cookie.includes("HttpOnly") && cookie.includes("Secure") && cookie.includes("SameSite=Lax"));
  assert.ok(!cookie.includes("Domain=") && !cookie.includes("Partitioned"));
  assert.equal((await authReq("sign-in/email-otp", { email: "customer@example.invalid", otp: "123456" })).status, 400);
  const token = cookie.split(";")[0];
  const session = await authReq("get-session", undefined, `${token}; vercel_secret=do-not-forward; __Secure-neon-auth.local.session_data=forged`);
  assert.deepEqual(Object.keys(session.data), ["user"]);
  assert.equal(provider.lastRequest.headers.Cookie, token);
  await authReq("sign-out", {}, token);
  assert.equal((await accountReq("profile", undefined, token)).status, 401);
});

test("auth rejects cross-origin/missing-origin mutation, unknown routes and invalid input", async () => {
  for (const origin of ["https://evil.example", "null", ""]) assert.equal((await authReq("sign-out", {}, "", { origin })).status, 403);
  for (const path of ["sign-up/email", "admin/list-users", "email-otp/get-verification-otp", "../sign-in/email-otp"]) assert.equal((await authReq(path, {})).status, 404);
  assert.equal((await authReq("email-otp/send-verification-otp", { email: "bad" })).status, 400);
  assert.equal((await authReq("sign-in/email-otp", { email: "a@example.invalid", otp: "12345" })).status, 400);
});

test("Vercel's explicit auth rewrite preserves the OTP/session contract", async () => {
  const email = "rewrite@example.invalid";
  const sent = await request(auth, "/api/auth?authPath=email-otp%2Fsend-verification-otp", { email });
  assert.equal(sent.status, 200);
  const verified = await request(auth, "/api/auth?authPath=sign-in%2Femail-otp", { email, otp: "123456" });
  assert.equal(verified.status, 200);
  const cookie = verified.headers["set-cookie"][0].split(";")[0];
  assert.equal((await request(auth, "/api/auth?authPath=get-session", undefined, cookie)).data.user.email, email);
  assert.equal((await request(auth, "/api/auth?authPath=admin%2Flist-users", {}, cookie)).status, 404);
});

test("OTP sends are atomically cooled down and verification limits persist in SQL", async () => {
  const email = "limit@example.invalid";
  const sent = await Promise.all([authReq("email-otp/send-verification-otp", { email }), authReq("email-otp/send-verification-otp", { email })]);
  assert.deepEqual(sent.map(x => x.status).sort(), [200, 429]);
  for (let i = 0; i < 20; i++) assert.equal((await authReq("sign-in/email-otp", { email, otp: "000000" })).status, 400);
  assert.equal((await authReq("sign-in/email-otp", { email, otp: "123456" })).status, 429);
  const limits = await query("SELECT key_hash FROM rivo_account_limits", []);
  assert.ok(limits.every(x => /^[a-f0-9]{64}$/.test(x.key_hash)));
});

test("only verified, live provider sessions resolve an account", async () => {
  const cookie = await login();
  const user = provider.users.get("customer@example.invalid");
  user.emailVerified = false;
  assert.equal((await accountReq("profile", undefined, cookie)).status, 401);
  user.emailVerified = true; user.banned = true;
  assert.equal((await accountReq("profile", undefined, cookie)).status, 401);
  user.banned = false;
  assert.equal((await accountReq("profile", undefined, cookie)).status, 200);
  for (const session of provider.sessions.values()) session.session.expiresAt = new Date(0).toISOString();
  assert.equal((await accountReq("profile", undefined, cookie)).status, 401);
  assert.equal((await accountReq("profile", undefined, "__Secure-neon-auth.local.session_data=forged")).status, 401);
});

test("permanent participant and active/history survive sign-out and a new browser session", async () => {
  const cookie = await named("customer@example.invalid", "Крис Тест");
  const before = await rideReq("customer", "session", undefined, cookie);
  const created = await createRide(cookie);
  assert.equal(created.status, 201);
  await authReq("sign-out", {}, cookie);
  assert.equal((await rideReq("customer", "state", undefined, cookie)).status, 401);
  await query("UPDATE rivo_account_limits SET last_at = now() - interval '2 minutes'", []);
  const newCookie = await login();
  const state = (await rideReq("customer", "state", undefined, newCookie)).data;
  assert.equal(state.participant.id, before.data.participant.id);
  assert.equal(state.participant.name, "Крис Тест");
  assert.equal(state.activeRide.id, created.data.ride.id);
  await rideReq("customer", "transition", { rideId: created.data.ride.id, command: "cancel" }, newCookie);
  assert.equal((await rideReq("customer", "state", undefined, newCookie)).data.rides[0].status, "cancelled");
  const other = await named("other@example.invalid");
  assert.deepEqual((await rideReq("customer", "state", undefined, other)).data.rides, []);
});

test("pending drivers cannot see or accept rides; approval unlocks a complete course", async () => {
  const customer = await named("customer@example.invalid"), driver = await named("driver@example.invalid", "Шофьор Тест"), owner = await named("reviewer@example.invalid", "Екип Тест");
  const id = (await createRide(customer)).data.ride.id;
  const app = await apply(driver);
  assert.deepEqual((await rideReq("driver", "state", undefined, driver)).data.requests, []);
  assert.equal((await rideReq("driver", "transition", { rideId: id, command: "accept" }, driver)).status, 409);
  assert.equal((await review(driver, app)).status, 403);
  assert.equal((await accountReq("applications", undefined, driver)).status, 403);
  assert.equal((await review(owner, app, "approved", { documentsChecked: false })).status, 400);
  assert.equal((await review(owner, app)).status, 200);
  await online(driver);
  assert.equal((await rideReq("driver", "state", undefined, driver)).data.requests[0].id, id);
  for (const command of ["accept", "arrive", "start", "complete"]) assert.equal((await rideReq("driver", "transition", { rideId: id, command }, driver)).status, 200);
  const state = (await rideReq("customer", "state", undefined, customer)).data;
  assert.equal(state.rides[0].status, "completed"); assert.equal(state.rides[0].priceCents, 450);
  assert.equal((await query("SELECT count(*)::int AS n FROM rivo_driver_reviews", []))[0].n, 1);
});

test("approval revision, self-review, expiry and resubmission cannot bypass the gate", async () => {
  const driver = await named("driver@example.invalid"), owner = await named("reviewer@example.invalid");
  let app = await apply(driver);
  assert.equal((await review(owner, app)).status, 200);
  assert.equal((await review(owner, app)).status, 409);
  app = await apply(driver);
  assert.equal(app.status, "pending");
  assert.equal((await rideReq("driver", "state", undefined, driver)).data.participant.canAccept, false);
  await query("UPDATE rivo_driver_applications SET permit_valid_until = '2000-01-01' WHERE account_id = $1", [app.accountId]);
  assert.equal((await review(owner, app)).status, 409);
  const ownApp = await apply(owner);
  assert.equal((await review(owner, ownApp)).status, 403);
});

test("revocation blocks new rides atomically but lets the assigned driver finish", async () => {
  const customer = await named("customer@example.invalid"), driver = await named("driver@example.invalid"), owner = await named("reviewer@example.invalid");
  let app = await apply(driver); app = (await review(owner, app)).data.application;
  await online(driver);
  let id = (await createRide(customer)).data.ride.id;
  await rideReq("driver", "transition", { rideId: id, command: "accept" }, driver);
  assert.equal((await accountReq("apply", application(), driver)).status, 409);
  assert.equal((await review(owner, app, "suspended")).status, 200);
  for (const command of ["arrive", "start", "complete"]) assert.equal((await rideReq("driver", "transition", { rideId: id, command }, driver)).status, 200);
  id = (await createRide(customer)).data.ride.id;
  assert.equal((await rideReq("driver", "transition", { rideId: id, command: "accept" }, driver)).status, 409);
});

test("invitation drivers and account requests are isolated in both queue and atomic accept", async () => {
  const customer = await named("customer@example.invalid"), driver = await named("driver@example.invalid"), owner = await named("reviewer@example.invalid");
  const app = await apply(driver); await review(owner, app);
  await online(driver);
  const old = async role => {
    const r = await request(legacy, "/api/pilot?action=login", { code: "local-test-invitation", role, name: "Стар тест", vehicleModel: "Тестова кола", vehiclePlate: "TEST" });
    return r.headers["set-cookie"].split(";")[0];
  };
  const oldCustomer = await old("customer"), oldDriver = await old("driver");
  const memberId = (await createRide(customer)).data.ride.id;
  const oldId = (await createRide(oldCustomer, legacy)).data.ride.id;
  assert.deepEqual((await rideReq("driver", "state", undefined, driver)).data.requests.map(r => r.id), [memberId]);
  assert.deepEqual((await rideReq("driver", "state", undefined, oldDriver, legacy)).data.requests.map(r => r.id), [oldId]);
  assert.equal((await rideReq("driver", "transition", { rideId: memberId, command: "accept" }, oldDriver, legacy)).status, 409);
  assert.equal((await rideReq("driver", "transition", { rideId: oldId, command: "accept" }, driver)).status, 409);
  // Even a previous deployment's unscoped legacy SELECT cannot read members.
  assert.equal((await query("SELECT count(*)::int AS n FROM rivo_pilot_rides WHERE id = $1", [memberId]))[0].n, 0);
});

test("an approved driver cannot accept a customer request from the same account", async () => {
  const driver = await named("driver@example.invalid"), owner = await named("reviewer@example.invalid");
  await review(owner, await apply(driver));
  const id = (await createRide(driver)).data.ride.id;
  assert.deepEqual((await rideReq("driver", "state", undefined, driver)).data.requests, []);
  assert.equal((await rideReq("driver", "transition", { rideId: id, command: "accept" }, driver)).status, 409);
});

test("customer availability is a server snapshot of approved, online, idle drivers other than the customer", async () => {
  const customer = await named("customer@example.invalid");
  const owner = await named("reviewer@example.invalid");
  const snapshot = async () => (await rideReq("customer", "state", undefined, customer)).data.availability;
  assert.equal((await snapshot()).status, "none");

  // An approved and online driver on the passenger's own account is never offered.
  await review(owner, await apply(customer));
  await online(customer);
  assert.equal((await snapshot()).status, "none");

  const driver = await named("driver@example.invalid");
  await review(owner, await apply(driver));
  assert.equal((await snapshot()).status, "none");
  await online(driver);
  assert.equal((await snapshot()).status, "available");

  await query("UPDATE rivo_driver_presence SET expires_at = now() - interval '1 second' WHERE participant_id = (SELECT id FROM rivo_member_sessions WHERE account_id = (SELECT id FROM rivo_accounts WHERE email = 'driver@example.invalid') AND role = 'driver')", []);
  assert.equal((await snapshot()).status, "none");
  await online(driver);
  assert.equal((await snapshot()).status, "available");

  const otherCustomer = await named("other@example.invalid");
  const busyRide = (await createRide(otherCustomer)).data.ride.id;
  assert.equal((await rideReq("driver", "transition", { rideId: busyRide, command: "accept" }, driver)).status, 200);
  assert.equal((await snapshot()).status, "none");
});

test("provider sign-out revokes device bindings and work mode before returning success", async () => {
  const driver = await named("driver@example.invalid"), owner = await named("reviewer@example.invalid");
  await review(owner, await apply(driver)); await online(driver);
  const point = Buffer.alloc(65, 1); point[0] = 4;
  const subscribed = await rideReq("driver", "notification-subscription", { command: "subscribe", subscription: {
    endpoint: "https://fcm.googleapis.com/fcm/send/synthetic-signout", keys: { p256dh: point.toString("base64url"), auth: Buffer.alloc(16,1).toString("base64url") }
  } }, driver);
  assert.equal(subscribed.status, 200);
  assert.equal((await authReq("sign-out", {}, driver)).status, 200);
  assert.equal((await query("SELECT count(*)::int AS n FROM rivo_ride_subscriptions", []))[0].n, 0);
  assert.equal((await query("SELECT online FROM rivo_driver_presence", []))[0].online, false);
  assert.equal((await rideReq("driver", "state", undefined, driver)).status, 401);
});
