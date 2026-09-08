-- Links a booking to a separate, sequenced follow-on appointment (e.g. pressotherapy
-- booked immediately before or after a massage) — a real second `bookings` row with
-- its own staff/availability check, not an add-on that just extends the same
-- appointment's time block. Same grouping pattern as `recurrence_id`: a
-- client-generated UUID shared by every booking in the linked set.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS combo_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_bookings_combo_group_id ON bookings(combo_group_id) WHERE combo_group_id IS NOT NULL;
