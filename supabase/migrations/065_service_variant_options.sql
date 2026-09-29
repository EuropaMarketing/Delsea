-- ──────────────────────────────────────────────
-- Two-level service variants (e.g. Recovery Lounge: Duration is the main
-- variant, Number of People is a sub-variant under each duration, each
-- combination priced independently).
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_variant_options (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id   UUID NOT NULL REFERENCES service_variants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,        -- e.g. "1 person", "2 people"
  price        INTEGER NOT NULL,     -- pence — this combination's own price
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_variant_options_variant ON service_variant_options(variant_id);

ALTER TABLE service_variant_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "variant_options_select_all" ON service_variant_options
  FOR SELECT USING (is_active = TRUE OR is_business_admin(
    (SELECT s.business_id FROM services s JOIN service_variants v ON v.service_id = s.id WHERE v.id = variant_id)
  ));

CREATE POLICY "variant_options_all_admin" ON service_variant_options
  FOR ALL USING (
    is_business_admin((SELECT s.business_id FROM services s JOIN service_variants v ON v.service_id = s.id WHERE v.id = variant_id))
  );

-- Track which specific duration+people-count combination was booked
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS variant_option_id UUID REFERENCES service_variant_options(id) ON DELETE SET NULL;
