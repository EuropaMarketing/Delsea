-- ============================================================
-- SERVICE VARIANTS (multiple durations/prices per service)
-- Run this in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS service_variants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id       UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,          -- e.g. "45 min", "60 min"
  duration_minutes INTEGER NOT NULL,
  price            INTEGER NOT NULL,       -- pence
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_variants_service ON service_variants(service_id);

ALTER TABLE service_variants ENABLE ROW LEVEL SECURITY;

-- Public can read active variants
CREATE POLICY "variants_select_all" ON service_variants
  FOR SELECT USING (is_active = TRUE OR is_business_admin(
    (SELECT business_id FROM services WHERE id = service_id)
  ));

-- Admins manage variants
CREATE POLICY "variants_all_admin" ON service_variants
  FOR ALL USING (
    is_business_admin((SELECT business_id FROM services WHERE id = service_id))
  );

-- Track which variant was booked (optional, for reporting)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES service_variants(id) ON DELETE SET NULL;
