-- Looks up a customer's profile (name, phone) for the booking pre-fill form.
-- Uses SECURITY DEFINER so it can join auth.users to match by email even when
-- the customers.user_id hasn't been linked yet (race condition between
-- link_customer_to_user and the CustomerDetails useEffect).
CREATE OR REPLACE FUNCTION get_customer_profile(p_business_id UUID)
RETURNS TABLE (name TEXT, phone TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT c.name, c.phone
  FROM customers c
  WHERE c.business_id = p_business_id
    AND (
      c.user_id = auth.uid()
      OR LOWER(c.email) = LOWER(
        (SELECT u.email FROM auth.users u WHERE u.id = auth.uid())
      )
    )
  LIMIT 1;
$$;
