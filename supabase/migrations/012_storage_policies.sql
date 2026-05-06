-- ============================================================
-- Storage bucket + RLS policies for the assets bucket
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Ensure the bucket exists and is public (read)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('assets', 'assets', true, 10485760)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop any stale policies before recreating
DROP POLICY IF EXISTS "Allow authenticated uploads to assets"  ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to assets"  ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read of assets"            ON storage.objects;

-- Authenticated (admin) users can upload, update, delete
CREATE POLICY "Allow authenticated uploads to assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assets');

CREATE POLICY "Allow authenticated updates to assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'assets');

CREATE POLICY "Allow authenticated deletes from assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'assets');

-- Everyone can read (public bucket)
CREATE POLICY "Allow public read of assets" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'assets');
