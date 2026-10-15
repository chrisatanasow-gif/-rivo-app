import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Connect the preview database and load the project environment first.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const schema = await readFile(new URL("../server/pilot-schema.sql", import.meta.url), "utf8");
const statements = schema.split(";").map(statement => statement.trim()).filter(Boolean);
try {
  await sql.transaction([
    sql.query("SELECT pg_advisory_xact_lock(hashtext('rivo-pilot-schema-v1'))", []),
    ...statements.map(statement => sql.query(statement, []))
  ]);
  console.log("RIVO pilot schema is ready.");
} catch (error) {
  console.error("Pilot schema migration failed:", error.code || error.name);
  process.exit(1);
}
