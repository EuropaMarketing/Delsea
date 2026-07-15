-- Add expiry_type to membership_plans.
-- Possible values:
--   '6_months'        — expires 6 months after purchase
--   '12_months'       — expires 12 months after purchase
--   '18_months'       — expires 18 months after purchase
--   'until_cancelled' — no date-based expiry; admin cancels manually
--   'none'            — tokens never expire

ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS expiry_type TEXT NOT NULL DEFAULT 'none'
    CHECK (expiry_type IN ('6_months', '12_months', '18_months', 'until_cancelled', 'none'));
