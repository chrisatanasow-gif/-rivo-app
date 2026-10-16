import { isValidLocation } from "../../shared/locations.js";

export const CUSTOMER_PROFILE_KEY = "rivoCustomerProfileV1";
const MAX_HISTORY = 50;
const emptyProfile = () => ({ version: 1, name: "", places: { home: null, work: null }, rides: [] });

export function cleanCustomerLocation(value) {
  if (!isValidLocation(value) || typeof value.label !== "string" || !value.label.trim()) return null;
  return { label: value.label.trim().slice(0, 180), detail: typeof value.detail === "string" ? value.detail.slice(0, 240) : "", lat: value.lat, lng: value.lng };
}

export function cleanCustomerProfile(value) {
  const result = emptyProfile();
  if (!value || value.version !== 1) return result;
  result.name = typeof value.name === "string" ? value.name.trim().slice(0, 40) : "";
  result.places.home = cleanCustomerLocation(value.places?.home);
  result.places.work = cleanCustomerLocation(value.places?.work);
  const seen = new Set();
  result.rides = (Array.isArray(value.rides) ? value.rides : []).filter(ride => {
    if (!ride || typeof ride.id !== "string" || !ride.id || ride.id.length > 80 || seen.has(ride.id)
      || !cleanCustomerLocation(ride.pickup) || !cleanCustomerLocation(ride.destination)
      || !Number.isSafeInteger(ride.priceCents) || ride.priceCents < 0
      || ![0, 200, 500, 1000].includes(ride.tipCents)
      || typeof ride.completedAt !== "string" || !Number.isFinite(Date.parse(ride.completedAt))) return false;
    seen.add(ride.id);
    return true;
  }).slice(0, MAX_HISTORY).map(ride => ({
    id: ride.id.slice(0, 80), pickup: cleanCustomerLocation(ride.pickup), destination: cleanCustomerLocation(ride.destination),
    priceCents: ride.priceCents, tipCents: ride.tipCents, completedAt: ride.completedAt,
    rating: Number.isInteger(ride.rating) && ride.rating >= 1 && ride.rating <= 5 ? ride.rating : 5,
    passengers: Number.isInteger(ride.passengers) && ride.passengers >= 1 && ride.passengers <= 4 ? ride.passengers : 1,
    luggage: ride.luggage === true, payment: ride.payment === "card" ? "card" : "cash"
  }));
  return result;
}

export function readCustomerProfile() {
  try {
    const raw = localStorage.getItem(CUSTOMER_PROFILE_KEY);
    return { profile: raw ? cleanCustomerProfile(JSON.parse(raw)) : emptyProfile(), error: null };
  } catch {
    return { profile: emptyProfile(), error: "load" };
  }
}

export function writeCustomerProfile(profile) {
  try { localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profile)); return true; }
  catch { return false; }
}

export function formatRideDate(value) {
  return new Intl.DateTimeFormat("bg-BG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
