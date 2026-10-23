import { neon } from "@neondatabase/serverless";
import { createPilotHandler } from "../server/pilot-handler.js";

let handler;

export default async function pilot(req, res) {
  if (!handler) {
    const connectionString = process.env.DATABASE_URL;
    let sql;
    handler = createPilotHandler({
      query: connectionString ? (statement, parameters) => {
        sql ||= neon(connectionString);
        return sql.query(statement, parameters);
      } : null,
      accessCode: process.env.RIVO_PILOT_CODE,
      secureCookies: process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
    });
  }
  return handler(req, res);
}
