import { Pool } from "pg";

function localConnectionString() {
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? "nurture");
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? "nurture_local_only");
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const database = encodeURIComponent(process.env.POSTGRES_DB ?? "nurture");
  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? localConnectionString(),
});
