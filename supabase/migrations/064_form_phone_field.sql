ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_field_type_check;
ALTER TABLE form_fields ADD CONSTRAINT form_fields_field_type_check
  CHECK (field_type IN ('heading','yes_no','text','textarea','checkbox','emergency_contact','dropdown','multi_select','signature','date','phone'));
