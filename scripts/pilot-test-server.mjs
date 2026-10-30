// Local test harness only. Deployments always use api/pilot.js and Neon Postgres.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, relative, isAbsolute } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createPilotHandler } from "../server/pilot-handler.js";
import { createNotificationsHandler } from "../server/notifications-handler.js";
import { createAuthHandler, createAuthTransport, createIdentityResolver } from "../server/account-auth.js";
import { createAccounts } from "../server/accounts.js";
import { authFixture } from "../tests/helpers/auth-fixture.mjs";
import { memberQuery } from "../server/member-query.js";
import { createRideAlerts } from "../server/ride-alerts.js";

const db = new PGlite();
await db.exec(await readFile(new URL("../server/pilot-schema.sql", import.meta.url), "utf8"));
await db.exec(await readFile(new URL("../server/notifications-schema.sql", import.meta.url), "utf8"));
await db.exec(await readFile(new URL("../server/accounts-schema.sql", import.meta.url), "utf8"));
await db.exec(await readFile(new URL("../server/ride-alerts-schema.sql", import.meta.url), "utf8"));
const query = async (statement, parameters) => (await db.query(statement, parameters)).rows;
const transport = createAuthTransport({ baseUrl: "https://ep-test.neonauth.eu-central-1.aws.neon.tech/rivo_pilot/auth", fetcher: authFixture().fetcher });
const accounts = createAccounts({ query, resolveIdentity: createIdentityResolver({ transport }), reviewerEmails: ["reviewer@example.invalid", "alerts-reviewer@example.invalid", "retry-reviewer@example.invalid", "contact-reviewer@example.invalid"] });
const rideAlerts = createRideAlerts({ query, publicKey: "B" + "A".repeat(86), sendPush: async () => {} });
const auth = createAuthHandler({ query, transport, beforeSignOut: rideAlerts.revoke, rateSecret: "local-test-rate-secret-with-at-least-32-characters" });
const memberRides = createPilotHandler({ query: memberQuery(query), rideAlerts, resolveParticipant: accounts.participantFor, resolveRoute: async () => ({ distanceMeters: 1800, durationSeconds: 300, routeSource: "test-fixture" }) });
const notifications = createNotificationsHandler({
  query: async (statement, parameters) => (await db.query(statement, parameters)).rows,
  publicKey: "B" + "A".repeat(86), sendPush: async () => {}, production: false,
  cronSecret: "local-test-cron-secret"
});
const handle = createPilotHandler({
  query: async (statement, parameters) => (await db.query(statement, parameters)).rows,
  accessCode: "rivo-local-test-invitation", secureCookies: false,
  // Deterministic road-provider fixtures for offline browser tests only.
  resolveRoute: async (_pickup, destination) => destination.lat > 42.65
    ? { distanceMeters: 35000, durationSeconds: 2400, routeSource: "test-fixture" }
    : { distanceMeters: 1800, durationSeconds: 300, routeSource: "test-fixture" }
});
const root = resolve("dist");
const types = { ".js": "application/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/pilot") return handle(req, res);
  if (url.pathname === "/api/account") return accounts.handle(req, res);
  if (url.pathname === "/api/member-rides") return memberRides(req, res);
  if (url.pathname.startsWith("/api/auth/")) return auth(req, res);
  if (url.pathname === "/api/notifications") return notifications(req, res);
  const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
  const pathFromRoot = relative(root, path);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) { res.writeHead(403); res.end(); return; }
  try {
    let data;
    let file = path;
    try { data = await readFile(file); } catch { file = resolve(root, "index.html"); data = await readFile(file); }
    res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
    res.end(data);
  } catch { res.writeHead(500); res.end("Build the app before running browser tests."); }
});
server.listen(4178, "127.0.0.1", () => console.log("Local pilot test server: http://127.0.0.1:4178/pilot"));
async function close() { server.close(); await db.close(); process.exit(0); }
process.on("SIGTERM", close);
process.on("SIGINT", close);
