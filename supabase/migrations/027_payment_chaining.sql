-- SumUp only saves a card during a SETUP_RECURRING_PAYMENT (tokenization) checkout —
-- a normal CHECKOUT with customer_id attached does NOT save the card.
-- So "Pay by Card" now tokenizes first (one £1 hold, instantly refunded), then the
-- webhook immediately charges the real amount using the fresh token. These columns
-- record what that follow-up charge should be once tokenization succeeds.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS target_amount INTEGER,
  ADD COLUMN IF NOT EXISTS target_type TEXT;
