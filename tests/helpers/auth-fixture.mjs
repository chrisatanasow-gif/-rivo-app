// In-memory provider contract for tests only. Never imported by a deployed API.
import { randomUUID } from "node:crypto";
export function authFixture() {
  const users = new Map(), sessions = new Map(), otps = new Map();
  let lastRequest;
  return { users, sessions, otps, get lastRequest() { return lastRequest; },
    fetcher: async (url, options) => {
      const path = new URL(url).pathname.split("/auth/")[1];
      const body = options.body ? JSON.parse(options.body) : null;
      lastRequest = { path, body, headers: options.headers };
      const cookie = options.headers.Cookie || "";
      const token = cookie.split("=")[1];
      if (path === "email-otp/send-verification-otp") { otps.set(body.email, "123456"); return Response.json({ success: true }); }
      if (path === "sign-in/email-otp") {
        if (!otps.has(body.email) || otps.get(body.email) !== body.otp) return Response.json({ code: "INVALID_OTP" }, { status: 400 });
        otps.delete(body.email);
        if (!users.has(body.email)) users.set(body.email, { id: randomUUID(), email: body.email, emailVerified: true, name: body.email.split("@")[0] });
        const session = { token: randomUUID(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
        const user = users.get(body.email);
        sessions.set(session.token, { user, session });
        return Response.json({ token: session.token, user }, { headers: { "Set-Cookie": `__Secure-neon-auth.session_token=${session.token}; Domain=example.neon.tech; Path=/; HttpOnly; Secure; SameSite=None; Partitioned` } });
      }
      if (path === "sign-out") { sessions.delete(token); return Response.json({ success: true }, { headers: { "Set-Cookie": "__Secure-neon-auth.session_token=; Path=/; Max-Age=0; HttpOnly; Secure" } }); }
      if (path === "get-session") return Response.json(sessions.get(token) || null);
      return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    }
  };
}
