-- ──────────────────────────────────────────────
-- Customer check-in: records when a customer arrives at the venue.
-- The activity log trigger automatically logs the change.
-- REPLICA IDENTITY FULL is required for Supabase Realtime to include
-- both old and new column values in UPDATE events, so we can detect
-- the transition from checked_in_at=NULL → checked_in_at=<timestamp>.
-- ──────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

ALTER TABLE bookings REPLICA IDENTITY FULL;

-- Add bookings to the Supabase Realtime publication so staff receive
-- instant in-app notifications when a customer is checked in.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
  END IF;
END $$;
