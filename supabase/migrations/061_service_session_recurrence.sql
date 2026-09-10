-- ──────────────────────────────────────────────
-- Real recurrence linkage for service_sessions (group-session "open slots" /
-- one-off events created via the New Booking modal's repeat option).
--
-- Cancel/edit "apply to all future sessions" previously matched sibling
-- occurrences by guessing (same service + time-of-day + day-of-week), which
-- only works for a weekly pattern — a daily (or monthly) repeat produces
-- occurrences on different weekdays, so the guess silently matched nothing
-- and "apply to all" only ever touched the one session being edited.
-- ──────────────────────────────────────────────

ALTER TABLE service_sessions ADD COLUMN IF NOT EXISTS recurrence_id UUID;
CREATE INDEX IF NOT EXISTS idx_service_sessions_recurrence_id ON service_sessions(recurrence_id) WHERE recurrence_id IS NOT NULL;
