-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- BUSINESSES
-- ============================================================
CREATE TABLE businesses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- STAFF
-- ============================================================
CREATE TABLE staff (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'staff',
  avatar_url   TEXT,
  bio          TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_staff_business ON staff(business_id);

-- ============================================================
-- SERVICES
-- ============================================================
CREATE TABLE services (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0),
  price             INTEGER NOT NULL CHECK (price >= 0),  -- stored in pence/cents
  category          TEXT NOT NULL DEFAULT 'General',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_services_business ON services(business_id);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, email)
);
CREATE INDEX idx_customers_business ON customers(business_id);
CREATE INDEX idx_customers_user ON customers(user_id);

-- ============================================================
-- AVAILABILITY
-- ============================================================
CREATE TABLE availability (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id     UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  CONSTRAINT chk_availability_times CHECK (end_time > start_time)
);
CREATE INDEX idx_availability_staff ON availability(staff_id);

-- ============================================================
-- BLOCKED TIMES
-- ============================================================
CREATE TABLE blocked_times (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id   UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  reason     TEXT,
  CONSTRAINT chk_blocked_times CHECK (ends_at > starts_at)
);
CREATE INDEX idx_blocked_times_staff ON blocked_times(staff_id);

-- ============================================================
-- BOOKINGS
-- ============================================================
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');

CREATE TABLE bookings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  service_id   UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  status       booking_status NOT NULL DEFAULT 'pending',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_booking_times CHECK (ends_at > starts_at)
);
CREATE INDEX idx_bookings_business    ON bookings(business_id);
CREATE INDEX idx_bookings_customer    ON bookings(customer_id);
CREATE INDEX idx_bookings_staff       ON bookings(staff_id);
CREATE INDEX idx_bookings_starts_at   ON bookings(starts_at);
CREATE INDEX idx_bookings_status      ON bookings(status);
