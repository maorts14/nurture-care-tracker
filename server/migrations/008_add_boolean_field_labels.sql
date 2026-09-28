ALTER TABLE activity_field_definition
  ADD COLUMN IF NOT EXISTS boolean_true_label TEXT,
  ADD COLUMN IF NOT EXISTS boolean_false_label TEXT;
