-- ============================================================
-- Link reviews to the booking they came from
-- Run this in Supabase SQL Editor.
-- ============================================================

ALTER TABLE staff_reviews
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

-- Prevent a booking from being reviewed more than once
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_reviews_booking_id
  ON staff_reviews(booking_id) WHERE booking_id IS NOT NULL;
