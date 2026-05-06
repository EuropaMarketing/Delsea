-- ============================================================
-- SELF-SERVICE ROOMS / STAFF-OPTIONAL BOOKINGS
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Allow services to be marked as self-service (no staff required)
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_self_service BOOLEAN NOT NULL DEFAULT FALSE;

-- Allow bookings without a staff member (self-service rooms)
ALTER TABLE bookings ALTER COLUMN staff_id DROP NOT NULL;

-- -------------------------------------------------------
-- create_booking (updated)
-- Skips auto-assign for self-service services so staff_id
-- stays NULL. Drop the old version first to avoid overload.
-- -------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_booking(uuid, uuid, text, text, text, uuid, uuid, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.create_booking(uuid, uuid, text, text, uuid, timestamptz, timestamptz, text, uuid, text);

CREATE OR REPLACE FUNCTION create_booking(
  p_business_id UUID,
  p_user_id     UUID,
  p_name        TEXT,
  p_email       TEXT,
  p_service_id  UUID,
  p_starts_at   TIMESTAMPTZ,
  p_ends_at     TIMESTAMPTZ,
  p_phone       TEXT  DEFAULT NULL,
  p_staff_id    UUID  DEFAULT NULL,
  p_notes       TEXT  DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_customer_id    UUID;
  v_staff_id       UUID := p_staff_id;
  v_booking_id     UUID;
  v_self_service   BOOLEAN;
BEGIN
  -- Check whether this service requires a staff member
  SELECT COALESCE(is_self_service, FALSE) INTO v_self_service
  FROM services WHERE id = p_service_id;

  -- Upsert customer
  INSERT INTO customers (business_id, user_id, name, email, phone)
  VALUES (p_business_id, p_user_id, p_name, p_email, p_phone)
  ON CONFLICT (business_id, email) DO UPDATE
    SET
      name    = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
      phone   = COALESCE(EXCLUDED.phone, customers.phone),
      user_id = COALESCE(customers.user_id, EXCLUDED.user_id)
  RETURNING id INTO v_customer_id;

  -- Auto-assign staff only for non-self-service bookings where none was specified
  IF v_staff_id IS NULL AND NOT v_self_service THEN
    SELECT id INTO v_staff_id
    FROM staff
    WHERE business_id = p_business_id
      AND on_holiday IS NOT TRUE
    ORDER BY created_at
    LIMIT 1;
  END IF;

  INSERT INTO bookings (
    business_id, customer_id, staff_id, service_id,
    starts_at, ends_at, notes, status
  )
  VALUES (
    p_business_id, v_customer_id, v_staff_id, p_service_id,
    p_starts_at, p_ends_at, p_notes, 'confirmed'
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
