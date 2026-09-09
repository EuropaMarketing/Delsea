-- A service can now have a second form for returning clients. Which one is
-- required is decided at booking time: the New Client Form (services.form_id)
-- unless the customer already has a valid (non-expired) response to it, in
-- which case the Returning Client Form applies instead.
ALTER TABLE services ADD COLUMN IF NOT EXISTS returning_form_id UUID REFERENCES service_forms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_services_returning_form_id ON services(returning_form_id);
