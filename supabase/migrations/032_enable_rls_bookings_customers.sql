-- bookings and customers had their RLS policies created but the
-- ENABLE ROW LEVEL SECURITY flag was never applied, so the policies
-- existed but were not being enforced. All policies are already in
-- place from earlier migrations — this just switches enforcement on.
ALTER TABLE bookings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
