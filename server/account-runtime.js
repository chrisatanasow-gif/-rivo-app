import { neon } from "@neondatabase/serverless";
import { createAuthHandler, createAuthTransport, createIdentityResolver } from "./account-auth.js";
import { createAccounts } from "./accounts.js";
import { createPilotHandler } from "./pilot-handler.js";
import { memberQuery } from "./member-query.js";

let runtime;
export function accountRuntime() {
  if (runtime) return runtime;
  const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
  const query = sql ? (statement, parameters) => sql.query(statement, parameters) : null;
  const transport = createAuthTransport({ baseUrl: process.env.NEON_AUTH_BASE_URL });
  const accounts = createAccounts({ query, resolveIdentity: createIdentityResolver({ transport }), reviewerEmails: (process.env.RIVO_REVIEWER_EMAILS || "").split(",") });
  runtime = { accounts: accounts.handle, auth: createAuthHandler({ query, transport, rateSecret: process.env.RIVO_AUTH_RATE_SECRET }),
    rides: createPilotHandler({ query: query ? memberQuery(query) : null, resolveParticipant: accounts.participantFor }) };
  return runtime;
}
