-- ============================================================
-- CORE BOOKING RPCs
-- Run this in Supabase SQL Editor to create / replace all RPCs.
-- ============================================================

-- -------------------------------------------------------
-- create_booking
-- Creates or upserts the customer then inserts the booking.
-- Returns the new booking UUID.
-- -------------------------------------------------------
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
  p_notes        TEXT        DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_customer_id UUID;
  v_staff_id    UUID := p_staff_id;
  v_booking_id  UUID;
BEGIN
  -- Find or create customer (upsert on business_id + email)
  INSERT INTO customers (business_id, user_id, name, email, phone)
  VALUES (p_business_id, p_user_id, p_name, p_email, p_phone)
  ON CONFLICT (business_id, email) DO UPDATE
    SET
      name    = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
      phone   = COALESCE(EXCLUDED.phone, customers.phone),
      -- only set user_id if it wasn't already set (don't overwrite existing link)
      user_id = COALESCE(customers.user_id, EXCLUDED.user_id)
  RETURNING id INTO v_customer_id;

  -- If no staff specified, pick the first active staff member for this business
  IF v_staff_id IS NULL THEN
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

-- -------------------------------------------------------
-- link_customer_to_user
-- Called after account creation to link guest bookings.
-- Case-insensitive email match; updates ALL matching rows.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION link_customer_to_user(
  p_user_id UUID,
  p_email   TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE customers
  SET user_id = p_user_id
  WHERE LOWER(email) = LOWER(p_email)
    AND (user_id IS NULL OR user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------
-- get_my_bookings
-- Returns all bookings for the currently authenticated user.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_bookings(p_business_id UUID)
RETURNS TABLE (
  id           UUID,
  customer_id  UUID,
  staff_id     UUID,
  service_id   UUID,
  starts_at    TIMESTAMPTZ,
  ends_at      TIMESTAMPTZ,
  status       TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ,
  service_name TEXT,
  service_price INTEGER,
  staff_name   TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.customer_id,
    b.staff_id,
    b.service_id,
    b.starts_at,
    b.ends_at,
    b.status::TEXT,
    b.notes,
    b.created_at,
    s.name         AS service_name,
    s.price        AS service_price,
    st.name        AS staff_name
  FROM bookings b
  JOIN   services s  ON s.id = b.service_id
  LEFT JOIN staff st ON st.id = b.staff_id
  JOIN   customers c ON c.id = b.customer_id
  WHERE c.user_id       = auth.uid()
    AND b.business_id   = p_business_id
  ORDER BY b.starts_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------
-- cancel_booking
-- Marks a booking as cancelled (customer or admin).
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_booking(p_booking_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE bookings
  SET status = 'cancelled'
  WHERE id = p_booking_id
    AND (
      -- customer owns the booking
      customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
      -- or caller is an admin for this business
      OR is_business_admin(business_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------
-- MEMBERSHIP TABLES (add if not already present)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS membership_plans (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  price        INTEGER NOT NULL DEFAULT 0,  -- pence/cents
  token_count  INTEGER NOT NULL DEFAULT 1,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_membership_plans_business ON membership_plans(business_id);

CREATE TABLE IF NOT EXISTS customer_memberships (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id          UUID NOT NULL REFERENCES membership_plans(id) ON DELETE RESTRICT,
  tokens_remaining INTEGER NOT NULL DEFAULT 0,
  purchased_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_customer ON customer_memberships(customer_id);

CREATE TABLE IF NOT EXISTS membership_transactions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  membership_id  UUID NOT NULL REFERENCES customer_memberships(id) ON DELETE CASCADE,
  booking_id     UUID REFERENCES bookings(id) ON DELETE SET NULL,
  type           TEXT NOT NULL,   -- 'purchase' | 'redeem' | 'refund' | 'manual_adjust'
  amount         INTEGER NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_membership_tx_membership ON membership_transactions(membership_id);

-- -------------------------------------------------------
-- get_customer_token_balance
-- Returns the active membership with most tokens for an email.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_customer_token_balance(
  p_business_id UUID,
  p_email       TEXT
)
RETURNS TABLE (
  membership_id    UUID,
  plan_name        TEXT,
  tokens_remaining INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id          AS membership_id,
    mp.name        AS plan_name,
    cm.tokens_remaining
  FROM customer_memberships cm
  JOIN membership_plans mp ON mp.id = cm.plan_id
  JOIN customers c         ON c.id  = cm.customer_id
  WHERE c.business_id         = p_business_id
    AND LOWER(c.email)        = LOWER(p_email)
    AND cm.tokens_remaining   > 0
    AND (cm.expires_at IS NULL OR cm.expires_at > NOW())
  ORDER BY cm.tokens_remaining DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------
-- redeem_token
-- Decrements tokens_remaining and records the transaction.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION redeem_token(
  p_booking_id    UUID,
  p_membership_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE customer_memberships
  SET tokens_remaining = tokens_remaining - 1
  WHERE id = p_membership_id
    AND tokens_remaining > 0;

  INSERT INTO membership_transactions (membership_id, booking_id, type, amount)
  VALUES (p_membership_id, p_booking_id, 'redeem', -1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------
-- refund_token_for_booking
-- Refunds a token when a booking is cancelled.
-- Safe to call even if no token was used (returns false).
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION refund_token_for_booking(p_booking_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_membership_id UUID;
BEGIN
  SELECT membership_id INTO v_membership_id
  FROM membership_transactions
  WHERE booking_id = p_booking_id
    AND type = 'redeem'
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE customer_memberships
  SET tokens_remaining = tokens_remaining + 1
  WHERE id = v_membership_id;

  INSERT INTO membership_transactions (membership_id, booking_id, type, amount, note)
  VALUES (v_membership_id, p_booking_id, 'refund', 1, 'Booking cancelled');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
