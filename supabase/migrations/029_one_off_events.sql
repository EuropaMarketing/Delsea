-- ──────────────────────────────────────────────
-- One-off dated events (e.g. a sound bath on a specific date), as opposed
-- to the existing recurring weekly group sessions. Reuses service_sessions
-- rather than introducing a parallel concept — a row now represents EITHER
-- a recurring weekly slot (day_of_week set) OR a one-off dated event
-- (event_date set), never both.
-- ──────────────────────────────────────────────

ALTER TABLE service_sessions
  ALTER COLUMN day_of_week DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS event_date DATE,
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_capacity_override INTEGER;

ALTER TABLE service_sessions DROP CONSTRAINT IF EXISTS chk_session_date_xor_dow;
ALTER TABLE service_sessions ADD CONSTRAINT chk_session_date_xor_dow CHECK (
  (day_of_week IS NOT NULL AND event_date IS NULL) OR
  (day_of_week IS NULL AND event_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_service_sessions_event_date ON service_sessions(event_date) WHERE event_date IS NOT NULL;

-- ──────────────────────────────────────────────
-- Updated create_booking: accepts an optional p_session_id linking this
-- booking to a one-off event row, used purely to look up a trusted
-- per-event capacity override server-side (never trust a client-supplied
-- capacity number). The instructor still flows through the existing
-- p_staff_id parameter — group sessions are always self-service, so the
-- auto-assign branch never overrides a client-supplied staff_id.
-- ──────────────────────────────────────────────
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
  p_spots_booked INTEGER     DEFAULT 1,
  p_session_id   UUID        DEFAULT NULL
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
  v_event_capacity INTEGER;
BEGIN
  SELECT is_self_service, is_group_session, max_capacity, resource_id
  INTO v_self_service, v_is_group, v_max_capacity, v_resource_id
  FROM services WHERE id = p_service_id;

  IF v_is_group THEN
    IF p_session_id IS NOT NULL THEN
      SELECT max_capacity_override INTO v_event_capacity
      FROM service_sessions
      WHERE id = p_session_id AND service_id = p_service_id;

      IF v_event_capacity IS NOT NULL THEN
        v_max_capacity := v_event_capacity;
      END IF;
    END IF;

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
