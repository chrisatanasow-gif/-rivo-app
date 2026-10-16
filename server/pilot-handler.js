import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { DEFAULT_TARIFFS } from "../shared/fare.js";
import { getRoadRoute, RouteError } from "./road-route.js";
import { createFareQuotes, QuoteError } from "./fare-quote.js";
const COOKIE = "rivo_pilot_session";
const ACTIVE = ["waiting", "accepted", "arrived", "in_progress"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = value => createHash("sha256").update(value).digest("hex");

class PilotError extends Error {
  constructor(status, message, code = "INVALID_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function text(value, label, maximum = 80) {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new PilotError(400, `Провери полето „${label}“.`);
  }
  return value.trim();
}

function location(value, label) {
  if (!value || typeof value.lat !== "number" || typeof value.lng !== "number" || !Number.isFinite(value.lat) || !Number.isFinite(value.lng)
    || Math.abs(value.lat) > 90 || Math.abs(value.lng) > 180) {
    throw new PilotError(400, `Избери точно място за ${label}.`);
  }
  return { label: text(value.label, label, 160), lat: value.lat, lng: value.lng };
}

function vehicleType(value) {
  if (!Object.hasOwn(DEFAULT_TARIFFS, value)) throw new PilotError(400, "Избери категория автомобил.");
  return value;
}

function participant(row) {
  return {
    id: row.id, role: row.role, name: row.display_name,
    vehicleType: row.vehicle_type, vehicleModel: row.vehicle_model, vehiclePlate: row.vehicle_plate
  };
}

function ride(row) {
  return {
    id: row.id, status: row.status, revision: row.revision,
    pickup: row.pickup, destination: row.destination, vehicleType: row.vehicle_type,
    passengers: row.passengers, priceCents: row.price_cents, currency: "EUR", fare: row.fare_quote || null,
    customerName: row.customer_name,
    driver: row.driver_id ? { name: row.driver_name, vehicleModel: row.driver_model, vehiclePlate: row.driver_plate } : null,
    createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at
  };
}

const SELECT_RIDES = `SELECT r.*, c.display_name AS customer_name,
  d.display_name AS driver_name, d.vehicle_model AS driver_model, d.vehicle_plate AS driver_plate
  FROM rivo_pilot_rides r
  JOIN rivo_pilot_sessions c ON c.id = r.customer_id
  LEFT JOIN rivo_pilot_sessions d ON d.id = r.driver_id`;

async function readBody(req) {
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new PilotError(415, "Заявката трябва да е във формат JSON.");
  }
  let body = req.body;
  if (body === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > 8192) throw new PilotError(413, "Заявката е прекалено голяма.");
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > 8192) throw new PilotError(413, "Заявката е прекалено голяма.");
    try { body = JSON.parse(body); } catch { throw new PilotError(400, "Невалидна заявка."); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PilotError(400, "Невалидна заявка.");
  if (Buffer.byteLength(JSON.stringify(body)) > 8192) throw new PilotError(413, "Заявката е прекалено голяма.");
  return body;
}

export function createPilotHandler({ query, accessCode, secureCookies = true, resolveRoute = getRoadRoute, now, reportError = error => console.error("RIVO pilot API", error.code || error.name) }) {
  const gateHash = hash(accessCode || "");
  const quotes = createFareQuotes({ query, resolveRoute, now });
  const cookie = (token, age = 86400) => `${COOKIE}=${token}; Path=/api/pilot; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookies ? "; Secure" : ""}`;

  async function sessionFor(req) {
    const token = (req.headers.cookie || "").split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const rows = await query("SELECT * FROM rivo_pilot_sessions WHERE token_hash = $1 AND gate_hash = $2 AND expires_at > now()", [hash(token), gateHash]);
    return rows[0] || null;
  }

  const expireWaiting = () => query("UPDATE rivo_pilot_rides SET status = 'expired', revision = revision + 1, updated_at = now() WHERE status = 'waiting' AND expires_at <= now()", []);
  const getRide = async id => (await query(`${SELECT_RIDES} WHERE r.id = $1`, [id]))[0];

  return async function handle(req, res) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };

    try {
      if (!query || !accessCode || accessCode.length < 16) throw new PilotError(503, "Вътрешният тест още не е активиран. Свържи се с екипа на RIVO.", "NOT_CONFIGURED");
      if (!["GET", "POST"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST");
        throw new PilotError(405, "Неподдържано действие.");
      }
      const action = new URL(req.url, "http://localhost").searchParams.get("action") || "state";
      let body;
      if (req.method === "POST") {
        if (req.headers.origin) {
          let origin;
          try { origin = new URL(req.headers.origin); } catch { throw new PilotError(403, "Неразрешен източник."); }
          if (origin.host !== req.headers.host) throw new PilotError(403, "Неразрешен източник.");
        }
        body = await readBody(req);
      }

      if (action === "login" && req.method === "POST") {
        const address = req.headers["x-vercel-forwarded-for"] || req.socket?.remoteAddress || "unknown";
        const addressHash = createHmac("sha256", accessCode).update(String(address)).digest("hex");
        const limits = await query(`INSERT INTO rivo_pilot_login_attempts (address_hash, attempts, reset_at)
          VALUES ($1, 1, now() + interval '15 minutes')
          ON CONFLICT (address_hash) DO UPDATE SET
            attempts = CASE WHEN rivo_pilot_login_attempts.reset_at <= now() THEN 1 ELSE rivo_pilot_login_attempts.attempts + 1 END,
            reset_at = CASE WHEN rivo_pilot_login_attempts.reset_at <= now() THEN now() + interval '15 minutes' ELSE rivo_pilot_login_attempts.reset_at END
          RETURNING attempts`, [addressHash]);
        if (limits[0].attempts > 12) {
          res.setHeader("Retry-After", "900");
          throw new PilotError(429, "Твърде много опити. Опитай отново след 15 минути.", "RATE_LIMITED");
        }
        if (typeof body.code !== "string" || !timingSafeEqual(Buffer.from(hash(body.code)), Buffer.from(gateHash))) throw new PilotError(401, "Кодът за вътрешния тест е невалиден.", "INVALID_CODE");
        if (!["customer", "driver"].includes(body.role)) throw new PilotError(400, "Избери пътник или шофьор.");
        const name = text(body.name, "Име");
        const type = body.role === "driver" ? vehicleType(body.vehicleType) : null;
        const model = body.role === "driver" ? text(body.vehicleModel, "Автомобил") : null;
        const plate = body.role === "driver" ? text(body.vehiclePlate, "Регистрационен номер", 20) : null;
        const token = randomBytes(32).toString("base64url");
        const rows = await query(`INSERT INTO rivo_pilot_sessions
          (id, token_hash, gate_hash, role, display_name, vehicle_type, vehicle_model, vehicle_plate, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '24 hours') RETURNING *`,
        [randomUUID(), hash(token), gateHash, body.role, name, type, model, plate]);
        res.setHeader("Set-Cookie", cookie(token));
        return send(200, { participant: participant(rows[0]), tariffs: DEFAULT_TARIFFS });
      }

      const session = await sessionFor(req);
      if (action === "session" && req.method === "GET") return send(200, { participant: session ? participant(session) : null, tariffs: DEFAULT_TARIFFS });
      if (!session) throw new PilotError(401, "Влез отново във вътрешния тест.", "SESSION_REQUIRED");

      if (action === "quote" && req.method === "POST") {
        if (session.role !== "customer") throw new PilotError(403, "Само пътник може да изчисли цена за заявка.");
        const pickup = location(body.pickup, "взимане");
        const destination = location(body.destination, "дестинацията");
        const type = vehicleType(body.vehicleType);
        const quote = await quotes.issue({ sessionId: session.id, pickup, destination, vehicleType: type });
        return send(200, { quote });
      }

      if (action === "logout" && req.method === "POST") {
        const active = await query(`SELECT id FROM rivo_pilot_rides WHERE ${session.role === "customer" ? "customer_id" : "driver_id"} = $1 AND status = ANY($2::text[]) LIMIT 1`, [session.id, ACTIVE]);
        if (active[0]) throw new PilotError(409, "Приключи или откажи активния курс преди изход.", "ACTIVE_RIDE");
        await query("UPDATE rivo_pilot_sessions SET expires_at = now() WHERE id = $1", [session.id]);
        res.setHeader("Set-Cookie", cookie("", 0));
        return send(200, { ok: true });
      }

      await expireWaiting();
      if (action === "state" && req.method === "GET") {
        const mine = await query(`${SELECT_RIDES} WHERE r.${session.role === "customer" ? "customer_id" : "driver_id"} = $1 ORDER BY r.created_at DESC LIMIT 10`, [session.id]);
        const active = mine.find(row => ACTIVE.includes(row.status));
        const available = session.role === "driver" && !active
          ? await query(`${SELECT_RIDES} WHERE r.status = 'waiting' AND r.expires_at > now() AND r.vehicle_type = $1 ORDER BY r.created_at LIMIT 20`, [session.vehicle_type]) : [];
        return send(200, { participant: participant(session), tariffs: DEFAULT_TARIFFS, activeRide: active ? ride(active) : null, rides: mine.map(ride), requests: available.map(ride) });
      }

      if (action === "create" && req.method === "POST") {
        if (session.role !== "customer") throw new PilotError(403, "Само пътник може да изпрати заявка.");
        if (!UUID.test(body.idempotencyKey || "")) throw new PilotError(400, "Невалиден номер на заявката.");
        const existing = await query("SELECT id FROM rivo_pilot_rides WHERE customer_id = $1 AND idempotency_key = $2", [session.id, body.idempotencyKey]);
        if (existing[0]) return send(200, { ride: ride(await getRide(existing[0].id)) });
        const pickup = location(body.pickup, "взимане");
        const destination = location(body.destination, "дестинацията");
        const type = vehicleType(body.vehicleType);
        if (!Number.isInteger(body.passengers) || body.passengers < 1 || body.passengers > 4) throw new PilotError(400, "Пътниците трябва да са между 1 и 4.");
        const fare = await quotes.verify(body.quoteToken, { sessionId: session.id, pickup, destination, vehicleType: type });
        const rows = await query(`INSERT INTO rivo_pilot_rides
          (id, customer_id, idempotency_key, pickup, destination, vehicle_type, passengers, price_cents, fare_quote)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9::jsonb)
          ON CONFLICT (customer_id, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key RETURNING id`,
        [randomUUID(), session.id, body.idempotencyKey, JSON.stringify(pickup), JSON.stringify(destination), type, body.passengers, fare.priceCents, JSON.stringify(fare)]);
        return send(201, { ride: ride(await getRide(rows[0].id)) });
      }

      if (action === "transition" && req.method === "POST") {
        if (!UUID.test(body.rideId || "")) throw new PilotError(400, "Невалиден номер на курса.");
        const transitions = {
          accept: { role: "driver", from: ["waiting"], to: "accepted" },
          arrive: { role: "driver", from: ["accepted"], to: "arrived" },
          start: { role: "driver", from: ["arrived"], to: "in_progress" },
          complete: { role: "driver", from: ["in_progress"], to: "completed" },
          cancel: { role: session.role, from: session.role === "customer" ? ["waiting", "accepted", "arrived"] : ["accepted", "arrived"], to: "cancelled" }
        };
        const change = transitions[body.command];
        if (!change || change.role !== session.role) throw new PilotError(403, "Това действие не е разрешено.");
        const accepting = body.command === "accept";
        const ownership = accepting ? "vehicle_type = $4 AND expires_at > now()" : `${session.role === "customer" ? "customer_id" : "driver_id"} = $4`;
        const rows = await query(`UPDATE rivo_pilot_rides SET status = $2, updated_at = now(), revision = revision + 1${accepting ? ", driver_id = $5" : ""}
          WHERE id = $1 AND status = ANY($3::text[]) AND ${ownership} RETURNING id`,
        accepting ? [body.rideId, change.to, change.from, session.vehicle_type, session.id] : [body.rideId, change.to, change.from, session.id]);
        if (!rows[0]) throw new PilotError(409, "Заявката вече е променена. Обнови списъка.", "RIDE_CONFLICT");
        return send(200, { ride: ride(await getRide(rows[0].id)) });
      }

      throw new PilotError(404, "Действието не е намерено.");
    } catch (error) {
      if (error instanceof PilotError || error instanceof QuoteError || error instanceof RouteError) return send(error.status, { error: error.message, code: error.code });
      if (error.code === "23505") return send(409, { error: "Вече има активна заявка за този участник. Обнови списъка.", code: "RIDE_CONFLICT" });
      if (error.code === "42P01") return send(503, { error: "Вътрешният тест още не е активиран. Свържи се с екипа на RIVO.", code: "SCHEMA_NOT_READY" });
      reportError(error);
      return send(503, { error: "Връзката с RIVO прекъсна. Опитай отново.", code: "SERVICE_UNAVAILABLE" });
    }
  };
}
