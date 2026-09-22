import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { Pool } from "pg";
import { resetTestDatabase, testDatabaseUrl } from "../support/database.js";

test("activity schedule migration preserves linked, unlinked, and duplicate legacy reminders", async () => {
  await resetTestDatabase({ seed: false });
  const pool = new Pool({ connectionString: testDatabaseUrl() });
  try {
    const migrationSql = await readFile(
      join(process.cwd(), "server", "migrations", "006_add_activity_schedules.sql"),
      "utf8",
    );
    await pool.query(migrationSql);
    await pool.query("DROP TABLE activity_schedule");
    await pool.query(`
      CREATE TABLE reminder (
        id UUID PRIMARY KEY,
        child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
        activity_id UUID REFERENCES activity_definition(id) ON DELETE SET NULL,
        kind reminder_kind NOT NULL,
        interval_minutes INTEGER,
        scheduled_for TIMESTAMPTZ,
        title TEXT NOT NULL,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      INSERT INTO child (id, name, timezone)
      VALUES ('33333333-3333-3333-3333-333333333333', 'Leo', 'Asia/Jerusalem');
      INSERT INTO activity_definition (id, child_id, name, kind, color)
      VALUES ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Feeding', 'feeding', '#ba5c30');
      INSERT INTO reminder (id, child_id, activity_id, kind, interval_minutes, scheduled_for, title)
      VALUES
        ('90000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'interval', 180, NULL, 'Feeding window'),
        ('90000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', NULL, 'one_time', NULL, '2026-09-22T09:00:00.000Z', 'Doctor appointment'),
        ('90000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'interval', 480, NULL, 'Second feeding reminder')
    `);
    await pool.query(migrationSql);

    const schedules = await pool.query<{ activity_id: string; kind: string; interval_minutes: number | null }>(
      "SELECT activity_id, kind, interval_minutes FROM activity_schedule ORDER BY activity_id",
    );
    assert.deepEqual(schedules.rows, [
      { activity_id: "44444444-4444-4444-4444-444444444444", kind: "interval", interval_minutes: 180 },
      { activity_id: "90000000-0000-0000-0000-000000000002", kind: "one_time", interval_minutes: null },
      { activity_id: "90000000-0000-0000-0000-000000000003", kind: "interval", interval_minutes: 480 },
    ]);
    const migratedActivities = await pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM activity_definition WHERE id IN ($1, $2) ORDER BY id",
      ["90000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000003"],
    );
    assert.deepEqual(migratedActivities.rows, [
      { id: "90000000-0000-0000-0000-000000000002", name: "Doctor appointment" },
      { id: "90000000-0000-0000-0000-000000000003", name: "Second feeding reminder" },
    ]);
  } finally {
    await pool.end();
  }
});
