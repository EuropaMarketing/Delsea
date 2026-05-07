-- ============================================================
-- Allow authenticated customers to submit reviews
-- Run this in Supabase SQL Editor.
-- ============================================================

CREATE POLICY "reviews_insert_authenticated" ON staff_reviews
  FOR INSERT TO authenticated
  WITH CHECK (true);
