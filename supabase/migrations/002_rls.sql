-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE businesses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff         ENABLE ROW LEVEL SECURITY;
ALTER TABLE services      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability  ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings      ENABLE ROW LEVEL SECURITY;

-- Extend staff table to support auth user association
ALTER TABLE staff ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_staff_user ON staff(user_id);

-- Helper: get the business_id for the current staff member
CREATE OR REPLACE FUNCTION get_staff_business_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT business_id FROM staff WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Helper: is current user an admin for a business?
CREATE OR REPLACE FUNCTION is_business_admin(bid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE user_id = auth.uid()
      AND business_id = bid
      AND role = 'admin'
  );
$$;

-- ============================================================
-- BUSINESSES
-- ============================================================
-- Public read (needed for white-label config on load)
CREATE POLICY "businesses_select_all" ON businesses
  FOR SELECT USING (TRUE);

-- Only admins can update their own business
CREATE POLICY "businesses_update_admin" ON businesses
  FOR UPDATE USING (is_business_admin(id));

-- ============================================================
-- STAFF
-- ============================================================
-- Public read (customers need to see staff)
CREATE POLICY "staff_select_all" ON staff
  FOR SELECT USING (TRUE);

-- Staff/admins manage their own business staff
CREATE POLICY "staff_all_admin" ON staff
  FOR ALL USING (is_business_admin(business_id));

-- ============================================================
-- SERVICES
-- ============================================================
CREATE POLICY "services_select_active" ON services
  FOR SELECT USING (is_active = TRUE OR is_business_admin(business_id));

CREATE POLICY "services_all_admin" ON services
  FOR ALL USING (is_business_admin(business_id));

-- ============================================================
-- CUSTOMERS
-- ============================================================
-- Customers can read/update their own record
CREATE POLICY "customers_select_own" ON customers
  FOR SELECT USING (user_id = auth.uid() OR is_business_admin(business_id));

CREATE POLICY "customers_insert_self" ON customers
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "customers_update_own" ON customers
  FOR UPDATE USING (user_id = auth.uid() OR is_business_admin(business_id));

-- ============================================================
-- AVAILABILITY
-- ============================================================
CREATE POLICY "availability_select_all" ON availability
  FOR SELECT USING (TRUE);

CREATE POLICY "availability_all_admin" ON availability
  FOR ALL USING (
    is_business_admin(
      (SELECT business_id FROM staff WHERE id = staff_id)
    )
  );

-- ============================================================
-- BLOCKED TIMES
-- ============================================================
CREATE POLICY "blocked_times_select_all" ON blocked_times
  FOR SELECT USING (TRUE);

CREATE POLICY "blocked_times_all_admin" ON blocked_times
  FOR ALL USING (
    is_business_admin(
      (SELECT business_id FROM staff WHERE id = staff_id)
    )
  );

-- ============================================================
-- BOOKINGS
-- ============================================================
-- Customers see their own bookings
CREATE POLICY "bookings_select_own" ON bookings
  FOR SELECT USING (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
    OR is_business_admin(business_id)
    OR staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    )
  );

-- Anyone can create a booking (guest or auth)
CREATE POLICY "bookings_insert_any" ON bookings
  FOR INSERT WITH CHECK (TRUE);

-- Customers cancel their own; admins/staff manage all
CREATE POLICY "bookings_update_own" ON bookings
  FOR UPDATE USING (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
    OR is_business_admin(business_id)
    OR staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    )
  );
