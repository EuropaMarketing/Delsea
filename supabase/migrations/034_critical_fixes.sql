-- ──────────────────────────────────────────────────────────────────────────
-- 1. Simpler, more robust RLS policies for bookings and customers.
--    The existing policies work correctly but the bookings_select_own policy
--    reads through customers (which also has RLS), creating a chain that can
--    silently return nothing if auth.uid() resolves to NULL (expired JWT).
--    Rewriting to put auth_is_admin() as the first check so admins short-circuit
--    without needing any subquery evaluation.
-- ──────────────────────────────────────────────────────────────────────────

-- Bookings: drop all SELECT/ALL policies and replace with one clear policy.
DROP POLICY IF EXISTS "bookings_admin_all"   ON bookings;
DROP POLICY IF EXISTS "bookings_select_own"  ON bookings;

CREATE POLICY "bookings_select_own" ON bookings
  FOR SELECT USING (
    auth_is_admin()
    OR customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    OR staff_id    IN (SELECT id FROM staff    WHERE user_id = auth.uid())
  );

-- Also ensure UPDATE/DELETE for admin work properly.
DROP POLICY IF EXISTS "bookings_update_own" ON bookings;
CREATE POLICY "bookings_update_own" ON bookings
  FOR UPDATE USING (
    auth_is_admin()
    OR customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    OR staff_id    IN (SELECT id FROM staff    WHERE user_id = auth.uid())
  );

-- Customers: similarly consolidate.
DROP POLICY IF EXISTS "customers_admin_all"  ON customers;
DROP POLICY IF EXISTS "customers_select_own" ON customers;

CREATE POLICY "customers_select_own" ON customers
  FOR SELECT USING (
    auth_is_admin()
    OR user_id = auth.uid()
    OR (user_id IS NULL AND email = (
          SELECT u.email FROM auth.users u WHERE u.id = auth.uid()
        ))
  );

DROP POLICY IF EXISTS "customers_update_own" ON customers;
CREATE POLICY "customers_update_own" ON customers
  FOR UPDATE USING (
    auth_is_admin()
    OR user_id = auth.uid()
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Prevent staff double-booking in create_booking.
--    Previously only resource conflicts were checked. A staff member could
--    be booked for two overlapping appointments simultaneously.
-- ──────────────────────────────────────────────────────────────────────────
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
  v_customer_id       UUID;
  v_staff_id          UUID := p_staff_id;
  v_booking_id        UUID;
  v_self_service      BOOLEAN;
  v_is_group          BOOLEAN;
  v_max_capacity      INTEGER;
  v_spots_taken       INTEGER;
  v_resource_id       UUID;
  v_event_capacity    INTEGER;
  v_event_resource    UUID;
  v_has_priority      BOOLEAN := FALSE;
  r                   RECORD;
BEGIN
  SELECT is_self_service, is_group_session, max_capacity, resource_id
  INTO v_self_service, v_is_group, v_max_capacity, v_resource_id
  FROM services WHERE id = p_service_id;

  -- Group session: capacity check + per-event overrides
  IF v_is_group THEN
    IF p_session_id IS NOT NULL THEN
      SELECT max_capacity_override, resource_id INTO v_event_capacity, v_event_resource
      FROM service_sessions
      WHERE id = p_session_id AND service_id = p_service_id;
      IF v_event_capacity IS NOT NULL THEN v_max_capacity := v_event_capacity; END IF;
      IF v_event_resource IS NOT NULL THEN v_resource_id  := v_event_resource; END IF;
    END IF;
    SELECT COALESCE(SUM(spots_booked), 0) INTO v_spots_taken
    FROM bookings
    WHERE service_id = p_service_id AND starts_at = p_starts_at AND status != 'cancelled';
    IF v_spots_taken + p_spots_booked > COALESCE(v_max_capacity, 8) THEN
      RAISE EXCEPTION 'Not enough spots available. Only % spot(s) remaining.',
        COALESCE(v_max_capacity, 8) - v_spots_taken;
    END IF;
  END IF;

  -- Staff conflict: prevent double-booking the same staff member.
  IF v_staff_id IS NOT NULL AND (v_is_group IS DISTINCT FROM TRUE) THEN
    IF EXISTS (
      SELECT 1 FROM bookings
      WHERE staff_id  = v_staff_id
        AND status   != 'cancelled'
        AND starts_at < p_ends_at
        AND ends_at   > p_starts_at
    ) THEN
      RAISE EXCEPTION 'This staff member is already booked at this time. Please choose a different slot.';
    END IF;
  END IF;

  -- Room assignment: priority list first, then single-resource fallback.
  SELECT EXISTS(SELECT 1 FROM service_resources WHERE service_id = p_service_id)
  INTO v_has_priority;

  IF v_has_priority THEN
    v_resource_id := NULL;
    FOR r IN
      SELECT resource_id FROM service_resources
      WHERE service_id = p_service_id ORDER BY priority
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM bookings
        WHERE resource_id = r.resource_id
          AND status     != 'cancelled'
          AND starts_at   < p_ends_at
          AND ends_at     > p_starts_at
      ) THEN
        v_resource_id := r.resource_id;
        EXIT;
      END IF;
    END LOOP;
    IF v_resource_id IS NULL THEN
      RAISE EXCEPTION 'No treatment rooms are available at this time. Please choose a different slot.';
    END IF;
  ELSIF v_resource_id IS NOT NULL THEN
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
    WHERE business_id = p_business_id AND on_holiday IS NOT TRUE
    ORDER BY created_at LIMIT 1;
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
