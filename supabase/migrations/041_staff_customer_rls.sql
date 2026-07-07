-- Allow staff to read customer records for bookings assigned to them.
-- Previously the customers SELECT policy only permitted admins and the
-- customer themselves, so staff portal booking joins returned null names.
DROP POLICY IF EXISTS "customers_select_own" ON customers;

CREATE POLICY "customers_select_own" ON customers
  FOR SELECT USING (
    auth_is_admin()
    OR user_id = auth.uid()
    -- Staff can read customers booked with them
    OR EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.customer_id = id
        AND b.staff_id IN (
          SELECT s.id FROM staff s WHERE s.user_id = auth.uid()
        )
    )
  );
