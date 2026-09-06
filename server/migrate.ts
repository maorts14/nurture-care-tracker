import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationsDir = join(process.cwd(), "server", "migrations");

async function migrate() {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  for (const name of (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort()) {
    const known = await pool.query("SELECT 1 FROM schema_migration WHERE name = $1", [name]);
    if (known.rowCount) continue;
    const client = await pool.connect();
    try { await client.query("BEGIN"); await client.query(await readFile(join(migrationsDir, name), "utf8")); await client.query("INSERT INTO schema_migration (name) VALUES ($1)", [name]); await client.query("COMMIT"); console.log(`Applied migration ${name}`); } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  await pool.end();
}
migrate().catch((error) => { console.error(error); process.exitCode = 1; });
