-- Lets an admin pause a membership for a defined period (e.g. while a client is
-- unwell), or suspend it indefinitely, from the client's record. A paused/suspended
-- membership can't have tokens redeemed against it while the hold is in effect —
-- "in effect" is computed on read (pause_end passing lapses it automatically, no
-- background job needed) rather than requiring something to flip the status back.
ALTER TABLE customer_memberships
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'suspended')),
  ADD COLUMN IF NOT EXISTS pause_start  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pause_end    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- ============================================================
-- Pause for a defined charge period (start required, end required —
-- this is the "skip being charged for this window" case).
-- ============================================================
CREATE OR REPLACE FUNCTION pause_membership(
  p_membership_id UUID,
  p_pause_end     TIMESTAMPTZ,
  p_reason        TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_business_id UUID;
BEGIN
  SELECT mp.business_id INTO v_business_id
  FROM customer_memberships cm
  JOIN membership_plans mp ON mp.id = cm.plan_id
  WHERE cm.id = p_membership_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found.';
  END IF;
  IF NOT is_business_admin(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;
  IF p_pause_end <= NOW() THEN
    RAISE EXCEPTION 'The resume date must be in the future.';
  END IF;

  UPDATE customer_memberships
  SET status = 'paused', pause_start = NOW(), pause_end = p_pause_end, pause_reason = p_reason
  WHERE id = p_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Suspend indefinitely — no resume date, cleared manually via resume_membership.
-- ============================================================
CREATE OR REPLACE FUNCTION suspend_membership(
  p_membership_id UUID,
  p_reason        TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_business_id UUID;
BEGIN
  SELECT mp.business_id INTO v_business_id
  FROM customer_memberships cm
  JOIN membership_plans mp ON mp.id = cm.plan_id
  WHERE cm.id = p_membership_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found.';
  END IF;
  IF NOT is_business_admin(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  UPDATE customer_memberships
  SET status = 'suspended', pause_start = NOW(), pause_end = NULL, pause_reason = p_reason
  WHERE id = p_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Resume — clears a pause or suspension, whichever is active.
-- ============================================================
CREATE OR REPLACE FUNCTION resume_membership(p_membership_id UUID)
RETURNS VOID AS $$
DECLARE
  v_business_id UUID;
BEGIN
  SELECT mp.business_id INTO v_business_id
  FROM customer_memberships cm
  JOIN membership_plans mp ON mp.id = cm.plan_id
  WHERE cm.id = p_membership_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found.';
  END IF;
  IF NOT is_business_admin(v_business_id) THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  UPDATE customer_memberships
  SET status = 'active', pause_start = NULL, pause_end = NULL, pause_reason = NULL
  WHERE id = p_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- redeem_token: block redemption while a pause/suspension is currently in effect.
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_token(
  p_booking_id    UUID,
  p_membership_id UUID
)
RETURNS void AS $$
DECLARE
  v_status    TEXT;
  v_pause_end TIMESTAMPTZ;
BEGIN
  SELECT status, pause_end INTO v_status, v_pause_end
  FROM customer_memberships WHERE id = p_membership_id;

  IF v_status = 'suspended' THEN
    RAISE EXCEPTION 'This membership is suspended and cannot be used.';
  END IF;
  IF v_status = 'paused' AND (v_pause_end IS NULL OR v_pause_end > NOW()) THEN
    RAISE EXCEPTION 'This membership is paused until %.', to_char(v_pause_end, 'DD Mon YYYY');
  END IF;

  UPDATE customer_memberships
  SET tokens_remaining = tokens_remaining - 1
  WHERE id = p_membership_id
    AND tokens_remaining > 0;

  INSERT INTO membership_transactions (membership_id, booking_id, type, amount)
  VALUES (p_membership_id, p_booking_id, 'redeem', -1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- get_customer_token_balance: exclude memberships currently paused/suspended
-- from the customer-flow token picker (booking checkout, admin "Apply Token").
-- ============================================================
DROP FUNCTION IF EXISTS public.get_customer_token_balance(uuid, text, text);

CREATE OR REPLACE FUNCTION get_customer_token_balance(
  p_business_id    UUID,
  p_email          TEXT,
  p_category       TEXT DEFAULT NULL
)
RETURNS TABLE (
  membership_id    UUID,
  plan_name        TEXT,
  tokens_remaining INTEGER,
  service_category TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id            AS membership_id,
    mp.name          AS plan_name,
    cm.tokens_remaining,
    mp.service_category
  FROM customer_memberships cm
  JOIN membership_plans mp ON mp.id = cm.plan_id
  JOIN customers c         ON c.id  = cm.customer_id
  WHERE c.business_id           = p_business_id
    AND LOWER(c.email)          = LOWER(p_email)
    AND cm.tokens_remaining     > 0
    AND (cm.expires_at IS NULL OR cm.expires_at > NOW())
    AND cm.status != 'suspended'
    AND (cm.status != 'paused' OR (cm.pause_end IS NOT NULL AND cm.pause_end <= NOW()))
    -- NULL category on plan = works for everything
    -- otherwise must match the requested category
    AND (mp.service_category IS NULL OR p_category IS NULL OR mp.service_category = p_category)
  ORDER BY
    -- prefer exact category match over unrestricted plans
    CASE WHEN mp.service_category = p_category THEN 0 ELSE 1 END,
    cm.tokens_remaining DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
