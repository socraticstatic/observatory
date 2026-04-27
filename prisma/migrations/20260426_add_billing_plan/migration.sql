ALTER TABLE registered_services
  ADD COLUMN IF NOT EXISTS billing_plan       TEXT             NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS monthly_budget_usd DOUBLE PRECISION NOT NULL DEFAULT 0;
