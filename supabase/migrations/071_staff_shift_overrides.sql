-- "Adjust Shift" previously could only narrow a staff member's normal weekly
-- hours for one day (via a subtractive blocked_times row), never widen past
-- them — so a one-off private booking running later than the normal shift
-- couldn't be reflected at all. This table is a direct, per-date override of
-- the displayed/tracked hours, completely unbounded by the normal
-- availability row. It's admin-display-only: it does NOT feed into
-- generateTimeSlots, so it never changes what the public booking page offers
-- — narrowing a shift to keep the public from booking late still works the
-- old way, via blocked_times, unchanged.
create table staff_shift_overrides (
  id         uuid primary key default uuid_generate_v4(),
  staff_id   uuid not null references staff(id) on delete cascade,
  date       date not null,
  start_time time not null,
  end_time   time not null,
  reason     text,
  created_at timestamptz not null default now(),
  unique (staff_id, date)
);
create index idx_staff_shift_overrides_staff_date on staff_shift_overrides(staff_id, date);

-- Admin-only: unlike availability/blocked_times, nothing customer-facing ever
-- reads this table, so there's no need for a public select policy.
alter table staff_shift_overrides enable row level security;

create policy "staff_shift_overrides_all_admin" on staff_shift_overrides
  for all using (
    is_business_admin(
      (select business_id from staff where id = staff_id)
    )
  );
