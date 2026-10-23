import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { calculateFare } from "../shared/fare.js";
import { applyDailyOffer, dailyOffer } from "../shared/daily-offers.js";
import { routeKey } from "../shared/locations.js";
import { ACTIVE_RIDE_KEY, cleanActiveRide, clearActiveRide, demoEta, demoTripProgress, MAX_DEMO_RIDE_AGE, readActiveRide, saveActiveRide } from "../src/lib/activeRide.js";
const now = new Date("2026-10-17T08:00Z").getTime();
let storage;
beforeEach(() => { storage = new Map(); globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }; });
function fixture(change = {}) {
  const pickup = { label: "Перник", lat: 42.6019, lng: 23.0334 }, destination = { label: "София", lat: 42.6977, lng: 23.3219 };
  return { version: 1, mode: "demo", id: randomUUID(), stage: "matching", pickup, destination,
    fare: calculateFare(35000), route: { key: routeKey(pickup, destination), distanceKm: 35, durationMinutes: 40, isFallback: false, geometry: { type: "LineString", coordinates: [[23.0334, 42.6019], [23.3219, 42.6977]] } },
    bookedAt: now, arrivalAt: now + 6350, tripStartedAt: null, passengers: 2, luggage: true, payment: "cash", timing: "now", ...change };
}

test("active snapshot retains the confirmed tariff and discount without current pricing settings", () => {
  const ride = fixture({ fare: applyDailyOffer(calculateFare(35000, { baseFareCents: 200, perKmCents: 100 }), dailyOffer(new Date(now)).id, false, new Date(now)) });
  const clean = cleanActiveRide(ride, now);
  assert.equal(clean.fare.priceCents, 3500); assert.equal(clean.fare.discountCents, 200); assert.equal(clean.fare.originalPriceCents, 3700);
  assert.equal(clean.fare.perKmCents, 100); assert.deepEqual(clean.route, ride.route);
});
test("invalid identifiers, locations, prices, geometry and stages cannot be restored", () => {
  for (const change of [ { id: [fixture().id] }, { mode: "pilot" }, { stage: "complete" }, { pickup: { label: "Bad", lat: null, lng: null } },
    { passengers: 5 }, { fare: { ...calculateFare(35000), priceCents: 1 } }, { route: { ...fixture().route, key: "wrong" } },
    { route: { ...fixture().route, geometry: { type: "LineString", coordinates: [[null, null], [23, 42]] } } },
    { stage: "trip", tripStartedAt: now - 1 }, { arrivalAt: now + 999999 } ]) assert.equal(cleanActiveRide(fixture(change), now), null);
});
test("expired and future snapshots are discarded while same-day snapshots survive", () => {
  const ride = fixture();
  assert.equal(cleanActiveRide(ride, now + MAX_DEMO_RIDE_AGE + 1), null);
  assert.equal(cleanActiveRide(ride, now - 2000), null);
  assert.ok(cleanActiveRide(ride, now + 60 * 60 * 1000));
});
test("matching resumes by elapsed time, arrival never starts a trip and trip progress never restarts", () => {
  const ride = fixture(); saveActiveRide(ride);
  assert.equal(readActiveRide([], now + 200).ride.stage, "matching");
  assert.equal(readActiveRide([], now + 1000).ride.stage, "arriving");
  assert.equal(readActiveRide([], now + 100000).ride.stage, "arriving");
  assert.equal(demoEta(ride, now + 100000), 0);
  assert.equal(demoTripProgress({ ...ride, stage: "trip", tripStartedAt: now }, now + 5000), 30);
  assert.equal(demoTripProgress({ ...ride, stage: "trip", tripStartedAt: now }, now + 100000), 92);
});
test("large route geometry is bounded while preserving first and last coordinates", () => {
  const ride = fixture(); ride.route.geometry.coordinates = Array.from({ length: 20000 }, (_, index) => [23 + index / 100000, 42]);
  const clean = cleanActiveRide(ride, now);
  assert.equal(clean.route.geometry.coordinates.length, 8000);
  assert.deepEqual(clean.route.geometry.coordinates[0], ride.route.geometry.coordinates[0]);
  assert.deepEqual(clean.route.geometry.coordinates.at(-1), ride.route.geometry.coordinates.at(-1));
});
test("completed history and terminal markers prevent stale active snapshots returning", () => {
  const ride = fixture(); saveActiveRide(ride);
  const result = readActiveRide([{ id: ride.id }], now);
  assert.equal(result.ride, null); assert.equal(result.discard, true); assert.equal(result.error, null);
  saveActiveRide({ version: 1, ended: true });
  assert.equal(readActiveRide([], now).ride, null);
});
test("bad JSON is safely discarded and storage denial has a distinct recoverable result", () => {
  storage.set(ACTIVE_RIDE_KEY, "{invalid");
  assert.equal(readActiveRide([], now).error, "invalid");
  globalThis.localStorage.getItem = () => { throw new Error("denied"); };
  assert.equal(readActiveRide([], now).error, "load");
  globalThis.localStorage.setItem = () => { throw new Error("quota"); };
  assert.equal(saveActiveRide(fixture()), false);
});
test("clearing uses a terminal marker if removal fails, and reports total storage failure", () => {
  saveActiveRide(fixture());
  globalThis.localStorage.removeItem = () => { throw new Error("cannot remove"); };
  assert.equal(clearActiveRide(), true); assert.equal(readActiveRide([], now).ride, null);
  globalThis.localStorage.setItem = () => { throw new Error("cannot write"); };
  assert.equal(clearActiveRide(), false);
});
