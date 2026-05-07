-- ============================================================
-- Pre/post buffer minutes on services
-- Run this in Supabase SQL Editor.
-- ============================================================

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS pre_buffer_minutes  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_buffer_minutes SMALLINT NOT NULL DEFAULT 0;
