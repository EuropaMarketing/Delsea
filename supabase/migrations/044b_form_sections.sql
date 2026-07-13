-- Adds the form_sections table and section_id column to form_fields.
-- Safe to run even if the base 044_form_builder.sql was already applied.

-- Sections table
CREATE TABLE IF NOT EXISTS form_sections (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id    UUID    NOT NULL REFERENCES service_forms(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL DEFAULT 'Section',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_sections_form ON form_sections(form_id, position);

-- Add section_id to form_fields (nullable — existing rows have no section yet)
ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES form_sections(id) ON DELETE CASCADE;

-- RLS
ALTER TABLE form_sections ENABLE ROW LEVEL SECURITY;

-- Policies (wrapped in DO block so they're skipped if they already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'form_sections' AND policyname = 'form_sections_admin'
  ) THEN
    CREATE POLICY "form_sections_admin" ON form_sections FOR ALL USING (
      EXISTS (SELECT 1 FROM service_forms sf WHERE sf.id = form_sections.form_id AND is_business_admin(sf.business_id))
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'form_sections' AND policyname = 'form_sections_select'
  ) THEN
    CREATE POLICY "form_sections_select" ON form_sections FOR SELECT USING (
      EXISTS (SELECT 1 FROM service_forms sf WHERE sf.id = form_sections.form_id AND sf.is_active = true)
    );
  END IF;
END $$;
