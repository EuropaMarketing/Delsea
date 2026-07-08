-- ──────────────────────────────────────────────
-- 1. Update the activity-log trigger to track checked_in_at changes
--    (check-in and undo check-in were previously invisible in the log)
-- 2. Extend SELECT access: all staff + customers (own bookings only)
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_booking_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_type TEXT;
  v_actor_name TEXT;
  v_old_staff_name TEXT;
  v_new_staff_name TEXT;
  v_old_resource_name TEXT;
  v_new_resource_name TEXT;
BEGIN
  SELECT name INTO v_actor_name FROM staff WHERE user_id = auth.uid() AND business_id = NEW.business_id LIMIT 1;
  IF v_actor_name IS NOT NULL THEN
    v_actor_type := 'staff';
  ELSIF auth.uid() IS NOT NULL THEN
    -- Authenticated customer action — out of scope for this log.
    RETURN NEW;
  ELSE
    v_actor_type := 'system';
    v_actor_name := 'System';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value, reason)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name, 'status_changed',
      format('Status changed from %s to %s', OLD.status, NEW.status),
      OLD.status::text, NEW.status::text,
      CASE WHEN NEW.status = 'cancelled' THEN NEW.cancellation_reason ELSE NULL END
    );
  END IF;

  IF NEW.staff_id IS DISTINCT FROM OLD.staff_id THEN
    SELECT name INTO v_old_staff_name FROM staff WHERE id = OLD.staff_id;
    SELECT name INTO v_new_staff_name FROM staff WHERE id = NEW.staff_id;
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name, 'staff_reassigned',
      format('Staff changed from %s to %s', COALESCE(v_old_staff_name, 'Unassigned'), COALESCE(v_new_staff_name, 'Unassigned')),
      v_old_staff_name, v_new_staff_name
    );
  END IF;

  IF NEW.resource_id IS DISTINCT FROM OLD.resource_id THEN
    SELECT name INTO v_old_resource_name FROM resources WHERE id = OLD.resource_id;
    SELECT name INTO v_new_resource_name FROM resources WHERE id = NEW.resource_id;
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name, 'resource_reassigned',
      format('Room changed from %s to %s', COALESCE(v_old_resource_name, 'None'), COALESCE(v_new_resource_name, 'None')),
      v_old_resource_name, v_new_resource_name
    );
  END IF;

  IF NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at THEN
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name, 'rescheduled',
      format('Rescheduled from %s to %s', to_char(OLD.starts_at, 'DD Mon YYYY HH24:MI'), to_char(NEW.starts_at, 'DD Mon YYYY HH24:MI')),
      OLD.starts_at::text, NEW.starts_at::text
    );
  END IF;

  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (NEW.id, NEW.business_id, v_actor_type, v_actor_name, 'notes_updated', 'Notes updated', OLD.notes, NEW.notes);
  END IF;

  IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name,
      CASE WHEN COALESCE(NEW.discount_amount, 0) > COALESCE(OLD.discount_amount, 0) THEN 'discount_applied' ELSE 'discount_removed' END,
      CASE WHEN COALESCE(NEW.discount_amount, 0) > COALESCE(OLD.discount_amount, 0)
        THEN format('Discount applied: -£%s', to_char(NEW.discount_amount / 100.0, 'FM999999990.00'))
        ELSE 'Discount removed' END,
      OLD.discount_amount::text, NEW.discount_amount::text
    );
  END IF;

  IF NEW.gift_voucher_amount IS DISTINCT FROM OLD.gift_voucher_amount THEN
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name,
      CASE WHEN COALESCE(NEW.gift_voucher_amount, 0) > COALESCE(OLD.gift_voucher_amount, 0) THEN 'voucher_applied' ELSE 'voucher_removed' END,
      CASE WHEN COALESCE(NEW.gift_voucher_amount, 0) > COALESCE(OLD.gift_voucher_amount, 0)
        THEN format('Gift voucher applied: -£%s', to_char(NEW.gift_voucher_amount / 100.0, 'FM999999990.00'))
        ELSE 'Gift voucher removed' END,
      OLD.gift_voucher_amount::text, NEW.gift_voucher_amount::text
    );
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name, 'payment_status_changed',
      format('Payment status changed from %s to %s', REPLACE(COALESCE(OLD.payment_status, 'unpaid'), '_', ' '), REPLACE(NEW.payment_status, '_', ' ')),
      OLD.payment_status, NEW.payment_status
    );
  END IF;

  IF NEW.spots_booked IS DISTINCT FROM OLD.spots_booked THEN
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name, 'spots_changed',
      format('Spots booked changed from %s to %s', OLD.spots_booked, NEW.spots_booked),
      OLD.spots_booked::text, NEW.spots_booked::text
    );
  END IF;

  -- Check-in tracking (added: previously missing from trigger)
  IF NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at THEN
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name,
      CASE WHEN NEW.checked_in_at IS NOT NULL THEN 'checked_in' ELSE 'check_in_reversed' END,
      CASE
        WHEN NEW.checked_in_at IS NOT NULL
          THEN format('Customer checked in at %s', to_char(NEW.checked_in_at AT TIME ZONE 'UTC', 'HH24:MI DD Mon YYYY'))
        ELSE format('Check-in reversed (was %s)', to_char(OLD.checked_in_at AT TIME ZONE 'UTC', 'HH24:MI DD Mon YYYY'))
      END,
      OLD.checked_in_at::text, NEW.checked_in_at::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────
-- Extend read access to all staff (not just admin-role)
-- ──────────────────────────────────────────────
DROP POLICY IF EXISTS "booking_activity_log_staff_select" ON booking_activity_log;
CREATE POLICY "booking_activity_log_staff_select" ON booking_activity_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE user_id = auth.uid()
        AND business_id = booking_activity_log.business_id
    )
  );

-- ──────────────────────────────────────────────
-- Allow customers to read activity for their own bookings
-- Uses SECURITY DEFINER to avoid RLS recursion via bookings → customers
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION customer_owns_booking(p_booking_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    WHERE b.id = p_booking_id
      AND c.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "booking_activity_log_customer_select" ON booking_activity_log;
CREATE POLICY "booking_activity_log_customer_select" ON booking_activity_log
  FOR SELECT USING (customer_owns_booking(booking_id));
