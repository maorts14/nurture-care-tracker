INSERT INTO app_user (id, email, password_hash, display_name, email_verified_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alex@nurture.local', crypt('nurture-demo', gen_salt('bf')), 'Alex Morgan', now()),
  ('22222222-2222-2222-2222-222222222222', 'maya@nurture.local', crypt('nurture-demo', gen_salt('bf')), 'Maya Cohen', now()),
  ('77777777-7777-7777-7777-777777777777', 'sam@nurture.local', crypt('nurture-demo', gen_salt('bf')), 'Sam Taylor', now());
INSERT INTO child (id, name, timezone, birth_date) VALUES ('33333333-3333-3333-3333-333333333333', 'Leo', 'Asia/Jerusalem', '2026-05-05');
INSERT INTO child_membership (child_id, user_id, role) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'caregiver'),
  ('33333333-3333-3333-3333-333333333333', '77777777-7777-7777-7777-777777777777', 'care_manager');
INSERT INTO activity_definition (id, child_id, name, kind, color) VALUES
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Feeding', 'feeding', '#ba5c30'),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'Diaper change', 'diaper', '#526cdb'),
  ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 'Doctor', 'custom', '#1d9d83');
INSERT INTO activity_field_definition (activity_id, field_key, label, field_type, unit, options, dashboard_metrics) VALUES
  ('55555555-5555-5555-5555-555555555555', 'type', 'Diaper type', 'select', NULL, '["Wet", "Dirty", "Mixed", "Empty"]', '["count"]'),
  ('66666666-6666-6666-6666-666666666666', 'provider', 'Provider', 'text', NULL, '[]', '[]'),
  ('66666666-6666-6666-6666-666666666666', 'reason', 'Reason', 'text', NULL, '[]', '[]');
INSERT INTO activity_log (child_id, activity_id, event_time, event_timezone, field_values, note, created_by) VALUES
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', now() - interval '55 minutes', 'Asia/Jerusalem', '{}', 'Finished comfortably', '22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', now() - interval '2 hours', 'Asia/Jerusalem', '{"type":"Wet","clothesChanged":true}', NULL, '11111111-1111-1111-1111-111111111111'),
  ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', now() - interval '3 hours 40 minutes', 'Asia/Jerusalem', '{}', NULL, '22222222-2222-2222-2222-222222222222');
INSERT INTO feeding_portion (log_id, kind, delivery_method, amount_ml, position)
SELECT id, 'breast_milk', 'bottle', CASE WHEN note IS NULL THEN 95 ELSE 120 END, 0
FROM activity_log
WHERE activity_id = '44444444-4444-4444-4444-444444444444';
INSERT INTO activity_schedule (activity_id, kind, interval_minutes) VALUES ('44444444-4444-4444-4444-444444444444', 'interval', 180);
INSERT INTO activity_schedule (activity_id, kind, scheduled_for) VALUES ('66666666-6666-6666-6666-666666666666', 'one_time', now() + interval '4 hours');
