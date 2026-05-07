-- ============================================================
-- Resources (rooms, equipment, etc.)
-- Run this in Supabase SQL Editor.
-- ============================================================

CREATE TABLE resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Services can require a specific resource
ALTER TABLE services ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;

-- Bookings record which resource was used
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resources_select" ON resources
  FOR SELECT USING (is_active = TRUE OR is_business_admin(business_id));

CREATE POLICY "resources_admin" ON resources
  FOR ALL USING (is_business_admin(business_id));

-- ============================================================
-- Updated create_booking: auto-assigns service resource and
-- checks it is not double-booked at the requested time.
-- ============================================================
CREATE OR REPLACE FUNCTION create_booking(
  p_business_id  UUID,
  p_user_id      UUID,
  p_name         TEXT,
  p_email        TEXT,
  p_service_id   UUID,
  p_starts_at    TIMESTAMPTZ,
  p_ends_at      TIMESTAMPTZ,
  p_phone        TEXT        DEFAULT NULL,
  p_staff_id     UUID        DEFAULT NULL,
  p_notes        TEXT        DEFAULT NULL,
  p_variant_id   UUID        DEFAULT NULL,
  p_spots_booked INTEGER     DEFAULT 1
)
RETURNS UUID AS $$
DECLARE
  v_customer_id    UUID;
  v_staff_id       UUID := p_staff_id;
  v_booking_id     UUID;
  v_self_service   BOOLEAN;
  v_is_group       BOOLEAN;
  v_max_capacity   INTEGER;
  v_spots_taken    INTEGER;
  v_resource_id    UUID;
BEGIN
  SELECT is_self_service, is_group_session, max_capacity, resource_id
  INTO v_self_service, v_is_group, v_max_capacity, v_resource_id
  FROM services WHERE id = p_service_id;

  -- Group session capacity check
  IF v_is_group THEN
    SELECT COALESCE(SUM(spots_booked), 0) INTO v_spots_taken
    FROM bookings
    WHERE service_id = p_service_id
      AND starts_at  = p_starts_at
      AND status    != 'cancelled';

    IF v_spots_taken + p_spots_booked > COALESCE(v_max_capacity, 8) THEN
      RAISE EXCEPTION 'Not enough spots available. Only % spot(s) remaining.',
        COALESCE(v_max_capacity, 8) - v_spots_taken;
    END IF;
  END IF;

  -- Resource availability check
  IF v_resource_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM bookings
      WHERE resource_id = v_resource_id
        AND status     != 'cancelled'
        AND starts_at   < p_ends_at
        AND ends_at     > p_starts_at
    ) THEN
      RAISE EXCEPTION 'The required resource is not available at this time. Please choose a different slot.';
    END IF;
  END IF;

  INSERT INTO customers (business_id, user_id, name, email, phone)
  VALUES (p_business_id, p_user_id, p_name, p_email, p_phone)
  ON CONFLICT (business_id, email) DO UPDATE
    SET
      name    = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
      phone   = COALESCE(EXCLUDED.phone, customers.phone),
      user_id = COALESCE(customers.user_id, EXCLUDED.user_id)
  RETURNING id INTO v_customer_id;

  IF v_staff_id IS NULL AND (v_self_service IS DISTINCT FROM TRUE) AND (v_is_group IS DISTINCT FROM TRUE) THEN
    SELECT id INTO v_staff_id
    FROM staff
    WHERE business_id = p_business_id
      AND on_holiday IS NOT TRUE
    ORDER BY created_at
    LIMIT 1;
  END IF;

  INSERT INTO bookings (
    business_id, customer_id, staff_id, service_id, variant_id,
    starts_at, ends_at, notes, status, spots_booked, resource_id
  )
  VALUES (
    p_business_id, v_customer_id, v_staff_id, p_service_id, p_variant_id,
    p_starts_at, p_ends_at, p_notes, 'confirmed', p_spots_booked, v_resource_id
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
