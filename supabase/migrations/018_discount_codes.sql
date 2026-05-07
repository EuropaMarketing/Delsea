-- ============================================================
-- Discount codes
-- Run this in Supabase SQL Editor.
-- ============================================================

CREATE TABLE discount_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  description   TEXT,
  type          TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value         NUMERIC(10,2) NOT NULL CHECK (value > 0),
  min_order_value NUMERIC(10,2),
  expires_at    TIMESTAMPTZ,
  max_uses      INTEGER,
  used_count    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, code)
);

-- Track which discount was applied to each booking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_code_id UUID REFERENCES discount_codes(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;

-- Active codes visible to anyone (needed for client-side validation)
CREATE POLICY "discount_codes_select" ON discount_codes
  FOR SELECT USING (is_active = TRUE OR is_business_admin(business_id));

CREATE POLICY "discount_codes_admin" ON discount_codes
  FOR ALL USING (is_business_admin(business_id));

-- ============================================================
-- validate_discount_code — read-only check, returns discount info
-- ============================================================
CREATE OR REPLACE FUNCTION validate_discount_code(
  p_code        TEXT,
  p_business_id UUID,
  p_order_value NUMERIC
)
RETURNS JSONB AS $$
DECLARE
  v_code discount_codes%ROWTYPE;
  v_amount NUMERIC;
BEGIN
  SELECT * INTO v_code
  FROM discount_codes
  WHERE UPPER(code) = UPPER(p_code)
    AND business_id  = p_business_id
    AND is_active    = TRUE
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_uses   IS NULL OR used_count < max_uses);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired discount code';
  END IF;

  IF v_code.min_order_value IS NOT NULL AND p_order_value < v_code.min_order_value THEN
    RAISE EXCEPTION 'Minimum order of £% required for this code', v_code.min_order_value;
  END IF;

  IF v_code.type = 'percentage' THEN
    v_amount := ROUND(p_order_value * v_code.value / 100, 2);
  ELSE
    v_amount := LEAST(v_code.value, p_order_value);
  END IF;

  RETURN jsonb_build_object(
    'id',              v_code.id,
    'code',            v_code.code,
    'type',            v_code.type,
    'value',           v_code.value,
    'discount_amount', v_amount,
    'description',     v_code.description
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- apply_discount_to_booking — applies to an existing booking,
-- computes the order value from the booking's service/variant.
-- ============================================================
CREATE OR REPLACE FUNCTION apply_discount_to_booking(
  p_booking_id  UUID,
  p_code        TEXT,
  p_business_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_code          discount_codes%ROWTYPE;
  v_order_value   NUMERIC;
  v_discount_amt  NUMERIC;
  v_spots         INTEGER;
  v_variant_id    UUID;
BEGIN
  SELECT spots_booked, variant_id INTO v_spots, v_variant_id
  FROM bookings WHERE id = p_booking_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  v_spots := COALESCE(v_spots, 1);

  IF v_variant_id IS NOT NULL THEN
    SELECT price INTO v_order_value FROM service_variants WHERE id = v_variant_id;
  ELSE
    SELECT s.price INTO v_order_value
    FROM bookings b JOIN services s ON s.id = b.service_id
    WHERE b.id = p_booking_id;
  END IF;

  v_order_value := COALESCE(v_order_value, 0) * v_spots;

  SELECT * INTO v_code
  FROM discount_codes
  WHERE UPPER(code) = UPPER(p_code)
    AND business_id  = p_business_id
    AND is_active    = TRUE
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_uses   IS NULL OR used_count < max_uses);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired discount code';
  END IF;

  IF v_code.min_order_value IS NOT NULL AND v_order_value < v_code.min_order_value THEN
    RAISE EXCEPTION 'Minimum order of £% required', v_code.min_order_value;
  END IF;

  IF v_code.type = 'percentage' THEN
    v_discount_amt := ROUND(v_order_value * v_code.value / 100, 2);
  ELSE
    v_discount_amt := LEAST(v_code.value, v_order_value);
  END IF;

  UPDATE bookings
  SET discount_code_id = v_code.id,
      discount_amount  = v_discount_amt
  WHERE id = p_booking_id;

  UPDATE discount_codes SET used_count = used_count + 1 WHERE id = v_code.id;

  RETURN jsonb_build_object(
    'discount_amount', v_discount_amt,
    'code',            v_code.code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
