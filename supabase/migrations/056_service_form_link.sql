-- Inverts the form/service relationship: a form is now created standalone and can be
-- reused across multiple services, so the link is picked from the SERVICE side (services.form_id)
-- rather than each form being tied to exactly one service (service_forms.service_id).
ALTER TABLE services ADD COLUMN IF NOT EXISTS form_id UUID REFERENCES service_forms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_services_form_id ON services(form_id);

-- Carry over any existing single-service assignments to the new column
UPDATE services s
SET form_id = sf.id
FROM service_forms sf
WHERE sf.service_id = s.id
  AND s.form_id IS NULL;

-- service_forms.service_id is no longer read or written by the app — left in place
-- (unused) rather than dropped, since it still holds historical data.
