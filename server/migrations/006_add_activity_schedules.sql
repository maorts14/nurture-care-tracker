CREATE TABLE IF NOT EXISTS activity_schedule (
  activity_id UUID PRIMARY KEY REFERENCES activity_definition(id) ON DELETE CASCADE,
  kind reminder_kind NOT NULL,
  interval_minutes INTEGER CHECK (interval_minutes > 0),
  scheduled_for TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'interval' AND interval_minutes IS NOT NULL AND scheduled_for IS NULL AND completed_at IS NULL)
    OR
    (kind = 'one_time' AND interval_minutes IS NULL AND scheduled_for IS NOT NULL)
  )
);

DO $$
BEGIN
  IF to_regclass('public.reminder') IS NOT NULL THEN
    WITH ranked_reminders AS (
      SELECT reminder.*,
        ROW_NUMBER() OVER (
          PARTITION BY reminder.activity_id
          ORDER BY reminder.created_at, reminder.id
        ) AS activity_schedule_position
      FROM reminder
      WHERE reminder.completed_at IS NULL
    )
    INSERT INTO activity_definition (id, child_id, name, kind, color)
    SELECT id, child_id, title, 'custom', '#8b68c8'
    FROM ranked_reminders
    WHERE activity_id IS NULL OR activity_schedule_position > 1
    ON CONFLICT (id) DO NOTHING;

    WITH ranked_reminders AS (
      SELECT reminder.*,
        ROW_NUMBER() OVER (
          PARTITION BY reminder.activity_id
          ORDER BY reminder.created_at, reminder.id
        ) AS activity_schedule_position
      FROM reminder
      WHERE reminder.completed_at IS NULL
    )
    INSERT INTO activity_schedule (
      activity_id,
      kind,
      interval_minutes,
      scheduled_for,
      created_at,
      updated_at
    )
    SELECT
      CASE
        WHEN activity_id IS NULL OR activity_schedule_position > 1 THEN id
        ELSE activity_id
      END,
      kind,
      interval_minutes,
      scheduled_for,
      created_at,
      created_at
    FROM ranked_reminders
    ON CONFLICT (activity_id) DO NOTHING;
  END IF;
END $$;
