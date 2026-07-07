-- The customers_select_own policy added in 041 caused infinite recursion:
-- customers → bookings (join) → customers (policy check) → bookings → ...
--
-- Fix: wrap the bookings lookup in a SECURITY DEFINER function so it runs
-- as the function owner (bypassing RLS), breaking the circular dependency.

DROP POLICY IF EXISTS "customers_select_own" ON customers;

CREATE OR REPLACE FUNCTION staff_can_see_customer(p_customer_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.customer_id = p_customer_id
      AND b.staff_id IN (
        SELECT s.id FROM staff s WHERE s.user_id = auth.uid()
      )
  );
$$;

CREATE POLICY "customers_select_own" ON customers
  FOR SELECT USING (
    auth_is_admin()
    OR user_id = auth.uid()
    OR staff_can_see_customer(id)
  );
