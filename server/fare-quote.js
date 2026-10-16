import { randomUUID } from "node:crypto";
import { calculateFare, DEFAULT_TARIFFS } from "../shared/fare.js";

export class QuoteError extends Error {
  constructor(message, code = "QUOTE_REQUIRED") { super(message); this.code = code; this.status = 409; }
}

// JSONB can reorder object keys; compare the normalized values in a stable order.
const details = (pickup, destination, vehicleType) => JSON.stringify([
  pickup.label, pickup.lat, pickup.lng, destination.label, destination.lat, destination.lng, vehicleType
]);

export function createFareQuotes({ query, resolveRoute, now = () => Date.now(), tariffs = DEFAULT_TARIFFS }) {
  return {
    async issue({ sessionId, pickup, destination, vehicleType }) {
      const route = await resolveRoute(pickup, destination);
      const fare = { ...calculateFare(route.distanceMeters, vehicleType, tariffs), durationSeconds: route.durationSeconds, routeSource: route.routeSource || "osrm" };
      const expiresAt = new Date(now() + 5 * 60 * 1000).toISOString();
      const token = randomUUID();
      await query(`INSERT INTO rivo_pilot_quotes (id, customer_id, pickup, destination, vehicle_type, fare, expires_at)
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7)`,
      [token, sessionId, JSON.stringify(pickup), JSON.stringify(destination), vehicleType, JSON.stringify(fare), expiresAt]);
      return { ...fare, token, expiresAt };
    },
    async verify(token, { sessionId, pickup, destination, vehicleType }) {
      const invalid = () => new QuoteError("Изчисли цената отново преди да изпратиш заявката.");
      if (typeof token !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) throw invalid();
      const [row] = await query("SELECT * FROM rivo_pilot_quotes WHERE id = $1 AND customer_id = $2", [token, sessionId]);
      if (!row || details(row.pickup, row.destination, row.vehicle_type) !== details(pickup, destination, vehicleType)) throw invalid();
      if (new Date(row.expires_at).getTime() <= now()) throw new QuoteError("Цената изтече. Изчисли я отново.", "QUOTE_EXPIRED");
      return row.fare;
    }
  };
}
