-- ──────────────────────────────────────────────
-- 1. Staff ↔ Service assignments
--    If no rows exist for a service, ALL staff can perform it (open by default).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_services (
  staff_id   UUID NOT NULL REFERENCES staff(id)    ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

ALTER TABLE staff_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_services_read" ON staff_services
  FOR SELECT USING (true);

CREATE POLICY "staff_services_admin" ON staff_services
  FOR ALL USING (is_business_admin(
    (SELECT business_id FROM services WHERE id = service_id LIMIT 1)
  ));

-- ──────────────────────────────────────────────
-- 2. Service add-ons
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_addons (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id        UUID        NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  duration_minutes  INTEGER     NOT NULL CHECK (duration_minutes > 0),
  price             INTEGER     NOT NULL CHECK (price >= 0),
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE service_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_addons_read" ON service_addons
  FOR SELECT USING (is_active = true OR is_business_admin(
    (SELECT business_id FROM services WHERE id = service_id LIMIT 1)
  ));

CREATE POLICY "service_addons_admin" ON service_addons
  FOR ALL USING (is_business_admin(
    (SELECT business_id FROM services WHERE id = service_id LIMIT 1)
  ));

-- ──────────────────────────────────────────────
-- 3. Staff ↔ Add-on qualifications
--    If no rows exist for an add-on, ALL staff who can do the parent service can do it.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_addons (
  staff_id UUID NOT NULL REFERENCES staff(id)           ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES service_addons(id)  ON DELETE CASCADE,
  PRIMARY KEY (staff_id, addon_id)
);

ALTER TABLE staff_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_addons_read" ON staff_addons
  FOR SELECT USING (true);

CREATE POLICY "staff_addons_admin" ON staff_addons
  FOR ALL USING (is_business_admin(
    (SELECT s.business_id FROM service_addons sa
     JOIN services s ON s.id = sa.service_id
     WHERE sa.id = addon_id LIMIT 1)
  ));

-- ──────────────────────────────────────────────
-- 4. Track selected add-ons on bookings
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_addons (
  booking_id UUID NOT NULL REFERENCES bookings(id)      ON DELETE CASCADE,
  addon_id   UUID NOT NULL REFERENCES service_addons(id) ON DELETE CASCADE,
  price      INTEGER NOT NULL,
  PRIMARY KEY (booking_id, addon_id)
);

ALTER TABLE booking_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_addons_read" ON booking_addons
  FOR SELECT USING (true);

CREATE POLICY "booking_addons_admin" ON booking_addons
  FOR ALL USING (is_business_admin(
    (SELECT business_id FROM bookings WHERE id = booking_id LIMIT 1)
  ));

-- ──────────────────────────────────────────────
-- 5. Helper: get add-ons available for a service + staff combination
--    Returns add-ons where either no staff restrictions exist OR the given staff is qualified.
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_available_addons(
  p_service_id UUID,
  p_staff_id   UUID DEFAULT NULL
) RETURNS TABLE (
  id               UUID,
  service_id       UUID,
  name             TEXT,
  duration_minutes INTEGER,
  price            INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id,
    sa.service_id,
    sa.name,
    sa.duration_minutes,
    sa.price
  FROM service_addons sa
  WHERE sa.service_id = p_service_id
    AND sa.is_active = true
    AND (
      -- No staff restrictions on this add-on → available to all
      NOT EXISTS (SELECT 1 FROM staff_addons WHERE addon_id = sa.id)
      OR
      -- Staff is explicitly qualified
      (p_staff_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM staff_addons WHERE addon_id = sa.id AND staff_id = p_staff_id
      ))
    )
  ORDER BY sa.name;
END;
$$;
