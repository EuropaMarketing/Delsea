-- ============================================================
-- Update create_booking to accept and store variant_id
-- Run this in Supabase SQL Editor.
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
  p_variant_id   UUID        DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_customer_id  UUID;
  v_staff_id     UUID := p_staff_id;
  v_booking_id   UUID;
  v_self_service BOOLEAN;
BEGIN
  -- Check if this is a self-service service
  SELECT is_self_service INTO v_self_service
  FROM services WHERE id = p_service_id;

  -- Find or create customer (upsert on business_id + email)
  INSERT INTO customers (business_id, user_id, name, email, phone)
  VALUES (p_business_id, p_user_id, p_name, p_email, p_phone)
  ON CONFLICT (business_id, email) DO UPDATE
    SET
      name    = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
      phone   = COALESCE(EXCLUDED.phone, customers.phone),
      user_id = COALESCE(customers.user_id, EXCLUDED.user_id)
  RETURNING id INTO v_customer_id;

  -- Auto-assign staff only for non-self-service bookings without an explicit staff choice
  IF v_staff_id IS NULL AND (v_self_service IS DISTINCT FROM TRUE) THEN
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
