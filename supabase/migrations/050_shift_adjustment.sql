-- Lets an admin shorten/adjust a staff member's shift for a single day (e.g. an
-- early finish when nothing's booked) without touching their permanent weekly
-- `availability`. Reuses `blocked_times` (already fully independent of
-- `availability`) — this flag just distinguishes a shift adjustment from an
-- ordinary block/leave entry so the calendar can render it differently.
ALTER TABLE blocked_times ADD COLUMN IF NOT EXISTS is_shift_adjustment BOOLEAN NOT NULL DEFAULT false;
