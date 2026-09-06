CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE child_role AS ENUM ('owner', 'caregiver', 'viewer');
CREATE TYPE activity_kind AS ENUM ('feeding', 'diaper', 'custom');
CREATE TYPE reminder_kind AS ENUM ('interval', 'one_time');

CREATE TABLE app_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'he')),
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE child (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  birth_date DATE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE child_membership (
  child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role child_role NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, user_id)
);

CREATE TABLE child_invitation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role child_role NOT NULL DEFAULT 'caregiver',
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by UUID NOT NULL REFERENCES app_user(id),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_definition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind activity_kind NOT NULL DEFAULT 'custom',
  color TEXT NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_field_definition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activity_definition(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'boolean', 'select', 'duration')),
  unit TEXT,
  options JSONB NOT NULL DEFAULT '[]',
  dashboard_metrics JSONB NOT NULL DEFAULT '[]',
  archived_at TIMESTAMPTZ,
  UNIQUE (activity_id, field_key)
);

CREATE TABLE care_gap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  reason TEXT,
  created_by UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activity_definition(id) ON DELETE RESTRICT,
  event_time TIMESTAMPTZ NOT NULL,
  event_timezone TEXT NOT NULL,
  field_values JSONB NOT NULL DEFAULT '{}',
  note TEXT,
  created_by UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_timeline_idx ON activity_log (child_id, event_time DESC);
CREATE INDEX activity_log_activity_time_idx ON activity_log (activity_id, event_time DESC);

CREATE TABLE activity_measurement (
  log_id UUID NOT NULL REFERENCES activity_log(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES activity_field_definition(id) ON DELETE CASCADE,
  value_numeric NUMERIC NOT NULL,
  PRIMARY KEY (log_id, field_id)
);

CREATE TABLE reminder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES activity_definition(id) ON DELETE SET NULL,
  kind reminder_kind NOT NULL,
  interval_minutes INTEGER CHECK (interval_minutes > 0),
  scheduled_for TIMESTAMPTZ,
  title TEXT NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE child_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'shared')),
  created_by UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE log_comment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id UUID NOT NULL REFERENCES activity_log(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
