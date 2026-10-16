import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createPilotHandler } from "../server/pilot-handler.js";
import { calculateFare } from "../shared/fare.js";
import { getRoadRoute, RouteError } from "../server/road-route.js";

const CODE = "rivo-local-test-invitation";
let db;
let handle;
const query = async (statement, parameters) => (await db.query(statement, parameters)).rows;
const makeHandler = (options = {}) => createPilotHandler({ query, accessCode: CODE, secureCookies: true,
  resolveRoute: async () => ({ distanceMeters: 5000, durationSeconds: 600, routeSource: "test-fixture" }),
  reportError: error => { throw error; }, ...options });

before(async () => {
  db = new PGlite();
  await db.exec(await readFile(new URL("../server/pilot-schema.sql", import.meta.url), "utf8"));
});
beforeEach(async () => {
  await db.exec("TRUNCATE rivo_pilot_quotes, rivo_pilot_rides, rivo_pilot_sessions, rivo_pilot_login_attempts");
  handle = makeHandler();
});
after(async () => { await db?.close(); });

async function request(action, body, cookie, handler = handle, headers = {}) {
  // Existing lifecycle tests obtain a real server quote before their create request.
  if (action === "create" && body && !Object.hasOwn(body, "quoteToken")) {
    const result = await request("quote", body, cookie, handler, headers);
    if (result.status !== 200) return result;
    body = { ...body, quoteToken: result.data.quote.token };
  }
  let payload;
  const response = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, end(value) { payload = value; } };
  await handler({
    url: `/api/pilot?action=${action}`, method: body === undefined ? "GET" : "POST", body,
    headers: { host: "localhost", "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    socket: { remoteAddress: "127.0.0.1" }
  }, response);
  return { status: response.statusCode, headers: response.headers, data: JSON.parse(payload) };
}

async function login(role = "customer", extras = {}) {
  const response = await request("login", { code: CODE, role, name: role === "customer" ? "Пътник Тест" : "Шофьор Тест", vehicleModel: "Тестов автомобил", vehiclePlate: "PK 1234 AA", ...extras });
  assert.equal(response.status, 200);
  return { cookie: response.headers["set-cookie"].split(";")[0], participant: response.data.participant, response };
}

const draft = extras => ({
  idempotencyKey: randomUUID(), pickup: { label: "Перник, Център", lat: 42.6052, lng: 23.0379 },
  destination: { label: "Перник, Изток", lat: 42.6048, lng: 23.0422 }, passengers: 1, ...extras
});
const transition = (client, rideId, command) => request("transition", { rideId, command }, client.cookie);

test("two independent sessions share the full ride lifecycle across handler instances", async () => {
  const customer = await login();
  const driver = await login("driver");
  const created = await request("create", draft({ priceCents: 1 }), customer.cookie);
  assert.equal(created.status, 201);
  const id = created.data.ride.id;
  assert.equal(created.data.ride.priceCents, 450);
  assert.equal(created.data.ride.fare.distanceMeters, 5000);
  const otherInstance = makeHandler();
  const inbox = await request("state", undefined, driver.cookie, otherInstance);
  assert.equal(inbox.data.requests[0].id, id);
  for (const [command, expected] of [["accept", "accepted"], ["arrive", "arrived"], ["start", "in_progress"], ["complete", "completed"]]) {
    const changed = await transition(driver, id, command);
    assert.equal(changed.status, 200);
    const refreshed = await request("state", undefined, customer.cookie, otherInstance);
    assert.equal(refreshed.data.rides[0].status, expected);
    assert.equal(refreshed.data.rides[0].driver.vehiclePlate, "PK 1234 AA");
  }
  const finished = await request("state", undefined, driver.cookie);
  assert.equal(finished.data.activeRide, null);
  assert.equal(finished.data.rides[0].status, "completed");
});

test("retries and simultaneous identical posts create only one ride", async () => {
  const customer = await login();
  const body = draft();
  const responses = await Promise.all([request("create", body, customer.cookie), request("create", body, customer.cookie)]);
  assert.ok(responses.every(response => [200, 201].includes(response.status)));
  assert.equal(responses[0].data.ride.id, responses[1].data.ride.id);
  const retry = await request("create", body, customer.cookie);
  assert.equal(retry.status, 200);
  assert.equal(retry.data.ride.id, responses[0].data.ride.id);
  assert.equal((await query("SELECT count(*)::int AS count FROM rivo_pilot_rides", []))[0].count, 1);
  assert.equal((await request("create", draft(), customer.cookie)).status, 409);
});

test("only one of two drivers can accept a ride", async () => {
  const customer = await login();
  const first = await login("driver", { name: "Първи шофьор" });
  const second = await login("driver", { name: "Втори шофьор" });
  const created = await request("create", draft(), customer.cookie);
  const results = await Promise.all([transition(first, created.data.ride.id, "accept"), transition(second, created.data.ride.id, "accept")]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const states = await Promise.all([request("state", undefined, first.cookie), request("state", undefined, second.cookie)]);
  assert.equal(states.filter(result => result.data.activeRide).length, 1);
});

test("a driver cannot take two different active rides", async () => {
  const first = await login();
  const second = await login();
  const driver = await login("driver");
  const rides = await Promise.all([request("create", draft(), first.cookie), request("create", draft(), second.cookie)]);
  const results = await Promise.all(rides.map(result => transition(driver, result.data.ride.id, "accept")));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
});

test("role, ownership and transition order are enforced", async () => {
  const customer = await login();
  const stranger = await login();
  const driver = await login("driver");
  const created = await request("create", draft(), customer.cookie);
  const id = created.data.ride.id;
  assert.equal((await request("state", undefined)).status, 401);
  assert.equal((await request("state", undefined, stranger.cookie)).data.rides.length, 0);
  assert.equal((await transition(customer, id, "accept")).status, 403);
  assert.equal((await transition(stranger, id, "cancel")).status, 409);
  assert.equal((await request("create", draft(), driver.cookie)).status, 403);
  assert.equal((await transition(driver, id, "complete")).status, 409);
  assert.equal((await transition(driver, id, "accept")).status, 200);
  assert.equal((await transition(driver, id, "start")).status, 409);
  assert.equal((await transition(customer, id, "complete")).status, 403);
  assert.equal((await transition(customer, id, "cancel")).status, 200);
  assert.equal((await transition(driver, id, "arrive")).status, 409);
});

test("empty, string, out-of-range and non-finite coordinates cannot create a ride", async () => {
  const customer = await login();
  for (const value of [null, "42.6", 91, Number.NaN, Number.POSITIVE_INFINITY]) {
    const body = draft({ destination: { label: "Невалиден адрес", lat: value, lng: 23 } });
    assert.equal((await request("create", body, customer.cookie)).status, 400);
  }
  assert.equal((await request("create", draft({ passengers: 5 }), customer.cookie)).status, 400);
  assert.equal((await request("create", draft({ vehicleType: "unknown" }), customer.cookie)).status, 400);
});

test("waiting requests expire and release the customer's active slot", async () => {
  const customer = await login();
  const driver = await login("driver");
  const created = await request("create", draft(), customer.cookie);
  await query("UPDATE rivo_pilot_rides SET expires_at = now() - interval '1 second' WHERE id = $1", [created.data.ride.id]);
  assert.equal((await request("state", undefined, driver.cookie)).data.requests.length, 0);
  const state = await request("state", undefined, customer.cookie);
  assert.equal(state.data.rides[0].status, "expired");
  assert.equal(state.data.activeRide, null);
  assert.equal((await request("create", draft(), customer.cookie)).status, 201);
});

test("session cookies are HTTP-only and secure, and logout is blocked while a ride is active", async () => {
  const customer = await login();
  assert.match(customer.response.headers["set-cookie"], /HttpOnly/);
  assert.match(customer.response.headers["set-cookie"], /SameSite=Strict/);
  assert.match(customer.response.headers["set-cookie"], /Secure/);
  assert.equal(customer.response.data.token, undefined);
  const rows = await query("SELECT token_hash FROM rivo_pilot_sessions", []);
  assert.notEqual(rows[0].token_hash, customer.cookie.split("=")[1]);
  const created = await request("create", draft(), customer.cookie);
  assert.equal((await request("logout", {}, customer.cookie)).status, 409);
  await transition(customer, created.data.ride.id, "cancel");
  assert.equal((await request("logout", {}, customer.cookie)).status, 200);
  assert.equal((await request("state", undefined, customer.cookie)).status, 401);
});

test("rotating the pilot code invalidates existing sessions", async () => {
  const customer = await login();
  const rotated = createPilotHandler({ query, accessCode: "another-long-pilot-invitation" });
  assert.equal((await request("state", undefined, customer.cookie, rotated)).status, 401);
});

test("login attempts are throttled in the database", async () => {
  const body = { role: "customer", name: "Пътник", code: "incorrect-code" };
  for (let attempt = 0; attempt < 12; attempt += 1) assert.equal((await request("login", body)).status, 401);
  const limited = await request("login", body);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["retry-after"], "900");
});

test("cross-origin mutations, malformed payloads and unsupported methods are rejected", async () => {
  const body = { code: CODE, role: "customer", name: "Пътник" };
  assert.equal((await request("login", body, null, handle, { origin: "https://elsewhere.example" })).status, 403);
  assert.equal((await request("login", body, null, handle, { "content-type": "text/plain" })).status, 415);
  assert.equal((await request("login", "{")).status, 400);
  assert.equal((await request("login", { ...body, name: "a".repeat(9000) })).status, 413);
});

test("missing configuration and database errors return safe errors without credentials", async () => {
  const empty = createPilotHandler({ query: null, accessCode: "" });
  const missing = await request("session", undefined, null, empty);
  assert.equal(missing.status, 503);
  assert.equal(missing.data.code, "NOT_CONFIGURED");
  const unavailable = createPilotHandler({ query: async () => { throw Object.assign(new Error("postgres://secret-password@private-host/database"), { code: "CONNECTION_FAILED" }); }, accessCode: CODE, reportError: () => {} });
  const result = await request("login", { role: "customer", code: CODE, name: "Пътник" }, null, unavailable);
  assert.equal(result.status, 503);
  assert.ok(!JSON.stringify(result).includes("secret-password"));
});

test("the single RIVO tariff uses integer cents and a single final rounding", () => {
  assert.equal(calculateFare(1000).priceCents, 170);
  assert.equal(calculateFare(5000).priceCents, 450);
  assert.equal(calculateFare(35000).priceCents, 2550);
  assert.equal(calculateFare(1234).priceCents, 186);
  for (const meters of [null, "1000", 0, -1, NaN, Infinity]) assert.throws(() => calculateFare(meters));
});

test("quote reflects the road provider distance and does not create a ride", async () => {
  const customer = await login();
  const body = draft();
  const short = await request("quote", body, customer.cookie);
  const longHandler = makeHandler({ resolveRoute: async () => ({ distanceMeters: 35000, durationSeconds: 2400 }) });
  const long = await request("quote", body, customer.cookie, longHandler);
  const olderClient = await request("quote", { ...body, vehicleType: "premium" }, customer.cookie);
  assert.equal(short.data.quote.priceCents, 450);
  assert.equal(long.data.quote.priceCents, 2550);
  assert.equal(olderClient.data.quote.priceCents, 450);
  assert.equal(olderClient.data.quote.service, "rivo");
  assert.equal((await query("SELECT count(*)::int AS count FROM rivo_pilot_rides", []))[0].count, 0);
  const driver = await login("driver");
  assert.equal((await request("quote", body, driver.cookie)).status, 403);
});

test("a server-stored quote is bound to its passenger and route", async () => {
  const customer = await login();
  const stranger = await login();
  const body = draft();
  const { data } = await request("quote", body, customer.cookie);
  const quoted = { ...body, quoteToken: data.quote.token };
  assert.equal((await request("create", { ...quoted, quoteToken: undefined }, customer.cookie)).status, 409);
  assert.equal((await request("create", quoted, stranger.cookie)).status, 409);
  assert.equal((await request("create", { ...quoted, destination: { ...body.destination, lat: 42.7 } }, customer.cookie)).status, 409);
  assert.equal((await request("create", { ...quoted, quoteToken: randomUUID() }, customer.cookie)).status, 409);
  const created = await request("create", { ...quoted, priceCents: 1, distanceMeters: 1 }, customer.cookie);
  assert.equal(created.status, 201);
  assert.equal(created.data.ride.priceCents, 450);
  assert.equal(created.data.ride.fare.distanceMeters, 5000);
});

test("expired quotes are rejected, while an idempotent retry preserves an already saved fare", async () => {
  const customer = await login();
  let clock = Date.now();
  const handler = makeHandler({ now: () => clock });
  const body = draft();
  const quoted = await request("quote", body, customer.cookie, handler);
  const posted = { ...body, quoteToken: quoted.data.quote.token };
  const created = await request("create", posted, customer.cookie, handler);
  assert.equal(created.status, 201);
  clock += 6 * 60 * 1000;
  const retry = await request("create", posted, customer.cookie, handler);
  assert.equal(retry.status, 200);
  assert.equal(retry.data.ride.priceCents, 450);
  const expired = await request("create", { ...posted, idempotencyKey: randomUUID() }, customer.cookie, handler);
  assert.equal(expired.status, 409);
  assert.equal(expired.data.code, "QUOTE_EXPIRED");
});

test("routing outages return a visible safe error and never generate a straight-line fare", async () => {
  const customer = await login();
  const handler = makeHandler({ resolveRoute: async () => { throw new RouteError("Маршрутът временно не е наличен."); } });
  const response = await request("quote", draft(), customer.cookie, handler);
  assert.equal(response.status, 503);
  assert.equal(response.data.code, "ROUTE_UNAVAILABLE");
  assert.equal(response.data.quote, undefined);
});

test("OSRM responses are validated and distance/duration are read in metres and seconds", async () => {
  const body = draft();
  let target;
  const result = await getRoadRoute(body.pickup, body.destination, { fetchImpl: async url => {
    target = url;
    return { ok: true, json: async () => ({ code: "Ok", routes: [{ distance: 1234.4, duration: 123.4 }] }) };
  } });
  assert.equal(result.distanceMeters, 1234);
  assert.equal(result.durationSeconds, 123);
  assert.equal(target.searchParams.get("radiuses"), "1000;1000");
  for (const data of [{ code: "NoRoute" }, { code: "Ok", routes: [{ distance: 0, duration: 0 }] }, { code: "Ok", routes: [{ distance: null, duration: 30 }] }]) {
    await assert.rejects(getRoadRoute(body.pickup, body.destination, { fetchImpl: async () => ({ ok: true, json: async () => data }) }), error => error.code === "NO_ROUTE");
  }
  await assert.rejects(getRoadRoute(body.pickup, body.destination, { fetchImpl: async () => { throw new Error("network unavailable"); } }), error => error.code === "ROUTE_UNAVAILABLE");
});

test("legacy pilot rides keep their stored price without fabricating a distance breakdown", async () => {
  const customer = await login();
  const created = await request("create", draft(), customer.cookie);
  await query("UPDATE rivo_pilot_rides SET fare_quote = NULL, price_cents = 2600 WHERE id = $1", [created.data.ride.id]);
  const state = await request("state", undefined, customer.cookie);
  assert.equal(state.data.rides[0].priceCents, 2600);
  assert.equal(state.data.rides[0].fare, null);
});

test("a previously registered Premium driver can accept a new RIVO request", async () => {
  const customer = await login();
  const driver = await login("driver");
  await query("UPDATE rivo_pilot_sessions SET vehicle_type = 'premium' WHERE id = $1", [driver.participant.id]);
  const created = await request("create", draft(), customer.cookie);
  assert.equal(created.data.ride.service, "rivo");
  const state = await request("state", undefined, driver.cookie);
  assert.equal(state.data.requests[0].id, created.data.ride.id);
  assert.equal((await transition(driver, created.data.ride.id, "accept")).status, 200);
});

test("a new driver can accept a previous Premium request without repricing it", async () => {
  const customer = await login();
  const driver = await login("driver");
  const created = await request("create", draft(), customer.cookie);
  const previousFare = { ...created.data.ride.fare, baseFareCents: 150, perKmCents: 100, distanceChargeCents: 500, priceCents: 650, tariffVersion: "example-distance-v1" };
  await query("UPDATE rivo_pilot_rides SET vehicle_type = 'premium', price_cents = 650, fare_quote = $2::jsonb WHERE id = $1", [created.data.ride.id, JSON.stringify(previousFare)]);
  const state = await request("state", undefined, driver.cookie);
  assert.equal(state.data.requests[0].id, created.data.ride.id);
  assert.equal(state.data.requests[0].priceCents, 650);
  const accepted = await transition(driver, created.data.ride.id, "accept");
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.ride.priceCents, 650);
  assert.deepEqual(accepted.data.ride.fare, previousFare);
});

test("an unbooked previous Premium quote requires a new RIVO quote", async () => {
  const customer = await login();
  const body = draft({ vehicleType: "premium" });
  const quoted = await request("quote", body, customer.cookie);
  await query("UPDATE rivo_pilot_quotes SET vehicle_type = 'premium' WHERE id = $1", [quoted.data.quote.token]);
  const result = await request("create", { ...body, quoteToken: quoted.data.quote.token }, customer.cookie);
  assert.equal(result.status, 409);
  assert.equal((await query("SELECT count(*)::int AS count FROM rivo_pilot_rides", []))[0].count, 0);
});
