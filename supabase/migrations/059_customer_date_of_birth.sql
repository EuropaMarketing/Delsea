-- Optional date of birth on customers, for future birthday-related features
-- (e.g. automatic birthday discount codes).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS date_of_birth DATE;
