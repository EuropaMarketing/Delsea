-- ──────────────────────────────────────────────────────────────────────────
-- The customers_select_own policy added in migration 034 included a subquery
-- that reads from auth.users (to match guests by email). The `authenticated`
-- role does not have SELECT on auth.users, causing "permission denied for
-- table users" whenever any query joins to customers — including every
-- bookings query that embeds customer fields.
--
-- Fix: remove all auth.users references from customers RLS policies.
-- The email-match policy is also dropped as it has the same problem and
-- is redundant — create_booking (SECURITY DEFINER) handles customer upsert,
-- and customer-facing reads go through bookings joins, not direct selects.
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "customers_select_own"        ON customers;
DROP POLICY IF EXISTS "customers_select_email_match" ON customers;
DROP POLICY IF EXISTS "customers_admin_all"          ON customers;

-- Simple, safe SELECT policy — no auth.users subquery.
CREATE POLICY "customers_select_own" ON customers
  FOR SELECT USING (
    auth_is_admin()
    OR user_id = auth.uid()
  );

-- Restore a blanket admin ALL policy so admins can insert/update/delete
-- customers from the admin panel (e.g. Clients page edits).
CREATE POLICY "customers_admin_all" ON customers
  FOR ALL USING (auth_is_admin());
