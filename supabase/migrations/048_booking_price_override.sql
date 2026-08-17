-- ──────────────────────────────────────────────
-- Per-booking price override: lets staff charge a one-off custom price for
-- a specific booking without touching the underlying service's price.
-- NULL means "use the service (or variant) price" — the existing default
-- behaviour is unchanged.
-- ──────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS price_override INTEGER;

-- ──────────────────────────────────────────────
-- Extend the activity log trigger (028_booking_activity_log.sql) to also
-- track customer reassignment, service changes, and price overrides — all
-- newly editable from the calendar's booking edit form.
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
  v_old_customer_name TEXT;
  v_new_customer_name TEXT;
  v_old_service_name TEXT;
  v_new_service_name TEXT;
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

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    SELECT name INTO v_old_customer_name FROM customers WHERE id = OLD.customer_id;
    SELECT name INTO v_new_customer_name FROM customers WHERE id = NEW.customer_id;
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name, 'customer_reassigned',
      format('Customer changed from %s to %s', COALESCE(v_old_customer_name, 'Unknown'), COALESCE(v_new_customer_name, 'Unknown')),
      v_old_customer_name, v_new_customer_name
    );
  END IF;

  IF NEW.service_id IS DISTINCT FROM OLD.service_id THEN
    SELECT name INTO v_old_service_name FROM services WHERE id = OLD.service_id;
    SELECT name INTO v_new_service_name FROM services WHERE id = NEW.service_id;
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name, 'service_changed',
      format('Service changed from %s to %s', COALESCE(v_old_service_name, 'Unknown'), COALESCE(v_new_service_name, 'Unknown')),
      v_old_service_name, v_new_service_name
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

  IF NEW.price_override IS DISTINCT FROM OLD.price_override THEN
    INSERT INTO booking_activity_log (booking_id, business_id, actor_type, actor_name, action, summary, old_value, new_value)
    VALUES (
      NEW.id, NEW.business_id, v_actor_type, v_actor_name,
      CASE WHEN NEW.price_override IS NOT NULL THEN 'price_overridden' ELSE 'price_override_removed' END,
      CASE WHEN NEW.price_override IS NOT NULL
        THEN format('Price overridden to £%s', to_char(NEW.price_override / 100.0, 'FM999999990.00'))
        ELSE 'Price override removed — back to service price' END,
      OLD.price_override::text, NEW.price_override::text
    );
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
