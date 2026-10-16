// Single example tariff for the closed pilot, in euro cents. Commercial rates are pending.
export const DEFAULT_TARIFF = Object.freeze({ baseFareCents: 100, perKmCents: 70 });
export const TARIFF_VERSION = "example-rivo-distance-v1";

export function calculateFare(distanceMeters, tariff = DEFAULT_TARIFF) {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 1 || distanceMeters > 2_000_000 || !tariff
    || !Number.isSafeInteger(tariff.baseFareCents) || tariff.baseFareCents < 0 || tariff.baseFareCents > 100_000
    || !Number.isSafeInteger(tariff.perKmCents) || tariff.perKmCents < 1 || tariff.perKmCents > 100_000) {
    throw new Error("Invalid fare inputs");
  }
  const meters = Math.round(distanceMeters);
  const distanceChargeCents = Math.round(meters * tariff.perKmCents / 1000);
  return {
    distanceMeters: meters, baseFareCents: tariff.baseFareCents, perKmCents: tariff.perKmCents,
    distanceChargeCents, priceCents: tariff.baseFareCents + distanceChargeCents,
    currency: "EUR", tariffVersion: TARIFF_VERSION, isExample: true
  };
}

export const formatMoney = cents => new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR" }).format(cents / 100);
export const formatDistance = meters => new Intl.NumberFormat("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(meters / 1000);
