-- Staff-only notes/alerts — never surfaced on any customer-facing page,
-- distinct from bookings.notes (which is the customer's own note from checkout).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS internal_notes TEXT;
