-- token_transactions was created manually during early development and
-- was replaced by membership_transactions (which has RLS enabled).
-- It has never had any rows and is not referenced anywhere in app code
-- or RPCs. Dropping it resolves the Supabase security advisory.
DROP TABLE IF EXISTS token_transactions;
