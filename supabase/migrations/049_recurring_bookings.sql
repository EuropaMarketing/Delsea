-- ──────────────────────────────────────────────
-- Recurring bookings: a series is a fixed set of independently-created
-- bookings rows sharing a client-generated recurrence_id. There is no
-- stored recurrence rule — each occurrence is a normal booking afterwards
-- (editable, draggable, cancellable on its own), just grouped for display
-- and bulk "cancel this & future" actions.
-- ──────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS recurrence_id UUID;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS recurrence_index INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS recurrence_total INTEGER;

CREATE INDEX IF NOT EXISTS idx_bookings_recurrence_id ON bookings(recurrence_id) WHERE recurrence_id IS NOT NULL;
