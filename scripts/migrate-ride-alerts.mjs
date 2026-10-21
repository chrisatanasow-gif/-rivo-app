import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
if (!process.env.DATABASE_URL) throw new Error("Load the dedicated Preview database before migrating ride alerts.");
const sql = neon(process.env.DATABASE_URL);
const schema = await readFile(new URL("../server/ride-alerts-schema.sql", import.meta.url), "utf8");
// Keep dollar-quoted function bodies intact; never split them on internal semicolons.
const statements = schema.replace(/^--.*$/gm, "").match(/(?:\$\$[\s\S]*?\$\$|[^;])+/g).map(value => value.trim()).filter(Boolean);
try {
  await sql.transaction([sql.query("SELECT pg_advisory_xact_lock(hashtext('rivo-ride-alerts-schema-v1'))", []), ...statements.map(statement => sql.query(statement, []))]);
  console.log("RIVO availability and ride alert schema is ready.");
} catch (error) { console.error("Ride alert migration failed:", error.code || error.name); process.exit(1); }
