-- Default commission config per staff member
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS commission_type TEXT    NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(8,2) NOT NULL DEFAULT 50.00;

-- Per-service commission overrides (only used when staff is explicitly assigned to a service)
-- NULL = use the staff member's default
ALTER TABLE staff_services
  ADD COLUMN IF NOT EXISTS commission_type TEXT,
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(8,2);
