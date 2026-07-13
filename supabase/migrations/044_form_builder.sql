-- ──────────────────────────────────────────────
-- Health questionnaire / consent form builder
-- ──────────────────────────────────────────────

-- A form attached to a specific service
CREATE TABLE IF NOT EXISTS service_forms (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id      UUID    REFERENCES services(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL DEFAULT 'Health Questionnaire',
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  validity_months INTEGER NOT NULL DEFAULT 6,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_forms_service ON service_forms(business_id, service_id);

-- Individual fields / questions within a form
CREATE TABLE IF NOT EXISTS form_fields (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     UUID    NOT NULL REFERENCES service_forms(id) ON DELETE CASCADE,
  field_type  TEXT    NOT NULL CHECK (field_type IN ('heading','yes_no','text','textarea','checkbox','emergency_contact')),
  label       TEXT    NOT NULL,
  required    BOOLEAN NOT NULL DEFAULT false,
  position    INTEGER NOT NULL DEFAULT 0,
  options     JSONB   NOT NULL DEFAULT '{}',
  -- options for yes_no: { "follow_up_label": "Please provide details" }
  -- options for checkbox: { "description": "extra info text shown below label" }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_fields_form ON form_fields(form_id, position);

-- Customer submissions — one row per completion, history preserved
CREATE TABLE IF NOT EXISTS form_responses (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID    NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id  UUID    NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  form_id      UUID    NOT NULL REFERENCES service_forms(id) ON DELETE CASCADE,
  booking_id   UUID    REFERENCES bookings(id) ON DELETE SET NULL,
  responses    JSONB   NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_responses_lookup ON form_responses(customer_id, form_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_responses_booking ON form_responses(booking_id);

-- ── RLS ──
ALTER TABLE service_forms  ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_fields    ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;

-- service_forms: admins full access; anyone can read active forms
CREATE POLICY "service_forms_admin"  ON service_forms FOR ALL    USING (is_business_admin(business_id));
CREATE POLICY "service_forms_select" ON service_forms FOR SELECT USING (is_active = true);

-- form_fields: admins full access; anyone can read fields on active forms
CREATE POLICY "form_fields_admin"  ON form_fields FOR ALL    USING (
  EXISTS (SELECT 1 FROM service_forms sf WHERE sf.id = form_fields.form_id AND is_business_admin(sf.business_id))
);
CREATE POLICY "form_fields_select" ON form_fields FOR SELECT USING (
  EXISTS (SELECT 1 FROM service_forms sf WHERE sf.id = form_fields.form_id AND sf.is_active = true)
);

-- form_responses: admins full access; staff read; customers read+insert their own
CREATE POLICY "form_responses_admin"  ON form_responses FOR ALL    USING (is_business_admin(business_id));
CREATE POLICY "form_responses_staff"  ON form_responses FOR SELECT USING (
  EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND business_id = form_responses.business_id)
);
CREATE POLICY "form_responses_customer_select" ON form_responses FOR SELECT USING (
  customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
);
CREATE POLICY "form_responses_customer_insert" ON form_responses FOR INSERT WITH CHECK (
  customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
);
