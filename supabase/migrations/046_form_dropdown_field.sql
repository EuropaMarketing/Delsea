-- Adds 'dropdown' as a valid form field type, for custom multi-choice select
-- questions (e.g. a Gender dropdown prefilled with business-defined options).
-- options shape for dropdown: { "choices": ["Option 1", "Option 2", ...] }

ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_field_type_check;
ALTER TABLE form_fields ADD CONSTRAINT form_fields_field_type_check
  CHECK (field_type IN ('heading','yes_no','text','textarea','checkbox','emergency_contact','dropdown'));
