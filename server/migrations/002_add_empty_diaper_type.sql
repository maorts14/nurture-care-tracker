UPDATE activity_field_definition AS field
SET options = field.options || '["Empty"]'::jsonb
FROM activity_definition AS activity
WHERE field.activity_id = activity.id
  AND activity.kind = 'diaper'
  AND field.field_key = 'type'
  AND NOT field.options @> '["Empty"]'::jsonb;
