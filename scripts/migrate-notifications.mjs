import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const connection = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connection || new URL(connection).hostname.includes("-pooler")) {
  console.error("Load the dedicated preview database direct connection as DATABASE_URL_UNPOOLED before migrating.");
  process.exit(1);
}
const sql = neon(connection);
const schema = await readFile(new URL("../server/notifications-schema.sql", import.meta.url), "utf8");
try {
  await sql.transaction([
    sql.query("SELECT pg_advisory_xact_lock(hashtext('rivo-notifications-v1'))", []),
    ...schema.split(";").map(statement => statement.trim()).filter(Boolean).map(statement => sql.query(statement, []))
  ]);
  console.log("RIVO notification schema is ready.");
} catch (err) { console.error("Notification schema migration failed:", err.code || err.name); process.exit(1); }
