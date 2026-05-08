-- ============================================================
-- Discount codes on membership purchases
-- Run this in Supabase SQL Editor.
-- ============================================================

ALTER TABLE customer_memberships
  ADD COLUMN IF NOT EXISTS discount_code_id UUID REFERENCES discount_codes(id),
  ADD COLUMN IF NOT EXISTS discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0;

-- apply_discount_to_membership — records a discount against a membership
-- purchase and increments the code's used_count.
CREATE OR REPLACE FUNCTION apply_discount_to_membership(
  p_membership_id UUID,
  p_code          TEXT,
  p_business_id   UUID
)
RETURNS JSONB AS $$
DECLARE
  v_code         discount_codes%ROWTYPE;
  v_order_value  NUMERIC;
  v_discount_amt NUMERIC;
BEGIN
  -- Get plan price as the order value
  SELECT mp.price INTO v_order_value
  FROM customer_memberships cm
  JOIN membership_plans mp ON mp.id = cm.plan_id
  WHERE cm.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

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
    RAISE EXCEPTION 'Minimum order of % required for this code', v_code.min_order_value;
  END IF;

  IF v_code.type = 'percentage' THEN
    v_discount_amt := ROUND(v_order_value * v_code.value / 100, 2);
  ELSE
    v_discount_amt := LEAST(v_code.value, v_order_value);
  END IF;

  UPDATE customer_memberships
  SET discount_code_id = v_code.id,
      discount_amount  = v_discount_amt
  WHERE id = p_membership_id;

  UPDATE discount_codes SET used_count = used_count + 1 WHERE id = v_code.id;

  RETURN jsonb_build_object(
    'discount_amount', v_discount_amt,
    'code',            v_code.code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
