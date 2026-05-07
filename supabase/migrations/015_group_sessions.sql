-- ============================================================
-- Group session support
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Add group session fields to services
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_group_session BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS max_capacity INTEGER;

-- Recurring session schedule for group session services
CREATE TABLE IF NOT EXISTS service_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id   UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_sessions_service ON service_sessions(service_id);
ALTER TABLE service_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_select_active" ON service_sessions
  FOR SELECT USING (is_active = TRUE OR is_business_admin(business_id));
CREATE POLICY "sessions_all_admin" ON service_sessions
  FOR ALL USING (is_business_admin(business_id));

-- Updated create_booking: enforce capacity for group sessions
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
  p_variant_id   UUID        DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_customer_id    UUID;
  v_staff_id       UUID := p_staff_id;
  v_booking_id     UUID;
  v_self_service   BOOLEAN;
  v_is_group       BOOLEAN;
  v_max_capacity   INTEGER;
  v_booked_count   INTEGER;
BEGIN
  -- Load service properties
  SELECT is_self_service, is_group_session, max_capacity
  INTO v_self_service, v_is_group, v_max_capacity
  FROM services WHERE id = p_service_id;

  -- Enforce capacity for group sessions
  IF v_is_group THEN
    SELECT COUNT(*) INTO v_booked_count
    FROM bookings
    WHERE service_id = p_service_id
      AND starts_at  = p_starts_at
      AND status    != 'cancelled';

    IF v_booked_count >= COALESCE(v_max_capacity, 8) THEN
      RAISE EXCEPTION 'This session is fully booked';
    END IF;
  END IF;

  -- Find or create customer
  INSERT INTO customers (business_id, user_id, name, email, phone)
  VALUES (p_business_id, p_user_id, p_name, p_email, p_phone)
  ON CONFLICT (business_id, email) DO UPDATE
    SET
      name    = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
      phone   = COALESCE(EXCLUDED.phone, customers.phone),
      user_id = COALESCE(customers.user_id, EXCLUDED.user_id)
  RETURNING id INTO v_customer_id;

  -- Auto-assign staff only for standard (non-self-service, non-group) bookings
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
    starts_at, ends_at, notes, status
  )
  VALUES (
    p_business_id, v_customer_id, v_staff_id, p_service_id, p_variant_id,
    p_starts_at, p_ends_at, p_notes, 'confirmed'
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
