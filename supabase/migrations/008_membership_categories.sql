-- ============================================================
-- CATEGORY-SPECIFIC MEMBERSHIP PLANS
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Add optional category restriction to membership plans
-- NULL means the plan works for ANY service category
ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS service_category TEXT DEFAULT NULL;

-- Update get_customer_token_balance to filter by service category
-- Drop old version first (parameter list changed)
DROP FUNCTION IF EXISTS public.get_customer_token_balance(uuid, text);

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
