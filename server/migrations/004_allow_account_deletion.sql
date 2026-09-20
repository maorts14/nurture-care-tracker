ALTER TABLE care_gap ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE care_gap DROP CONSTRAINT care_gap_created_by_fkey;
ALTER TABLE care_gap
  ADD CONSTRAINT care_gap_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES app_user(id) ON DELETE SET NULL;

ALTER TABLE activity_log ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE activity_log DROP CONSTRAINT activity_log_created_by_fkey;
ALTER TABLE activity_log
  ADD CONSTRAINT activity_log_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES app_user(id) ON DELETE SET NULL;
