-- Lets an admin attach a form directly to a specific appointment, in addition
-- to whatever form (if any) the appointment's service already requires.
CREATE TABLE IF NOT EXISTS booking_forms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  form_id     UUID NOT NULL REFERENCES service_forms(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_forms_booking ON booking_forms(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_forms_form    ON booking_forms(form_id);

ALTER TABLE booking_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_forms_admin_all" ON booking_forms;
CREATE POLICY "booking_forms_admin_all" ON booking_forms
  FOR ALL USING (is_business_admin(business_id));

DROP POLICY IF EXISTS "booking_forms_select_own" ON booking_forms;
CREATE POLICY "booking_forms_select_own" ON booking_forms
  FOR SELECT USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      JOIN customers c ON c.id = b.customer_id
      WHERE c.user_id = auth.uid()
    )
  );
