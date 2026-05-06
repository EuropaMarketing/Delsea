-- ============================================================
-- CUSTOMER SELF-SERVICE MEMBERSHIP PURCHASE
-- Run this in Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION purchase_membership(
  p_business_id UUID,
  p_plan_id     UUID,
  p_name        TEXT,
  p_email       TEXT,
  p_user_id     UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_customer_id    UUID;
  v_membership_id  UUID;
  v_token_count    INTEGER;
  v_plan_active    BOOLEAN;
BEGIN
  -- Verify plan belongs to this business and is active
  SELECT is_active, token_count
  INTO v_plan_active, v_token_count
  FROM membership_plans
  WHERE id = p_plan_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership plan not found';
  END IF;

  IF NOT v_plan_active THEN
    RAISE EXCEPTION 'This membership plan is no longer available';
  END IF;

  -- Upsert customer
  INSERT INTO customers (business_id, user_id, name, email)
  VALUES (p_business_id, p_user_id, p_name, lower(p_email))
  ON CONFLICT (business_id, email) DO UPDATE
    SET
      name    = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
      user_id = COALESCE(customers.user_id, EXCLUDED.user_id)
  RETURNING id INTO v_customer_id;

  -- Create the membership
  INSERT INTO customer_memberships (customer_id, plan_id, tokens_remaining)
  VALUES (v_customer_id, p_plan_id, v_token_count)
  RETURNING id INTO v_membership_id;

  -- Record the purchase transaction
  INSERT INTO membership_transactions (membership_id, type, amount, note)
  VALUES (v_membership_id, 'purchase', v_token_count, 'Membership purchased by customer');

  RETURN v_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
