-- ============================================================
-- Portfolio photos + staff reviews
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Photo gallery
CREATE TABLE IF NOT EXISTS portfolio_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_photos_business ON portfolio_photos(business_id);
ALTER TABLE portfolio_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos_select_active" ON portfolio_photos
  FOR SELECT USING (is_active = TRUE OR is_business_admin(business_id));
CREATE POLICY "photos_all_admin" ON portfolio_photos
  FOR ALL USING (is_business_admin(business_id));

-- Reviews
CREATE TABLE IF NOT EXISTS staff_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id      UUID REFERENCES staff(id) ON DELETE SET NULL,
  reviewer_name TEXT NOT NULL,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  is_approved   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_reviews_business ON staff_reviews(business_id);
ALTER TABLE staff_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_select_approved" ON staff_reviews
  FOR SELECT USING (is_approved = TRUE OR is_business_admin(business_id));
CREATE POLICY "reviews_all_admin" ON staff_reviews
  FOR ALL USING (is_business_admin(business_id));
