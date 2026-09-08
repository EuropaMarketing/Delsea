-- Lets a service (e.g. a dedicated "Contrast Room" group-session service) be
-- excluded from the main admin Calendar once it has its own dedicated calendar page.
ALTER TABLE services ADD COLUMN IF NOT EXISTS hide_from_main_calendar BOOLEAN NOT NULL DEFAULT false;
