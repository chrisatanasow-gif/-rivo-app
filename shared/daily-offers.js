export const OFFER_TIME_ZONE = "Europe/Sofia";
const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: OFFER_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function offerDateKey(now = new Date()) {
  const parts = Object.fromEntries(dateFormat.formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dailyOffer(now = new Date()) {
  const dateKey = offerDateKey(now);
  const nextMidnightUtc = new Date(`${dateKey}T00:00:00Z`).getTime() + 86400000;
  let expires = nextMidnightUtc;
  // Resolve Sofia midnight, including the two DST transition days.
  const zone = new Intl.DateTimeFormat("en", { timeZone: OFFER_TIME_ZONE, timeZoneName: "longOffset" });
  for (let attempt = 0; attempt < 3; attempt++) {
    const offset = zone.formatToParts(new Date(expires)).find(part => part.type === "timeZoneName").value.match(/GMT([+-])(\d{2}):(\d{2})/);
    const minutes = offset ? (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "+" ? 1 : -1) : 0;
    expires = nextMidnightUtc - minutes * 60000;
  }
  return { id: `daily-${dateKey}`, dateKey, percent: 10, maxDiscountCents: 200, title: "Твоите −10% днес", expiresAt: new Date(expires).toISOString() };
}

export function applyDailyOffer(fare, selectedId, alreadyUsed, now = new Date()) {
  const offer = dailyOffer(now);
  if (!fare || selectedId !== offer.id || alreadyUsed || !Number.isSafeInteger(fare.priceCents) || fare.priceCents < 0) return fare;
  const discountCents = Math.min(offer.maxDiscountCents, Math.round(fare.priceCents * offer.percent / 100));
  return { ...fare, originalPriceCents: fare.priceCents, discountCents, priceCents: fare.priceCents - discountCents, promotion: offer };
}

export function offerNotification(now = new Date(), test = false) {
  const offer = dailyOffer(now);
  return { title: test ? "Тестово известие от RIVO" : offer.title,
    body: "10% отстъпка до 2 € за един демо курс днес. Отвори RIVO и избери офертата.",
    tag: test ? "rivo-offer-test" : `rivo-${offer.id}`, url: `/?offer=${offer.id}`, expiresAt: offer.expiresAt };
}
