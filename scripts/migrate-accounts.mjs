import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("Load the dedicated Preview DATABASE_URL before migrating accounts.");
const sql = neon(process.env.DATABASE_URL);
const statements = [];
for (const file of ["pilot", "accounts"]) {
  const schema = await readFile(new URL(`../server/${file}-schema.sql`, import.meta.url), "utf8");
  statements.push(...schema.split(";").map(x => x.trim()).filter(Boolean));
}
try {
  await sql.transaction([sql.query("SELECT pg_advisory_xact_lock(hashtext('rivo-accounts-schema-v1'))", []), ...statements.map(x => sql.query(x, []))]);
  console.log("RIVO account schema is ready.");
} catch (error) {
  console.error("Account migration failed:", error.code || error.name); process.exit(1);
}
