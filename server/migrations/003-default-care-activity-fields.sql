WITH defaults (kind, field_key, label, field_type, unit, options, dashboard_metrics) AS (
  VALUES
    ('feeding'::activity_kind, 'amount', 'Amount', 'number', 'ml', '[]'::jsonb, '["total", "average", "trend"]'::jsonb),
    ('feeding'::activity_kind, 'method', 'Feeding method', 'select', NULL, '["Bottle", "Breastfeeding", "Formula", "Solids"]'::jsonb, '["count"]'::jsonb),
    ('diaper'::activity_kind, 'type', 'Diaper type', 'select', NULL, '["Wet", "Dirty", "Mixed"]'::jsonb, '["count"]'::jsonb)
)
INSERT INTO activity_field_definition (
  activity_id,
  field_key,
  label,
  field_type,
  unit,
  options,
  dashboard_metrics
)
SELECT
  activity.id,
  defaults.field_key,
  defaults.label,
  defaults.field_type,
  defaults.unit,
  defaults.options,
  defaults.dashboard_metrics
FROM activity_definition AS activity
JOIN defaults ON defaults.kind = activity.kind
WHERE activity.archived_at IS NULL
ON CONFLICT (activity_id, field_key) DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  unit = EXCLUDED.unit,
  options = EXCLUDED.options,
  dashboard_metrics = EXCLUDED.dashboard_metrics,
  archived_at = NULL;
