-- ──────────────────────────────────────────────
-- SumUp payment tracking
-- ──────────────────────────────────────────────

-- Saved card token lives on the customer (reusable across future bookings),
-- not the booking — a customer's card stays on file once they save it.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS sumup_card_token TEXT;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  -- unpaid | card_saved | deposit_paid | paid_in_full | failed
  ADD COLUMN IF NOT EXISTS deposit_charged INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_charged_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS payments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  type               TEXT        NOT NULL, -- tokenization | deposit | full | balance | noshow
  amount             INTEGER     NOT NULL, -- pence
  currency           TEXT        NOT NULL DEFAULT 'GBP',
  sumup_checkout_id  TEXT        NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'pending', -- pending | paid | failed
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_checkout ON payments(sumup_checkout_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select_own" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN customers c ON c.id = b.customer_id
      WHERE b.id = booking_id
        AND (c.user_id = auth.uid() OR is_business_admin(b.business_id))
    )
  );

-- Inserts/updates only ever happen from edge functions using the service role key,
-- which bypasses RLS — no admin/customer write policy needed.
