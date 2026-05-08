-- Gift vouchers table
CREATE TABLE IF NOT EXISTS gift_vouchers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code            TEXT        NOT NULL,
  initial_value   INTEGER     NOT NULL CHECK (initial_value > 0),
  remaining_value INTEGER     NOT NULL CHECK (remaining_value >= 0),
  issued_to       TEXT,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, code)
);

ALTER TABLE gift_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gift_vouchers_select" ON gift_vouchers
  FOR SELECT USING (is_active = TRUE OR is_business_admin(business_id));

CREATE POLICY "gift_vouchers_admin" ON gift_vouchers
  FOR ALL USING (is_business_admin(business_id));

-- Add gift voucher columns to bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS gift_voucher_id     UUID    REFERENCES gift_vouchers(id),
  ADD COLUMN IF NOT EXISTS gift_voucher_amount INTEGER NOT NULL DEFAULT 0;

-- Validate a gift voucher (read-only check, returns remaining balance)
CREATE OR REPLACE FUNCTION validate_gift_voucher(
  p_code        TEXT,
  p_business_id UUID
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v record;
BEGIN
  SELECT * INTO v
  FROM gift_vouchers
  WHERE upper(code) = upper(p_code)
    AND business_id = p_business_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift voucher not found';
  END IF;

  IF v.remaining_value <= 0 THEN
    RAISE EXCEPTION 'This voucher has no remaining balance';
  END IF;

  IF v.expires_at IS NOT NULL AND v.expires_at < now() THEN
    RAISE EXCEPTION 'This voucher has expired';
  END IF;

  RETURN json_build_object(
    'id',              v.id,
    'remaining_value', v.remaining_value,
    'issued_to',       v.issued_to
  );
END;
$$;

-- Apply a gift voucher to an existing booking
CREATE OR REPLACE FUNCTION apply_gift_voucher_to_booking(
  p_booking_id  UUID,
  p_code        TEXT,
  p_business_id UUID
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_voucher     gift_vouchers%ROWTYPE;
  v_booking     bookings%ROWTYPE;
  v_svc_price   INTEGER;
  v_apply       INTEGER;
BEGIN
  SELECT * INTO v_voucher
  FROM gift_vouchers
  WHERE upper(code) = upper(p_code)
    AND business_id = p_business_id
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Gift voucher not found'; END IF;
  IF v_voucher.remaining_value <= 0 THEN RAISE EXCEPTION 'This voucher has no remaining balance'; END IF;
  IF v_voucher.expires_at IS NOT NULL AND v_voucher.expires_at < now() THEN RAISE EXCEPTION 'This voucher has expired'; END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  SELECT price INTO v_svc_price FROM services WHERE id = v_booking.service_id;

  v_apply := LEAST(
    v_voucher.remaining_value,
    GREATEST(0, v_svc_price - COALESCE(v_booking.discount_amount, 0))
  );

  IF v_apply <= 0 THEN RAISE EXCEPTION 'Voucher cannot reduce the price further'; END IF;

  UPDATE bookings
    SET gift_voucher_id = v_voucher.id, gift_voucher_amount = v_apply
  WHERE id = p_booking_id;

  UPDATE gift_vouchers
    SET remaining_value = remaining_value - v_apply
  WHERE id = v_voucher.id;

  RETURN json_build_object(
    'voucher_amount',   v_apply,
    'remaining_value',  v_voucher.remaining_value - v_apply
  );
END;
$$;

-- Fetch all gift vouchers redeemed by the authenticated user
CREATE OR REPLACE FUNCTION get_my_gift_vouchers(p_business_id UUID)
RETURNS SETOF gift_vouchers
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT gv.*
  FROM gift_vouchers gv
  JOIN bookings b ON b.gift_voucher_id = gv.id
  JOIN customers c ON c.id = b.customer_id
  WHERE c.user_id = auth.uid()
    AND gv.business_id = p_business_id
  ORDER BY gv.created_at DESC;
END;
$$;

-- Remove a gift voucher from a booking and restore the balance
CREATE OR REPLACE FUNCTION remove_gift_voucher_from_booking(
  p_booking_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_booking bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND OR v_booking.gift_voucher_id IS NULL THEN RETURN; END IF;

  UPDATE gift_vouchers
    SET remaining_value = remaining_value + v_booking.gift_voucher_amount
  WHERE id = v_booking.gift_voucher_id;

  UPDATE bookings
    SET gift_voucher_id = NULL, gift_voucher_amount = 0
  WHERE id = p_booking_id;
END;
$$;
