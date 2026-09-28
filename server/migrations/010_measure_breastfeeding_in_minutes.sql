ALTER TABLE feeding_portion
  ALTER COLUMN amount_ml DROP NOT NULL,
  ADD COLUMN duration_minutes NUMERIC;

-- Earlier versions stored every feeding in ml, including entries labelled
-- breastfeeding. Keep those historical quantities intact as bottle measures.
UPDATE feeding_portion
SET delivery_method = 'bottle'
WHERE delivery_method = 'breastfeeding'
  AND amount_ml IS NOT NULL;

ALTER TABLE feeding_portion
  DROP CONSTRAINT feeding_portion_amount_ml_check,
  ADD CONSTRAINT feeding_portion_measurement_check CHECK (
    (delivery_method = 'bottle' AND amount_ml > 0 AND duration_minutes IS NULL)
    OR (delivery_method = 'breastfeeding' AND kind = 'breast_milk' AND amount_ml IS NULL AND duration_minutes > 0)
  );
