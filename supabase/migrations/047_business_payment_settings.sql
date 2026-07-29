-- Per-business payment provider configuration.
-- The app previously used one global SumUp account (env vars) for every business —
-- this makes card payment credentials business-specific instead.
-- 'provider' is deliberately extensible: only 'sumup' is wired up today, but a future
-- Square/Stripe integration would add its own columns and provider value here rather
-- than a new table.
CREATE TABLE IF NOT EXISTS business_payment_settings (
  business_id         UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL DEFAULT 'none' CHECK (provider IN ('none', 'sumup')),
  sumup_api_key        TEXT,
  sumup_merchant_code  TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE business_payment_settings ENABLE ROW LEVEL SECURITY;

-- Credentials are secrets — only that business's own admins may read or write them.
-- No public select policy (unlike `businesses`), and edge functions read this via the
-- service role key, which bypasses RLS entirely.
CREATE POLICY "business_payment_settings_admin" ON business_payment_settings
  FOR ALL USING (is_business_admin(business_id));

-- Public-safe check the storefront can call to decide whether to offer online card
-- payment, without ever exposing the underlying credentials.
CREATE OR REPLACE FUNCTION business_accepts_card_payments(p_business_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_payment_settings
    WHERE business_id = p_business_id
      AND provider = 'sumup'
      AND coalesce(sumup_api_key, '') <> ''
      AND coalesce(sumup_merchant_code, '') <> ''
  );
$$;
