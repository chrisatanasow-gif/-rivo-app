import { createHash, timingSafeEqual } from "node:crypto";
import { dailyOffer, offerNotification } from "../shared/daily-offers.js";
const hash = value => createHash("sha256").update(value).digest("hex");
const TOKEN = /^[a-f0-9]{64}$/;
class PushError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function cleanPushSubscription(value) {
  if (!value || typeof value.endpoint !== "string" || value.endpoint.length > 2048) throw new PushError(400, "Невалиден абонамент за известия.");
  let url;
  try { url = new URL(value.endpoint); } catch { throw new PushError(400, "Невалиден адрес за известия."); }
  const host = url.hostname;
  const trusted = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host === "web.push.apple.com"
    || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com");
  if (!trusted || url.protocol !== "https:" || url.port || url.username || url.password || url.hash) throw new PushError(400, "Неподдържан доставчик на известия.");
  const keys = value.keys;
  if (!keys || typeof keys.p256dh !== "string" || !/^[A-Za-z0-9_-]{87}$/.test(keys.p256dh)
    || Buffer.from(keys.p256dh, "base64url").length !== 65 || Buffer.from(keys.p256dh, "base64url")[0] !== 4
    || typeof keys.auth !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(keys.auth) || Buffer.from(keys.auth, "base64url").length !== 16) throw new PushError(400, "Невалидни ключове за известия.");
  return { endpoint: url.href, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

async function body(req) {
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") throw new PushError(415, "Изпрати JSON заявка.");
  let value = req.body;
  if (value === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 4096) throw new PushError(413, "Заявката е прекалено голяма."); chunks.push(Buffer.from(chunk)); }
    value = Buffer.concat(chunks).toString();
  }
  if (Buffer.isBuffer(value)) value = value.toString();
  if (typeof value === "string") { if (Buffer.byteLength(value) > 4096) throw new PushError(413, "Заявката е прекалено голяма."); try { value = JSON.parse(value); } catch { throw new PushError(400, "Невалидна заявка."); } }
  if (!value || typeof value !== "object" || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value)) > 4096) throw new PushError(400, "Невалидна заявка.");
  return value;
}

export function createNotificationsHandler({ query, publicKey, sendPush, cronSecret, production = false, now = () => new Date(), reportError = err => console.error("RIVO push", err.code || err.statusCode || err.name) }) {
  const available = Boolean(query && publicKey && sendPush);
  async function deliver(row, payload) {
    try { await sendPush(row.subscription, payload); return "sent"; }
    catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) { await query("DELETE FROM rivo_push_subscriptions WHERE token_hash = $1", [row.token_hash]); return "expired"; }
      reportError(err);
      return "failed";
    }
  }
  return async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const reply = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    try {
      const action = new URL(req.url, "http://localhost").searchParams.get("action") || "config";
      if (action === "config" && req.method === "GET") return reply(200, { available, publicKey: available ? publicKey : null, scheduled: available && production && Boolean(cronSecret), offer: dailyOffer(now()) });
      const bearer = req.headers.authorization?.replace(/^Bearer /, "") || "";
      if (action === "dispatch") {
        if (req.method !== "GET") throw new PushError(405, "Неподдържан метод.");
        if (!cronSecret || !timingSafeEqual(Buffer.from(hash(bearer)), Buffer.from(hash(cronSecret)))) throw new PushError(401, "Неоторизирана заявка.");
        if (!production) return reply(200, { sent: 0, skipped: "preview", scheduled: false });
        if (!available) throw new PushError(503, "Известията още не са настроени.");
        const date = dailyOffer(now()).dateKey;
        const payload = offerNotification(now());
        const totals = { sent: 0, failed: 0, expired: 0, skipped: 0 };
        // Short bounded batches; each recipient/day is claimed atomically across instances.
        let cursor = "";
        const deadline = Date.now() + 240000;
        let hasMore = false;
        do {
          const rows = await query("SELECT token_hash, subscription FROM rivo_push_subscriptions WHERE token_hash > $1 ORDER BY token_hash LIMIT 50", [cursor]);
          hasMore = rows.length === 50;
          for (let start = 0; start < rows.length; start += 10) {
            await Promise.all(rows.slice(start, start + 10).map(async row => {
              let claim;
              try {
                claim = await query(`INSERT INTO rivo_push_deliveries(token_hash, offer_date, status) VALUES ($1, $2, 'sending')
                  ON CONFLICT (token_hash, offer_date) DO UPDATE SET status = 'sending', attempts = rivo_push_deliveries.attempts + 1, updated_at = now()
                  WHERE rivo_push_deliveries.status = 'failed' AND rivo_push_deliveries.attempts < 3 RETURNING token_hash`, [row.token_hash, date]);
              } catch (err) { if (err.code === "23503") { totals.skipped++; return; } throw err; }
              if (!claim.length) { totals.skipped++; return; }
              // Opt-out may have happened after the batch was read.
              const current = await query("SELECT token_hash, subscription FROM rivo_push_subscriptions WHERE token_hash = $1", [row.token_hash]);
              if (!current.length) { totals.skipped++; return; }
              const status = await deliver(current[0], payload);
              totals[status]++;
              if (status !== "expired") await query("UPDATE rivo_push_deliveries SET status = $3, updated_at = now() WHERE token_hash = $1 AND offer_date = $2", [row.token_hash, date, status]);
            }));
          }
          if (rows.length) cursor = rows.at(-1).token_hash;
        } while (hasMore && Date.now() < deadline);
        // Keep receipts for 30 days, with no endpoint or payload copied into the ledger.
        await query("DELETE FROM rivo_push_deliveries WHERE offer_date < $1::date - 30", [date]);
        return reply(hasMore ? 503 : 200, { ...totals, hasMore });
      }
      if (!available) throw new PushError(503, "Известията на телефона още се подготвят.");
      if (!TOKEN.test(bearer)) throw new PushError(401, "Невалиден ключ за това устройство.");
      const tokenHash = hash(bearer);
      if (action === "status" && req.method === "GET") {
        const rows = await query("SELECT token_hash FROM rivo_push_subscriptions WHERE token_hash = $1", [tokenHash]);
        return reply(200, { active: rows.length > 0 });
      }
      if (req.method !== "POST" || !["subscribe", "unsubscribe", "test"].includes(action)) throw new PushError(405, "Неподдържан метод.");
      if (req.headers.origin) {
        let origin;
        try { origin = new URL(req.headers.origin); } catch { throw new PushError(403, "Невалиден произход."); }
        if (origin.host !== req.headers.host) throw new PushError(403, "Заявката трябва да е от RIVO.");
      }
      const data = await body(req);
      if (action === "subscribe") {
        const subscription = cleanPushSubscription(data.subscription);
        try {
          await query(`INSERT INTO rivo_push_subscriptions(token_hash, endpoint_hash, subscription) VALUES ($1, $2, $3)
            ON CONFLICT (token_hash) DO UPDATE SET endpoint_hash = EXCLUDED.endpoint_hash, subscription = EXCLUDED.subscription, updated_at = now()`, [tokenHash, hash(subscription.endpoint), JSON.stringify(subscription)]);
        } catch (err) { if (err.code === "23505") throw new PushError(409, "Този браузър вече има абонамент. Изключи го от настройките на сайта и опитай отново."); throw err; }
        return reply(200, { active: true });
      }
      if (action === "unsubscribe") {
        await query("DELETE FROM rivo_push_subscriptions WHERE token_hash = $1", [tokenHash]);
        return reply(200, { active: false });
      }
      const rows = await query(`UPDATE rivo_push_subscriptions SET test_sent_at = now() WHERE token_hash = $1
        AND (test_sent_at IS NULL OR test_sent_at < now() - interval '1 minute') RETURNING token_hash, subscription`, [tokenHash]);
      if (!rows.length) { res.setHeader("Retry-After", "60"); throw new PushError(429, "Няма активен абонамент или вече изпратихме тест. Изчакай една минута."); }
      const status = await deliver(rows[0], offerNotification(now(), true));
      if (status === "expired") throw new PushError(410, "Абонаментът е изтекъл. Включи известията отново.");
      if (status === "failed") throw new PushError(502, "Не успяхме да изпратим известието. Опитай отново след минута.");
      return reply(200, { sent: true });
    } catch (err) {
      if (!err.status) reportError(err);
      return reply(err.status || 503, { error: err.status ? err.message : "Известията временно не са налични. Опитай отново." });
    }
  };
}
