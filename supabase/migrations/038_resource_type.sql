ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'room'
    CHECK (resource_type IN ('room', 'equipment', 'other'));
