UPDATE activity_definition
SET icon = CASE kind
  WHEN 'feeding' THEN 'utensils'
  WHEN 'diaper' THEN 'droplets'
END
WHERE kind IN ('feeding', 'diaper')
  AND icon = 'heart-pulse';
