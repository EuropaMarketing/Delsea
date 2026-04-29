-- Demo seed data (replace with real data in production)
INSERT INTO businesses (id, name, config) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Delséa',
  '{
    "brandName": "Delséa",
    "primaryColour": "#7C3AED",
    "secondaryColour": "#F59E0B",
    "currency": "GBP",
    "locale": "en-GB"
  }'
);

INSERT INTO staff (id, business_id, name, role, bio) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Alex Morgan', 'admin', 'Founder & senior stylist with 12 years experience.'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Jordan Lee',  'staff', 'Specialist in colour and balayage techniques.'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Sam Rivera', 'staff', 'Expert in precision cuts and beard grooming.');

INSERT INTO services (business_id, name, description, duration_minutes, price, category) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Haircut & Style',      'Expert cut tailored to your face shape',   45,  3500, 'Hair'),
  ('00000000-0000-0000-0000-000000000001', 'Colour & Highlights',  'Full colour or balayage highlights',       120, 9500, 'Colour'),
  ('00000000-0000-0000-0000-000000000001', 'Beard Trim & Shape',   'Precision beard sculpting',                30,  2000, 'Grooming'),
  ('00000000-0000-0000-0000-000000000001', 'Deep Conditioning',    'Intensive moisture treatment',             60,  4500, 'Treatment'),
  ('00000000-0000-0000-0000-000000000001', 'Blow Dry & Finish',    'Professional blow-dry and styling',        45,  2500, 'Hair'),
  ('00000000-0000-0000-0000-000000000001', 'Scalp Treatment',      'Relaxing scalp massage and treatment',     30,  3000, 'Treatment');

INSERT INTO availability (staff_id, day_of_week, start_time, end_time) VALUES
  -- Alex: Mon-Sat 9-18
  ('00000000-0000-0000-0000-000000000010', 1, '09:00', '18:00'),
  ('00000000-0000-0000-0000-000000000010', 2, '09:00', '18:00'),
  ('00000000-0000-0000-0000-000000000010', 3, '09:00', '18:00'),
  ('00000000-0000-0000-0000-000000000010', 4, '09:00', '18:00'),
  ('00000000-0000-0000-0000-000000000010', 5, '09:00', '18:00'),
  ('00000000-0000-0000-0000-000000000010', 6, '10:00', '16:00'),
  -- Jordan: Tue-Sat 10-19
  ('00000000-0000-0000-0000-000000000011', 2, '10:00', '19:00'),
  ('00000000-0000-0000-0000-000000000011', 3, '10:00', '19:00'),
  ('00000000-0000-0000-0000-000000000011', 4, '10:00', '19:00'),
  ('00000000-0000-0000-0000-000000000011', 5, '10:00', '19:00'),
  ('00000000-0000-0000-0000-000000000011', 6, '10:00', '19:00'),
  -- Sam: Mon-Fri 8-17
  ('00000000-0000-0000-0000-000000000012', 1, '08:00', '17:00'),
  ('00000000-0000-0000-0000-000000000012', 2, '08:00', '17:00'),
  ('00000000-0000-0000-0000-000000000012', 3, '08:00', '17:00'),
  ('00000000-0000-0000-0000-000000000012', 4, '08:00', '17:00'),
  ('00000000-0000-0000-0000-000000000012', 5, '08:00', '17:00');
