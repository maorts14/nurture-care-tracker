import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

const localTestDatabaseUrl =
  "postgres://feedme_test:feedme_test_only@127.0.0.1:5433/feedme_test";

export function testDatabaseUrl() {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? localTestDatabaseUrl;
}

function ensureTestDatabase(url: string) {
  if (new URL(url).pathname !== "/feedme_test") {
    throw new Error("Tests only run against the feedme_test database.");
  }
}

export async function resetTestDatabase({ seed = true } = {}) {
  const connectionString = testDatabaseUrl();
  ensureTestDatabase(connectionString);
  const pool = new Pool({ connectionString });
  const schemaPath = join(process.cwd(), "server", "schema.sql");
  const seedPath = join(process.cwd(), "server", "seed.sql");

  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await pool.query(await readFile(schemaPath, "utf8"));
    if (seed) await pool.query(await readFile(seedPath, "utf8"));
  } finally {
    await pool.end();
  }
}
