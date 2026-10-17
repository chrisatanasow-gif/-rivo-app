import { calculateFare } from "../../shared/fare.js";
import { isValidLocation, routeKey } from "../../shared/locations.js";
import { offerDateKey } from "../../shared/daily-offers.js";
import { cleanCustomerLocation } from "./customerProfile.js";

export const ACTIVE_RIDE_KEY = "rivoActiveDemoRideV1";
export const DEMO_MATCH_MS = 950;
export const DEMO_ETA_TICK_MS = 1800;
export const DEMO_ETA = 3;
export const MAX_DEMO_RIDE_AGE = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_POINTS = 8000;

function cleanFare(value, bookedAt) {
  if (!value || value.currency !== "EUR" || typeof value.tariffVersion !== "string" || value.tariffVersion.length > 80) return null;
  let original;
  try { original = calculateFare(value.distanceMeters, value); } catch { return null; }
  if (value.distanceChargeCents !== original.distanceChargeCents || !Number.isSafeInteger(value.priceCents)) return null;
  if (value.discountCents == null || value.discountCents === 0) return value.priceCents === original.priceCents ? { ...original, tariffVersion: value.tariffVersion } : null;
  const expectedDiscount = Math.min(200, Math.round(original.priceCents / 10));
  if (value.discountCents !== expectedDiscount || expectedDiscount <= 0 || value.originalPriceCents !== original.priceCents
    || value.priceCents !== original.priceCents - expectedDiscount || value.promotion?.id !== `daily-${offerDateKey(new Date(bookedAt))}`) return null;
  return { ...original, tariffVersion: value.tariffVersion, originalPriceCents: original.priceCents,
    discountCents: expectedDiscount, priceCents: value.priceCents, promotion: { id: value.promotion.id } };
}

function cleanRoute(value, pickup, destination, fare) {
  if (!value || value.isFallback !== false || value.key !== routeKey(pickup, destination)
    || !Number.isFinite(value.distanceKm) || Math.round(value.distanceKm * 1000) !== fare.distanceMeters
    || !Number.isInteger(value.durationMinutes) || value.durationMinutes < 1 || value.durationMinutes > 10080
    || value.geometry?.type !== "LineString" || !Array.isArray(value.geometry.coordinates)
    || value.geometry.coordinates.length < 2 || value.geometry.coordinates.length > 100000) return null;
  const points = value.geometry.coordinates;
  if (!points.every(point => Array.isArray(point) && point.length === 2 && isValidLocation({ lat: point[1], lng: point[0] }))) return null;
  const geometry = { type: "LineString", coordinates: points.length <= MAX_POINTS ? points.map(point => [...point])
    : Array.from({ length: MAX_POINTS }, (_, index) => [...points[Math.round(index * (points.length - 1) / (MAX_POINTS - 1))]]) };
  return { key: value.key, distanceKm: value.distanceKm, durationMinutes: value.durationMinutes, geometry, isFallback: false };
}

export function cleanActiveRide(value, now = Date.now()) {
  if (!value || value.version !== 1 || value.mode !== "demo" || typeof value.id !== "string" || !UUID.test(value.id)
    || !["matching", "arriving", "trip"].includes(value.stage)
    || !Number.isSafeInteger(value.bookedAt) || value.bookedAt > now + 1000 || now - value.bookedAt > MAX_DEMO_RIDE_AGE
    || !Number.isSafeInteger(value.arrivalAt) || value.arrivalAt < value.bookedAt
    || value.arrivalAt > value.bookedAt + DEMO_MATCH_MS + DEMO_ETA * DEMO_ETA_TICK_MS
    || (value.stage === "trip" && (!Number.isSafeInteger(value.tripStartedAt) || value.tripStartedAt < value.arrivalAt || value.tripStartedAt > now + 1000))
    || !Number.isInteger(value.passengers) || value.passengers < 1 || value.passengers > 4
    || typeof value.luggage !== "boolean" || !["cash", "card"].includes(value.payment) || !["now", "later"].includes(value.timing)) return null;
  const pickup = cleanCustomerLocation(value.pickup), destination = cleanCustomerLocation(value.destination);
  const fare = cleanFare(value.fare, value.bookedAt);
  const route = pickup && destination && fare ? cleanRoute(value.route, pickup, destination, fare) : null;
  if (!route) return null;
  return { version: 1, mode: "demo", id: value.id, stage: value.stage, pickup, destination, fare, route,
    bookedAt: value.bookedAt, arrivalAt: value.arrivalAt, tripStartedAt: value.stage === "trip" ? value.tripStartedAt : null,
    passengers: value.passengers, luggage: value.luggage, payment: value.payment, timing: value.timing };
}

export function demoEta(ride, now = Date.now()) {
  return ride ? Math.max(0, Math.min(DEMO_ETA, Math.ceil((ride.arrivalAt - now) / DEMO_ETA_TICK_MS))) : DEMO_ETA;
}

export function demoTripProgress(ride, now = Date.now()) {
  return ride?.stage === "trip" ? Math.min(92, Math.max(0, Math.floor((now - ride.tripStartedAt) / 1000) * 6)) : 0;
}

export function readActiveRide(completedRides = [], now = Date.now()) {
  try {
    const raw = localStorage.getItem(ACTIVE_RIDE_KEY);
    if (!raw) return { ride: null, error: null, discard: false };
    let value;
    try { value = JSON.parse(raw); } catch { return { ride: null, error: "invalid", discard: true }; }
    if (value?.version === 1 && (value.ended === true || completedRides.some(ride => ride.id === value.id))) return { ride: null, error: null, discard: true };
    const ride = cleanActiveRide(value, now);
    if (!ride) return { ride: null, error: "invalid", discard: true };
    if (ride.stage === "matching" && now >= ride.bookedAt + DEMO_MATCH_MS) ride.stage = "arriving";
    return { ride, error: null, discard: false };
  } catch { return { ride: null, error: "load", discard: false }; }
}

export function saveActiveRide(ride) {
  try { localStorage.setItem(ACTIVE_RIDE_KEY, JSON.stringify(ride)); return true; }
  catch { return false; }
}

export function clearActiveRide() {
  try { localStorage.removeItem(ACTIVE_RIDE_KEY); return true; }
  catch {
    // A small terminal marker is a fallback when removal alone fails.
    return saveActiveRide({ version: 1, ended: true });
  }
}
