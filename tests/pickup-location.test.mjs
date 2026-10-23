import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { requestPickupLocation } from "../src/services/pickupLocation.js";

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalSecure = Object.getOwnPropertyDescriptor(globalThis, "isSecureContext");
const point = extra => ({ coords: { latitude: 42.61, longitude: 23.05, accuracy: 12, ...extra }, timestamp: Date.now() });
const install = callback => Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation: { getCurrentPosition: callback } } });
beforeEach(() => { Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: true }); });
after(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else delete globalThis.navigator;
  if (originalSecure) Object.defineProperty(globalThis, "isSecureContext", originalSecure); else delete globalThis.isSecureContext;
});

test("pickup returns the measured point with high accuracy and no cached position", async () => {
  install((success, _error, options) => {
    assert.equal(options.enableHighAccuracy, true); assert.equal(options.maximumAge, 0);
    success(point());
  });
  const result = await requestPickupLocation();
  assert.deepEqual(result, { status: "ready", location: { label: "Текущото ми място", lat: 42.61, lng: 23.05 }, accuracy: 12 });
});

test("denied, unavailable and timed-out GPS never return a default city", async () => {
  for (const [code, status] of [[1, "denied"], [2, "unavailable"], [3, "timeout"]]) {
    install((_success, error) => error({ code }));
    assert.deepEqual(await requestPickupLocation(), { status });
  }
});

test("bad coordinates, stale/future samples and unknown accuracy are rejected", async () => {
  for (const value of [point({ latitude: NaN }), point({ longitude: 200 }), point({ accuracy: NaN }), point({ accuracy: -1 }), { ...point(), timestamp: Date.now() - 60000 }, { ...point(), timestamp: Date.now() + 60000 }]) {
    install(success => success(value));
    assert.deepEqual(await requestPickupLocation(), { status: "unavailable" });
  }
  install(success => success(point({ accuracy: 800 })));
  assert.deepEqual(await requestPickupLocation(), { status: "inaccurate" });
});

test("a browser that never answers has a bounded timeout and late callbacks cannot change it", async () => {
  let callback;
  install(success => { callback = success; });
  const result = await requestPickupLocation({ timeout: 20 });
  assert.deepEqual(result, { status: "timeout" });
  callback(point());
  assert.deepEqual(result, { status: "timeout" });
});

test("insecure contexts and missing geolocation do not ask permission or guess a pickup", async () => {
  let calls = 0;
  install(() => { calls++; });
  Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: false });
  assert.deepEqual(await requestPickupLocation(), { status: "unavailable" });
  assert.equal(calls, 0);
  Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  assert.deepEqual(await requestPickupLocation(), { status: "unavailable" });
});
