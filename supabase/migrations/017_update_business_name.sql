UPDATE businesses
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{brandName}',
  '"The Wellness Lounge ™"'
)
WHERE id = 'ad436ab8-fcb4-4f13-9807-ca902969d260';
