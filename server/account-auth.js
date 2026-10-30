import { createHmac } from "node:crypto";
import { AccountError, jsonBody, privateResponse, sameOrigin } from "./account-http.js";

// Only the signed provider session cookie crosses the upstream boundary.
// A browser-supplied session_data cookie is never accepted as an identity.
const COOKIE = "__Secure-neon-auth.session_token";
export function authCookie(req) {
  const value = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`)) || "";
  return value.length <= 2048 ? value : "";
}

export function createAuthTransport({ baseUrl, fetcher = fetch }) {
  const url = baseUrl ? new URL(baseUrl) : null;
  if (url && (url.protocol !== "https:" || !url.hostname.includes(".neonauth.") || !url.hostname.endsWith(".neon.tech"))) throw new Error("Invalid Neon Auth URL");
  return async (path, req, body) => {
    if (!url) throw new AccountError(503, "Входът с имейл още се настройва.", "AUTH_NOT_CONFIGURED");
    const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/${path}`, {
      method: body === undefined ? "GET" : "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000),
      headers: { "Content-Type": "application/json", "Origin": req.headers.origin || `${req.headers["x-forwarded-proto"] === "http" ? "http" : "https"}://${req.headers.host}`, "x-neon-auth-proxy": "rivo-vercel", ...(authCookie(req) ? { Cookie: authCookie(req) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return response;
  };
}

export function createIdentityResolver({ transport }) {
  return async req => {
    if (!authCookie(req)) return null;
    const response = await transport("get-session?disableCookieCache=true", req);
    if ([401, 403].includes(response.status)) return null;
    if (!response.ok) throw new AccountError(503, "Не успяхме да потвърдим входа. Опитай отново.");
    const data = await response.json();
    if (!data?.session || !data.user || data.user.emailVerified !== true || data.user.banned
      || !Number.isFinite(new Date(data.session.expiresAt).getTime()) || new Date(data.session.expiresAt).getTime() <= Date.now()
      || typeof data.user.id !== "string" || !data.user.id || typeof data.user.email !== "string") return null;
    return { subject: data.user.id, email: data.user.email.toLowerCase(), name: data.user.name, expiresAt: data.session.expiresAt };
  };
}

export function createAuthHandler({ query, transport, rateSecret, beforeSignOut, reportError = e => console.error("RIVO auth", e.code || e.name) }) {
  return async (req, res) => {
    const send = privateResponse(res);
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.searchParams.get("authPath") || url.pathname.replace(/^\/api\/auth\//, "");
      const methods = { "get-session": "GET", "email-otp/send-verification-otp": "POST", "sign-in/email-otp": "POST", "sign-out": "POST" };
      if (!Object.hasOwn(methods, path)) throw new AccountError(404, "Неподдържано действие.");
      if (req.method !== methods[path]) throw new AccountError(405, "Неподдържано действие.");
      sameOrigin(req);
      let body;
      if (req.method === "POST") {
        body = await jsonBody(req);
        if (path !== "sign-out") {
          const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
          if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError(400, "Въведи валиден имейл.");
          if (path === "sign-in/email-otp" && !/^\d{6}$/.test(body.otp || "")) throw new AccountError(400, "Кодът трябва да е от 6 цифри.");
          body = path === "sign-in/email-otp" ? { email, otp: body.otp } : { email, type: "sign-in" };
          if (!query || !rateSecret || rateSecret.length < 32) throw new AccountError(503, "Входът с имейл още се настройва.");
          const address = req.headers["x-vercel-forwarded-for"] || req.socket?.remoteAddress || "unknown";
          // HMAC keys avoid storing email addresses and IPs in the limiter.
          // Both sending and verification are bounded across serverless instances.
          for (const [scope, value, limit] of [["address", String(address), 40], ["email", email, path.startsWith("sign-in") ? 20 : 6]]) {
            const key = createHmac("sha256", rateSecret).update(`${path}:${scope}:${value}`).digest("hex");
            const [row] = await query(`INSERT INTO rivo_account_limits (key_hash, attempts, reset_at, last_at) VALUES ($1, 1, now() + interval '1 hour', now())
              ON CONFLICT (key_hash) DO UPDATE SET attempts = CASE WHEN rivo_account_limits.reset_at <= now() THEN 1 ELSE rivo_account_limits.attempts + 1 END,
              reset_at = CASE WHEN rivo_account_limits.reset_at <= now() THEN now() + interval '1 hour' ELSE rivo_account_limits.reset_at END,
              last_at = now()
              WHERE NOT $2::boolean OR rivo_account_limits.last_at <= now() - interval '60 seconds'
              RETURNING attempts, last_at`, [key, scope === "email" && !path.startsWith("sign-in")]);
            if (!row) { res.setHeader("Retry-After", "60"); throw new AccountError(429, "Изчакай 60 секунди преди нов код.", "RATE_LIMITED"); }
            // Provider enforces OTP validity, one-time use and its own cooldown.
            if (row.attempts > limit) { res.setHeader("Retry-After", "3600"); throw new AccountError(429, "Твърде много опити. Опитай отново след час.", "RATE_LIMITED"); }
          }
        } else body = {};
      }
      if (path === "sign-out" && beforeSignOut) await beforeSignOut(req);
      const response = await transport(path, req, body);
      const cookies = response.headers.getSetCookie().filter(x => x.startsWith(`${COOKIE}=`)).map(x => x.replace(/;\s*Domain=[^;]*/ig, "").replace(/;\s*Path=[^;]*/ig, "").replace(/;\s*(?:SameSite=[^;]*|Partitioned)/ig, "") + "; Path=/; SameSite=Lax");
      if (cookies.length) res.setHeader("Set-Cookie", cookies);
      const data = await response.json();
      // Do not expose provider session tokens in JavaScript or network JSON.
      if (!response.ok) return send(response.status >= 500 ? 503 : response.status, { code: data?.code || "AUTH_FAILED", message: response.status === 429 ? "Твърде много опити. Изчакай и опитай отново." : path === "sign-in/email-otp" ? "Кодът е грешен или е изтекъл. Провери имейла си или поискай нов." : "Не успяхме да изпратим кода. Опитай отново след малко." });
      if (path === "get-session") return send(200, data?.user ? { user: { id: data.user.id, email: data.user.email, emailVerified: data.user.emailVerified } } : null);
      return send(200, { success: true });
    } catch (error) {
      if (error instanceof AccountError) return send(error.status, { code: error.code, message: error.message });
      reportError(error); return send(503, { code: "AUTH_UNAVAILABLE", message: "Връзката с входа прекъсна. Опитай отново." });
    }
  };
}
