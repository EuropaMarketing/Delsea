-- Records which rooms and equipment each staff member works with.
CREATE TABLE IF NOT EXISTS staff_resources (
  staff_id    UUID NOT NULL REFERENCES staff(id)     ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, resource_id)
);

ALTER TABLE staff_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_resources_read" ON staff_resources
  FOR SELECT USING (true);

CREATE POLICY "staff_resources_admin" ON staff_resources
  FOR ALL USING (
    is_business_admin((SELECT business_id FROM staff WHERE id = staff_id LIMIT 1))
  );
