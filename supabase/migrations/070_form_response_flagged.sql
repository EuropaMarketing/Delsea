-- Lets a form field be marked as a "flag condition" (e.g. a yes_no question
-- about heart issues, flagged when answered Yes). Whether a given completed
-- form tripped one of its form_fields' flag conditions is computed once at
-- submission time and stored here, so every place that lists completed forms
-- can show a staff-attention indicator without re-fetching the form's fields.
alter table form_responses
  add column flagged boolean not null default false;

create index if not exists form_responses_flagged_idx on form_responses (flagged) where flagged;
