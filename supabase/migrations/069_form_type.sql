-- Distinguish "new customer" forms (which expire after validity_months and
-- must be re-completed) from "returning customer" forms (which never
-- expire). Services already link to a form_id (new) and returning_form_id
-- (returning) separately; this just tags each service_forms row with which
-- kind it is, so the admin UI can hide the validity setting for returning
-- forms and the two dropdowns on the Services page can be filtered.
alter table service_forms
  add column form_type text not null default 'new_client'
  check (form_type in ('new_client', 'returning_client'));
