-- Service-level commission override.
-- When set, this takes priority over the staff member's default.
-- NULL = fall back to the performing staff member's own commission settings.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS commission_type TEXT,
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(8,2);
