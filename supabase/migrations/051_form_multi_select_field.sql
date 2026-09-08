-- Adds 'multi_select' as a valid form field type (choose any number of options
-- from a list, rendered as a checkbox group) — distinct from 'dropdown' (pick
-- exactly one) and 'checkbox' (a single yes/no acknowledgement).
-- options shape for multi_select: { "choices": ["Option 1", "Option 2", ...] }
-- (same shape as 'dropdown').
--
-- This migration restates the full allowed set (rather than just adding
-- 'multi_select') so it's a complete, idempotent fix regardless of whether
-- 046_form_dropdown_field.sql was ever actually applied.
ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_field_type_check;
ALTER TABLE form_fields ADD CONSTRAINT form_fields_field_type_check
  CHECK (field_type IN ('heading','yes_no','text','textarea','checkbox','emergency_contact','dropdown','multi_select'));
