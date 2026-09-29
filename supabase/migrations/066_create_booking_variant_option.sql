-- Extend create_booking() to record which variant sub-option (e.g. number of
-- people under a duration) was booked, AND to resolve the correct price for
-- a variant/option server-side into price_override — previously no variant's
-- price (single-level or the new two-level options) was ever recorded on the
-- booking anywhere, so every admin view (Calendar, Bookings, Clients — all of
-- which read price_override ?? service.price) silently showed the base
-- service price instead of the variant's actual price. Body otherwise
-- unchanged from migration 053.
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
  p_session_id   UUID        DEFAULT NULL,
  p_variant_option_id UUID   DEFAULT NULL
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
  v_variant_price     INTEGER;
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
  -- Resolve the actual price to charge/display for the chosen variant (and its
  -- sub-option, if any) — looked up server-side, never trusted from the client.
  IF p_variant_option_id IS NOT NULL THEN
    SELECT price INTO v_variant_price FROM service_variant_options WHERE id = p_variant_option_id AND variant_id = p_variant_id;
  ELSIF p_variant_id IS NOT NULL THEN
    SELECT price INTO v_variant_price FROM service_variants WHERE id = p_variant_id;
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
  INSERT INTO bookings (business_id, customer_id, staff_id, service_id, variant_id, variant_option_id, starts_at, ends_at, notes, status, spots_booked, resource_id, price_override)
  VALUES (p_business_id, v_customer_id, v_staff_id, p_service_id, p_variant_id, p_variant_option_id, p_starts_at, p_ends_at, p_notes, 'confirmed', p_spots_booked, v_resource_id, v_variant_price)
  RETURNING id INTO v_booking_id;
  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
