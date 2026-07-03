-- ──────────────────────────────────────────────
-- Per-service room priority list. When a booking is made, create_booking
-- tries each room in ascending priority order and assigns the first one
-- that has no overlapping bookings. Falls back to services.resource_id
-- (single-room legacy) when no priority rows exist for that service.
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_resources (
  service_id  UUID    NOT NULL REFERENCES services(id)  ON DELETE CASCADE,
  resource_id UUID    NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  priority    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (service_id, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_service_resources_service ON service_resources(service_id, priority);

ALTER TABLE service_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_resources_admin" ON service_resources
  FOR ALL USING (
    is_business_admin((SELECT business_id FROM services WHERE id = service_id LIMIT 1))
  );

-- ──────────────────────────────────────────────
-- Updated create_booking: priority-aware room assignment.
-- When service_resources rows exist, loops in priority order and assigns
-- the first available room. Only errors when ALL listed rooms are taken.
-- Falls back to services.resource_id (existing behaviour) when no rows exist.
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

  -- Group session: capacity check + optional per-event overrides
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

  -- Room assignment: try priority list first, then fall back to single resource
  SELECT EXISTS(SELECT 1 FROM service_resources WHERE service_id = p_service_id)
  INTO v_has_priority;

  IF v_has_priority THEN
    v_resource_id := NULL;
    FOR r IN
      SELECT resource_id FROM service_resources
      WHERE service_id = p_service_id
      ORDER BY priority
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
    -- Legacy single-resource check
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
