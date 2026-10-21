import { createHash, randomUUID } from "node:crypto";
import { AccountError } from "./account-http.js";
import { cleanPushSubscription } from "./notifications-handler.js";
import { authCookie } from "./account-auth.js";

export const sessionHash = req => createHash("sha256").update(authCookie(req)).digest("hex");
const hash = value => createHash("sha256").update(value).digest("hex");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const online = row => Boolean(row?.online && new Date(row.expires_at).getTime() > Date.now());
const view = row => ({ online: online(row), revision: row?.revision || 0, leaseId: online(row) ? row.lease_id : null, expiresAt: row?.expires_at || null });
const messages = {
  request: ["Нова заявка за RIVO", "Отвори RIVO, за да прегледаш заявката. Приемането се потвърждава в приложението."],
  accepted: ["Шофьорът прие", "Шофьорът идва към мястото за взимане."],
  arrived: ["Шофьорът пристигна", "Насочи се към автомобила. Виж подробностите в RIVO."],
  in_progress: ["Пътуването започна", "Виж активния си курс в RIVO."],
  completed: ["Курсът е завършен", "Подробностите за курса са в RIVO."],
  cancelled: ["Курсът е отказан", "Отвори RIVO за актуалното състояние."],
  expired: ["Няма приел шофьор", "Заявката изтече. Можеш да опиташ отново в RIVO."]
};

// Check again immediately before sending AND in the worker before displaying.
const CURRENT = `SELECT e.*, s.id AS device_id, s.subscription, s.origin, s.auth_session_hash
  FROM rivo_ride_events e JOIN rivo_ride_subscriptions s ON s.account_id = e.account_id AND s.role = e.role
  JOIN rivo_member_rides r ON r.id = e.ride_id
  JOIN rivo_member_sessions c ON c.id = r.customer_id
  LEFT JOIN rivo_member_sessions d ON d.account_id = e.account_id AND d.role = 'driver'
  LEFT JOIN rivo_driver_presence p ON p.participant_id = d.id
  LEFT JOIN rivo_driver_applications a ON a.account_id = d.account_id
  WHERE e.expires_at > now() AND r.revision = e.revision AND s.auth_expires_at > now() AND s.created_at <= e.created_at
    AND ((e.role = 'customer' AND c.account_id = e.account_id AND r.status = e.kind)
      OR (e.role = 'driver' AND e.kind = 'cancelled' AND r.driver_id = d.id AND r.status = 'cancelled')
      OR (e.role = 'driver' AND e.kind = 'request' AND r.status = 'waiting' AND r.expires_at > now()
        AND p.online AND p.expires_at > now() AND c.account_id <> d.account_id
        AND a.status = 'approved' AND a.permit_valid_until >= (now() AT TIME ZONE 'Europe/Sofia')::date
        AND NOT EXISTS (SELECT 1 FROM rivo_member_rides busy WHERE busy.driver_id = d.id AND busy.status IN ('accepted', 'arrived', 'in_progress'))))`;
function payload(row) {
  const [title, body] = messages[row.kind];
  return { type: "ride", title, body, eventId: String(row.id), deviceId: row.device_id, role: row.role,
    expiresAt: row.expires_at, tag: `rivo-ride-${row.id}`,
    url: `/account/${row.role === "driver" ? "drive" : "ride"}?ride=${row.ride_id}` };
}

export function createRideAlerts({ query, publicKey, sendPush, reportError = e => console.error("RIVO ride alerts", e.code || e.statusCode || e.name) }) {
  const available = Boolean(query && publicKey && sendPush);
  async function presence(session) {
    if (session.role !== "driver") return null;
    const [row] = await query("SELECT * FROM rivo_driver_presence WHERE participant_id = $1", [session.id]);
    return { ...view(row), online: Boolean(session.can_accept && online(row)) };
  }
  async function changePresence(session, body) {
    if (session.role !== "driver") throw new AccountError(403, "Само шофьор може да включи работен режим.");
    if (!["online", "offline", "heartbeat"].includes(body.command)) throw new AccountError(400, "Невалиден работен режим.");
    if (body.command !== "offline" && !session.can_accept) throw new AccountError(403, "Нужно е валидно одобрение за нови заявки.");
    await query("INSERT INTO rivo_driver_presence(participant_id) VALUES ($1) ON CONFLICT DO NOTHING", [session.id]);
    let rows;
    if (body.command === "online") {
      if (!Number.isInteger(body.revision) || !UUID.test(body.leaseId || "")) throw new AccountError(400, "Обнови работния режим.");
      rows = await query(`UPDATE rivo_driver_presence SET online = true, revision = revision + 1, lease_id = $3,
        auth_session_hash = $4, expires_at = LEAST(now() + interval '60 seconds', $5::timestamptz)
        WHERE participant_id = $1 AND revision = $2 RETURNING *`, [session.id, body.revision, body.leaseId, session.auth_session_hash, session.auth_expires_at]);
    } else {
      if (!UUID.test(body.leaseId || "")) throw new AccountError(400, "Обнови работния режим.");
      rows = await query(body.command === "heartbeat"
        ? `UPDATE rivo_driver_presence SET expires_at = LEAST(now() + interval '60 seconds', $4::timestamptz)
            WHERE participant_id = $1 AND online AND lease_id = $2 AND auth_session_hash = $3 AND expires_at > now() RETURNING *`
        : `UPDATE rivo_driver_presence SET online = false, revision = revision + 1, expires_at = now()
            WHERE participant_id = $1 AND lease_id = $2 RETURNING *`, body.command === "heartbeat" ? [session.id, body.leaseId, session.auth_session_hash, session.auth_expires_at] : [session.id, body.leaseId]);
    }
    if (!rows[0]) throw new AccountError(409, "Работният режим е променен или е изтекъл. Обнови и се включи отново.", "PRESENCE_CONFLICT");
    if (body.command === "online") await query(`INSERT INTO rivo_ride_events (ride_id, revision, account_id, role, kind, expires_at)
      SELECT r.id, r.revision, $2, 'driver', 'request', LEAST(r.expires_at, now() + interval '60 seconds')
      FROM rivo_member_rides r JOIN rivo_member_sessions c ON c.id = r.customer_id
      WHERE r.status = 'waiting' AND r.expires_at > now() AND c.account_id <> $2
        AND NOT EXISTS (SELECT 1 FROM rivo_member_rides b WHERE b.driver_id = $1 AND b.status IN ('accepted','arrived','in_progress'))
      ON CONFLICT DO NOTHING`, [session.id, session.account_id]);
    return { presence: view(rows[0]), serverTime: new Date().toISOString() };
  }
  async function config(session, req, endpoint) {
    if (endpoint && endpoint.length > 2048) throw new AccountError(400, "Невалидно устройство.");
    const [row] = endpoint ? await query(`SELECT id FROM rivo_ride_subscriptions WHERE endpoint_hash = $1 AND account_id = $2
      AND role = $3 AND auth_session_hash = $4 AND auth_expires_at > now()`, [hash(endpoint), session.account_id, session.role, sessionHash(req)]) : [];
    return { available, publicKey: available ? publicKey : null, active: Boolean(row) };
  }
  async function subscription(session, req, body) {
    if (!["subscribe", "unsubscribe"].includes(body.command)) throw new AccountError(400, "Невалидно действие за известия.");
    if (body.command === "unsubscribe") {
      if (typeof body.endpoint !== "string" || body.endpoint.length > 2048) throw new AccountError(400, "Невалидно устройство.");
      await query("DELETE FROM rivo_ride_subscriptions WHERE endpoint_hash = $1 AND account_id = $2 AND role = $3", [hash(body.endpoint), session.account_id, session.role]);
      return { active: false };
    }
    if (!available) throw new AccountError(503, "Известията за курс още се настройват.");
    let sub;
    try { sub = cleanPushSubscription(body.subscription); } catch (e) { throw new AccountError(e.status || 400, e.message); }
    const [{ n }] = await query("SELECT count(*)::int AS n FROM rivo_ride_subscriptions WHERE account_id = $1 AND auth_expires_at > now() AND endpoint_hash <> $2", [session.account_id, hash(sub.endpoint)]);
    if (n >= 5) throw new AccountError(409, "Известията са включени на 5 устройства. Изключи едно, преди да добавиш ново.");
    const origin = `${req.headers["x-forwarded-proto"] === "http" || req.headers.host.startsWith("127.0.0.1:") ? "http" : "https"}://${req.headers.host}`;
    await query(`INSERT INTO rivo_ride_subscriptions(id, endpoint_hash, account_id, role, auth_session_hash, auth_expires_at, origin, subscription)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (endpoint_hash) DO UPDATE SET
      account_id = EXCLUDED.account_id, role = EXCLUDED.role, auth_session_hash = EXCLUDED.auth_session_hash,
      auth_expires_at = EXCLUDED.auth_expires_at, origin = EXCLUDED.origin, subscription = EXCLUDED.subscription, created_at = now()`,
    [randomUUID(), hash(sub.endpoint), session.account_id, session.role, session.auth_session_hash, session.auth_expires_at, origin, JSON.stringify(sub)]);
    return { active: true };
  }
  async function check(session, req, search) {
    const eventId = search.get("eventId"), deviceId = search.get("deviceId");
    if (!/^\d{1,18}$/.test(eventId || "") || !UUID.test(deviceId || "")) throw new AccountError(400, "Невалидно известие.");
    const [row] = await query(`${CURRENT} AND e.id = $1 AND s.id = $2 AND e.account_id = $3 AND e.role = $4 AND s.auth_session_hash = $5`,
      [eventId, deviceId, session.account_id, session.role, sessionHash(req)]);
    return { notification: row ? payload(row) : null };
  }
  async function revoke(req) {
    const key = sessionHash(req);
    await query("DELETE FROM rivo_ride_subscriptions WHERE auth_session_hash = $1", [key]);
    await query("UPDATE rivo_driver_presence SET online = false, revision = revision + 1, expires_at = now() WHERE auth_session_hash = $1 AND online", [key]);
  }
  async function dispatch() {
    if (!available) return;
    // Claims survive function restarts. Stable notification tags make a retried send replace itself.
    const rows = await query(`${CURRENT} AND NOT EXISTS (SELECT 1 FROM rivo_ride_deliveries x WHERE x.event_id = e.id AND x.subscription_id = s.id
      AND (x.status IN ('sent','skipped') OR x.attempts >= 3 OR x.retry_at > now())) ORDER BY e.id LIMIT 8`, []);
    const results = await Promise.allSettled(rows.map(async row => {
      const claim = randomUUID();
      const got = await query(`INSERT INTO rivo_ride_deliveries(event_id,subscription_id,status,claim_id) VALUES ($1,$2,'sending',$3)
        ON CONFLICT (event_id,subscription_id) DO UPDATE SET status = 'sending', attempts = rivo_ride_deliveries.attempts + 1,
          claim_id = EXCLUDED.claim_id, retry_at = now() + interval '30 seconds'
        WHERE rivo_ride_deliveries.status IN ('failed','sending') AND rivo_ride_deliveries.retry_at <= now() AND rivo_ride_deliveries.attempts < 3 RETURNING event_id`, [row.id, row.device_id, claim]);
      if (!got.length) return;
      const [current] = await query(`${CURRENT} AND e.id = $1 AND s.id = $2`, [row.id, row.device_id]);
      let status = "skipped";
      if (current) try { await sendPush(current.subscription, payload(current)); status = "sent"; }
      catch (e) {
        if ([404,410].includes(e.statusCode)) await query("DELETE FROM rivo_ride_subscriptions WHERE id = $1", [row.device_id]);
        else { reportError(e); status = "failed"; }
      }
      await query("UPDATE rivo_ride_deliveries SET status = $4, retry_at = now() + interval '5 seconds' WHERE event_id = $1 AND subscription_id = $2 AND claim_id = $3", [row.id,row.device_id,claim,status]);
    }));
    for (const result of results) if (result.status === "rejected" && result.reason.code !== "23503") reportError(result.reason);
  }
  return { presence, changePresence, config, subscription, check, revoke, dispatch: () => dispatch().catch(reportError) };
}
