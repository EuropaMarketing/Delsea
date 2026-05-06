-- ============================================================
-- RLS POLICIES FOR MEMBERSHIP TABLES
-- Run this in Supabase SQL Editor.
-- ============================================================

ALTER TABLE membership_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_memberships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_transactions  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MEMBERSHIP PLANS
-- ============================================================
-- Anyone can read active plans (customers browsing)
CREATE POLICY "membership_plans_select_active" ON membership_plans
  FOR SELECT USING (is_active = TRUE OR is_business_admin(business_id));

-- Only admins can create / edit / delete plans
CREATE POLICY "membership_plans_all_admin" ON membership_plans
  FOR ALL USING (is_business_admin(business_id));

-- ============================================================
-- CUSTOMER MEMBERSHIPS
-- ============================================================
-- Customers see their own; admins see all for their business
CREATE POLICY "customer_memberships_select" ON customer_memberships
  FOR SELECT USING (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
    OR is_business_admin(
      (SELECT business_id FROM membership_plans WHERE id = plan_id)
    )
  );

-- Only admins assign memberships
CREATE POLICY "customer_memberships_all_admin" ON customer_memberships
  FOR ALL USING (
    is_business_admin(
      (SELECT business_id FROM membership_plans WHERE id = plan_id)
    )
  );

-- ============================================================
-- MEMBERSHIP TRANSACTIONS
-- ============================================================
-- Customers see their own transaction history; admins see all
CREATE POLICY "membership_transactions_select" ON membership_transactions
  FOR SELECT USING (
    membership_id IN (
      SELECT cm.id FROM customer_memberships cm
      JOIN customers c ON c.id = cm.customer_id
      WHERE c.user_id = auth.uid()
    )
    OR is_business_admin(
      (SELECT mp.business_id FROM customer_memberships cm
       JOIN membership_plans mp ON mp.id = cm.plan_id
       WHERE cm.id = membership_id)
    )
  );

-- Only admins (and SECURITY DEFINER RPCs) write transactions
CREATE POLICY "membership_transactions_all_admin" ON membership_transactions
  FOR ALL USING (
    is_business_admin(
      (SELECT mp.business_id FROM customer_memberships cm
       JOIN membership_plans mp ON mp.id = cm.plan_id
       WHERE cm.id = membership_id)
    )
  );
