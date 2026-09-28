ALTER TABLE activity_definition
  ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'heart-pulse';
