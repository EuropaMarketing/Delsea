-- Block / delete clients.
-- Blocking is keyed by email/phone (not customer_id) so a blocked person can't
-- just book again under a fresh customer row with the same contact details.

CREATE TABLE IF NOT EXISTS blocked_contacts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email       TEXT,
  phone       TEXT,
  reason      TEXT,
  blocked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blocked_contacts_has_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_blocked_contacts_business ON blocked_contacts(business_id);
CREATE INDEX IF NOT EXISTS idx_blocked_contacts_email ON blocked_contacts(business_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blocked_contacts_phone ON blocked_contacts(business_id, phone) WHERE phone IS NOT NULL;

ALTER TABLE blocked_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked_contacts_admin_all" ON blocked_contacts;
CREATE POLICY "blocked_contacts_admin_all" ON blocked_contacts
  FOR ALL USING (is_business_admin(business_id));

-- ============================================================
-- Public helper: can a booking attempt with this contact info proceed?
-- Returns a plain boolean, never exposes the blocklist itself.
-- ============================================================
CREATE OR REPLACE FUNCTION is_contact_blocked(p_business_id UUID, p_email TEXT, p_phone TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocked_contacts
    WHERE business_id = p_business_id
      AND (
        (p_email IS NOT NULL AND lower(email) = lower(p_email))
        OR (p_phone IS NOT NULL AND p_phone <> '' AND phone = p_phone)
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- Admin action: block a client by their current contact details and
-- cancel their upcoming bookings in the same call.
-- ============================================================
CREATE OR REPLACE FUNCTION block_customer(p_customer_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
  v_business_id UUID;
  v_email       TEXT;
  v_phone       TEXT;
BEGIN
  SELECT business_id, email, phone INTO v_business_id, v_email, v_phone
  FROM customers WHERE id = p_customer_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Customer not found.';
  END IF;

  IF NOT is_business_admin(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  INSERT INTO blocked_contacts (business_id, email, phone, reason)
  VALUES (v_business_id, v_email, v_phone, p_reason);

  UPDATE bookings
  SET status = 'cancelled'
  WHERE customer_id = p_customer_id
    AND status IN ('confirmed', 'pending')
    AND starts_at > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Extend create_booking() to reject blocked contacts up front.
-- Body otherwise unchanged from migration 034.
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
  IF is_contact_blocked(p_business_id, p_email, p_phone) THEN
    RAISE EXCEPTION 'This booking cannot be completed. Please contact us directly.';
  END IF;

  SELECT is_self_service, is_group_session, max_capacity, resource_id
  INTO v_self_service, v_is_group, v_max_capacity, v_resource_id
  FROM services WHERE id = p_service_id;
  -- Group session: capacity check + per-event overrides
  IF v_is_group THEN
    IF p_session_id IS NOT NULL THEN
      SELECT max_capacity_override, resource_id INTO v_event_capacity, v_event_resource
      FROM service_sessions WHERE id = p_session_id AND service_id = p_service_id;
      IF v_event_capacity IS NOT NULL THEN v_max_capacity := v_event_capacity; END IF;
      IF v_event_resource IS NOT NULL THEN v_resource_id  := v_event_resource; END IF;
    END IF;
    SELECT COALESCE(SUM(spots_booked), 0) INTO v_spots_taken
    FROM bookings WHERE service_id = p_service_id AND starts_at = p_starts_at AND status != 'cancelled';
    IF v_spots_taken + p_spots_booked > COALESCE(v_max_capacity, 8) THEN
      RAISE EXCEPTION 'Not enough spots available. Only % spot(s) remaining.', COALESCE(v_max_capacity, 8) - v_spots_taken;
    END IF;
  END IF;
  -- Staff conflict: prevent double-booking the same staff member.
  IF v_staff_id IS NOT NULL AND (v_is_group IS DISTINCT FROM TRUE) THEN
    IF EXISTS (SELECT 1 FROM bookings WHERE staff_id = v_staff_id AND status != 'cancelled' AND starts_at < p_ends_at AND ends_at > p_starts_at) THEN
      RAISE EXCEPTION 'This staff member is already booked at this time. Please choose a different slot.';
    END IF;
  END IF;
  -- Room assignment: priority list first, then single-resource fallback.
  SELECT EXISTS(SELECT 1 FROM service_resources WHERE service_id = p_service_id) INTO v_has_priority;
  IF v_has_priority THEN
    v_resource_id := NULL;
    FOR r IN SELECT resource_id FROM service_resources WHERE service_id = p_service_id ORDER BY priority LOOP
      IF NOT EXISTS (SELECT 1 FROM bookings WHERE resource_id = r.resource_id AND status != 'cancelled' AND starts_at < p_ends_at AND ends_at > p_starts_at) THEN
        v_resource_id := r.resource_id; EXIT;
      END IF;
    END LOOP;
    IF v_resource_id IS NULL THEN
      RAISE EXCEPTION 'No treatment rooms are available at this time. Please choose a different slot.';
    END IF;
  ELSIF v_resource_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM bookings WHERE resource_id = v_resource_id AND status != 'cancelled' AND starts_at < p_ends_at AND ends_at > p_starts_at) THEN
      RAISE EXCEPTION 'The required resource is not available at this time. Please choose a different slot.';
    END IF;
  END IF;
  INSERT INTO customers (business_id, user_id, name, email, phone)
  VALUES (p_business_id, p_user_id, p_name, p_email, p_phone)
  ON CONFLICT (business_id, email) DO UPDATE SET
    name = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
    phone = COALESCE(EXCLUDED.phone, customers.phone),
    user_id = COALESCE(customers.user_id, EXCLUDED.user_id)
  RETURNING id INTO v_customer_id;
  IF v_staff_id IS NULL AND (v_self_service IS DISTINCT FROM TRUE) AND (v_is_group IS DISTINCT FROM TRUE) THEN
    SELECT id INTO v_staff_id FROM staff WHERE business_id = p_business_id AND on_holiday IS NOT TRUE ORDER BY created_at LIMIT 1;
  END IF;
  INSERT INTO bookings (business_id, customer_id, staff_id, service_id, variant_id, starts_at, ends_at, notes, status, spots_booked, resource_id)
  VALUES (p_business_id, v_customer_id, v_staff_id, p_service_id, p_variant_id, p_starts_at, p_ends_at, p_notes, 'confirmed', p_spots_booked, v_resource_id)
  RETURNING id INTO v_booking_id;
  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
