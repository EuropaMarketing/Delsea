import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, isBefore, isAfter, startOfDay, endOfDay,
  getDay, addDays, isSameMonth, parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Globe, CalendarSearch } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { generateTimeSlots } from '@/lib/slots'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import type { Availability, BlockedTime, Booking, ServiceSession, Staff } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function DateTimePicker() {
  const navigate = useNavigate()
  const { draft, services, staff, setDate, setTimeSlot, setSpotsBooked, setStaffList, rescheduleBookingId } = useBookingStore()

  const [calMonth, setCalMonth] = useState(() =>
    draft.date ? startOfMonth(draft.date) : startOfMonth(new Date())
  )
  const [selectedDate, setSelectedDate] = useState<Date | null>(draft.date ?? null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(draft.timeSlot || null)
  const [availability, setAvailability] = useState<Availability[]>([])
  const [groupSessions, setGroupSessions] = useState<ServiceSession[]>([])
  const [monthBookings, setMonthBookings] = useState<Booking[]>([])
  const [monthBlocked, setMonthBlocked] = useState<BlockedTime[]>([])
  const [loadingAvail, setLoadingAvail] = useState(true)
  const [loadingMonth, setLoadingMonth] = useState(true)
  const [findingNext, setFindingNext] = useState(false)
  const [initialLoaded, setInitialLoaded] = useState(() => !!draft.date)

  const todayStart = useMemo(() => startOfDay(new Date()), [])
  const skipMonthLoadKey = useRef<string | null>(null)
  const autoSelectedRef = useRef(false)

  const service = services.find((s) => s.id === draft.serviceId)
  const staffMember = staff.find((s) => s.id === draft.staffId)

  if (!draft.serviceId) { navigate('/book'); return null }

  // Load staff availability schedule (day-of-week rules) — skipped for group sessions
  useEffect(() => {
    if (service?.is_group_session) return
    setLoadingAvail(true)
    async function load() {
      let staffIds: string[]
      if (draft.staffId) {
        staffIds = [draft.staffId]
      } else if (staff.length) {
        staffIds = staff.map((s) => s.id)
      } else {
        const { data: staffData } = await supabase
          .from('staff')
          .select('*')
          .eq('business_id', BUSINESS_ID)
          .order('name')
        if (staffData) {
          setStaffList(staffData as Staff[])
          staffIds = (staffData as Staff[]).map((s) => s.id)
        } else {
          staffIds = []
        }
      }

      let query = supabase.from('availability').select('*')
      if (staffIds.length) query = query.in('staff_id', staffIds)
      const { data } = await query
      if (data) setAvailability(data as Availability[])
      setLoadingAvail(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.staffId, staff.length, setStaffList, service?.is_group_session])

  // Load session schedule for group sessions
  useEffect(() => {
    if (!service?.is_group_session) return
    setLoadingAvail(true)
    async function load() {
      const { data } = await supabase
        .from('service_sessions')
        .select('*')
        .eq('service_id', service!.id)
        .eq('is_active', true)
      if (data) setGroupSessions(data as ServiceSession[])
      setLoadingAvail(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service?.id, service?.is_group_session])

  // Load all bookings + blocked times for the visible calendar month
  useEffect(() => {
    const key = format(calMonth, 'yyyy-MM')
    // Skip re-fetch when findNextAvailable has already loaded this month's data
    if (skipMonthLoadKey.current === key) {
      skipMonthLoadKey.current = null
      setLoadingMonth(false)
      return
    }
    setLoadingMonth(true)
    const monthStart = startOfMonth(calMonth)
    const monthEnd = endOfMonth(calMonth)

    async function load() {
      const [bRes, btRes] = await Promise.all([
        supabase.from('bookings').select('*')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', monthStart.toISOString())
          .lte('starts_at', monthEnd.toISOString())
          .neq('status', 'cancelled'),
        supabase.from('blocked_times').select('*')
          .lt('starts_at', monthEnd.toISOString())
          .gt('ends_at', monthStart.toISOString()),
      ])
      if (bRes.data) setMonthBookings(bRes.data as Booking[])
      if (btRes.data) setMonthBlocked(btRes.data as BlockedTime[])
      setLoadingMonth(false)
    }
    load()
  }, [calMonth])

  const availableDays = useMemo(
    () => service?.is_group_session
      ? new Set(groupSessions.map((s) => s.day_of_week))
      : new Set(availability.map((a) => a.day_of_week)),
    [service?.is_group_session, groupSessions, availability]
  )

  // Compute available slots for every non-past day in the calendar month
  const slotsPerDay = useMemo(() => {
    if (!service) return new Map<string, string[]>()
    const map = new Map<string, string[]>()

    if (service.is_group_session) {
      if (!groupSessions.length) return map
      const maxCap = service.max_capacity ?? 8
      for (const day of eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })) {
        if (isBefore(day, todayStart)) continue
        const daySessions = groupSessions.filter((s) => s.day_of_week === getDay(day))
        if (!daySessions.length) continue
        const dayKey = format(day, 'yyyy-MM-dd')
        const counts: Record<string, number> = {}
        for (const b of monthBookings.filter((b) => b.service_id === service.id && b.starts_at.startsWith(dayKey))) {
          const t = format(parseISO(b.starts_at), 'HH:mm')
          counts[t] = (counts[t] ?? 0) + (b.spots_booked ?? 1)
        }
        const available = daySessions.filter((s) => (counts[s.start_time.substring(0, 5)] ?? 0) < maxCap)
        if (available.length) map.set(dayKey, available.map((s) => s.start_time.substring(0, 5)))
      }
      return map
    }

    if (!availability.length) return map
    for (const day of eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })) {
      if (isBefore(day, todayStart)) continue
      if (!availableDays.has(getDay(day))) continue
      const dayKey = format(day, 'yyyy-MM-dd')
      const dStart = startOfDay(day)
      const dEnd = endOfDay(day)
      const bks = monthBookings
        .filter((b) => b.starts_at.startsWith(dayKey))
        .filter((b) => service.is_self_service
          ? b.service_id === service.id || (service.resource_id != null && b.resource_id === service.resource_id)
          : true)
      const blk = monthBlocked.filter((bt) => {
        const s = new Date(bt.starts_at), e = new Date(bt.ends_at)
        return isBefore(s, dEnd) && isAfter(e, dStart)
      })
      map.set(dayKey, generateTimeSlots(day, availability, draft.variantDuration ?? service.duration_minutes, bks, blk))
    }
    return map
  }, [calMonth, service, groupSessions, availability, availableDays, monthBookings, monthBlocked, todayStart])

  // Auto-select the first available day once data is ready (runs once)
  useEffect(() => {
    if (loadingAvail || loadingMonth || !service) return
    if (autoSelectedRef.current) return
    autoSelectedRef.current = true

    if (!selectedDate) {
      const first = eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })
        .find((d) => !isBefore(d, todayStart) && (slotsPerDay.get(format(d, 'yyyy-MM-dd'))?.length ?? 0) > 0)
      if (first) {
        setSelectedDate(first)
        setDate(first)
      }
    }
    setInitialLoaded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAvail, loadingMonth, slotsPerDay, service])

  const slots = useMemo(
    () => selectedDate ? (slotsPerDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? []) : [],
    [selectedDate, slotsPerDay]
  )

  // Capacity-aware slot list for group sessions on the selected date
  const groupSlots = useMemo(() => {
    if (!service?.is_group_session || !selectedDate || !groupSessions.length) return []
    const daySessions = groupSessions
      .filter((s) => s.day_of_week === getDay(selectedDate))
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
    if (!daySessions.length) return []
    const dayKey = format(selectedDate, 'yyyy-MM-dd')
    const counts: Record<string, number> = {}
    for (const b of monthBookings.filter((b) => b.service_id === service.id && b.starts_at.startsWith(dayKey))) {
      const t = format(parseISO(b.starts_at), 'HH:mm')
      counts[t] = (counts[t] ?? 0) + 1
    }
    const maxCap = service.max_capacity ?? 8
    return daySessions.map((s) => ({
      time: s.start_time.substring(0, 5),
      spotsLeft: Math.max(0, maxCap - (counts[s.start_time.substring(0, 5)] ?? 0)),
    }))
  }, [service, selectedDate, groupSessions, monthBookings])

  const monthHasSlots = useMemo(
    () => [...slotsPerDay.values()].some((s) => s.length > 0),
    [slotsPerDay]
  )

  // Search forward (up to 90 days) for the next month that has open slots
  async function findNextAvailable() {
    if (!service) return
    setFindingNext(true)
    let from = addDays(endOfMonth(calMonth), 1)
    const limit = addDays(new Date(), 90)
    const maxCap = service.max_capacity ?? 8

    while (isBefore(from, limit)) {
      const month = startOfMonth(from)
      const monthEnd = endOfMonth(month)
      const [bRes, btRes] = await Promise.all([
        supabase.from('bookings').select('*')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', month.toISOString())
          .lte('starts_at', monthEnd.toISOString())
          .neq('status', 'cancelled'),
        service.is_group_session
          ? Promise.resolve({ data: [] as BlockedTime[] })
          : supabase.from('blocked_times').select('*')
              .lt('starts_at', monthEnd.toISOString())
              .gt('ends_at', month.toISOString()),
      ])
      const bks = (bRes.data ?? []) as Booking[]
      const blk = (btRes.data ?? []) as BlockedTime[]

      for (const day of eachDayOfInterval({ start: month, end: monthEnd })) {
        if (isBefore(day, todayStart)) continue
        const dayKey = format(day, 'yyyy-MM-dd')
        let daySlots: string[] = []

        if (service.is_group_session) {
          const daySessions = groupSessions.filter((s) => s.day_of_week === getDay(day))
          if (!daySessions.length) continue
          const counts: Record<string, number> = {}
          for (const b of bks.filter((b) => b.service_id === service.id && b.starts_at.startsWith(dayKey))) {
            const t = format(parseISO(b.starts_at), 'HH:mm')
            counts[t] = (counts[t] ?? 0) + 1
          }
          daySlots = daySessions
            .filter((s) => (counts[s.start_time.substring(0, 5)] ?? 0) < maxCap)
            .map((s) => s.start_time.substring(0, 5))
        } else {
          if (!availableDays.has(getDay(day))) continue
          const dStart = startOfDay(day)
          const dEnd = endOfDay(day)
          const dayBks = bks
            .filter((b) => b.starts_at.startsWith(dayKey))
            .filter((b) => service.is_self_service
              ? b.service_id === service.id || (service.resource_id != null && b.resource_id === service.resource_id)
              : true)
          const dayBlk = blk.filter((bt) => {
            const s = new Date(bt.starts_at), e = new Date(bt.ends_at)
            return isBefore(s, dEnd) && isAfter(e, dStart)
          })
          daySlots = generateTimeSlots(day, availability, draft.variantDuration ?? service.duration_minutes, dayBks, dayBlk)
        }

        if (daySlots.length > 0) {
          skipMonthLoadKey.current = format(month, 'yyyy-MM')
          setCalMonth(month)
          setMonthBookings(bks)
          setMonthBlocked(blk)
          setSelectedDate(day)
          setDate(day)
          setSelectedSlot(null)
          setTimeSlot('')
          setFindingNext(false)
          return
        }
      }
      from = addDays(monthEnd, 1)
    }
    setFindingNext(false)
  }

  function handleDayClick(day: Date) {
    if (isBefore(day, todayStart)) return
    if ((slotsPerDay.get(format(day, 'yyyy-MM-dd'))?.length ?? 0) === 0) return
    setSelectedDate(day)
    setSelectedSlot(null)
    setDate(day)
    setTimeSlot('')
  }

  function handleSlotClick(slot: string) {
    setSelectedSlot(slot)
    setTimeSlot(slot)
  }

  const calDays = eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })
  const firstDow = getDay(startOfMonth(calMonth))
  const canContinue = !!(selectedDate && selectedSlot)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pick a Date & Time</h1>
        {service && (
          <p className="text-sm text-gray-500 mt-1">
            {service.name}
            {draft.variantName && ` · ${draft.variantName}`}
            {service.is_self_service
              ? ' · Self-service'
              : staffMember
              ? ` with ${staffMember.name}`
              : ' · Any available team member'}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Calendar */}
        <div className="bg-white border border-gray-200 brand-card p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCalMonth((m) => subMonths(m, 1))}
              disabled={isSameMonth(calMonth, new Date())}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
            <span className="font-semibold text-sm text-gray-900">
              {format(calMonth, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => setCalMonth((m) => addMonths(m, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Day cells — fades while loading month data */}
          <div className={cn('grid grid-cols-7 gap-0.5 transition-opacity duration-150', loadingMonth && 'opacity-40 pointer-events-none')}>
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {calDays.map((day) => {
              const isPast = isBefore(day, todayStart)
              const isScheduled = availableDays.has(getDay(day))
              const dayKey = format(day, 'yyyy-MM-dd')
              const hasSlots = (slotsPerDay.get(dayKey)?.length ?? 0) > 0
              // Scheduled day with no remaining slots = fully booked → show diagonal slash
              const isFullyBooked = !isPast && isScheduled && !hasSlots
              const isSelected = !!selectedDate && isSameDay(day, selectedDate)
              const isToday = isSameDay(day, new Date())

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => handleDayClick(day)}
                  disabled={isPast || !hasSlots}
                  className={cn(
                    'aspect-square rounded-full text-sm flex items-center justify-center transition-all',
                    isSelected
                      ? 'bg-(--color-primary) text-white font-bold'
                      : isToday && hasSlots
                      ? 'border-2 border-(--color-primary) font-semibold text-(--color-primary)'
                      : hasSlots
                      ? 'hover:bg-gray-100 text-gray-900 cursor-pointer'
                      : 'text-gray-300 cursor-not-allowed',
                  )}
                >
                  {isFullyBooked ? (
                    <span className="relative inline-flex items-center justify-center w-full h-full">
                      {format(day, 'd')}
                      {/* Diagonal slash indicating fully booked */}
                      <span
                        className="absolute pointer-events-none"
                        style={{ width: '75%', height: '1.5px', background: '#d1d5db', transform: 'rotate(-45deg)' }}
                      />
                    </span>
                  ) : format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* No availability this month — offer to jump forward */}
          {!loadingMonth && !monthHasSlots && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400 mb-2">No availability this month</p>
              <button
                onClick={findNextAvailable}
                disabled={findingNext}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
              >
                <CalendarSearch className="h-3.5 w-3.5" />
                {findingNext ? 'Searching…' : 'Find next available →'}
              </button>
            </div>
          )}
        </div>

        {/* Time slots panel */}
        <div>
          {!initialLoaded ? (
            <div className="flex items-center justify-center h-full py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-[var(--color-primary)]" />
            </div>
          ) : !selectedDate ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
              <Globe className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Select a date to see available times</p>
            </div>
          ) : service?.is_group_session ? (
            groupSlots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                <p className="text-sm font-medium">No sessions on this day.</p>
                <p className="text-xs mt-1">Try a different date.</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700 mb-3">
                  {format(selectedDate!, 'EEEE, d MMMM')}
                </p>
                <div className="space-y-2">
                  {groupSlots.map((slot) => (
                    <button
                      key={slot.time}
                      disabled={slot.spotsLeft === 0}
                      onClick={() => slot.spotsLeft > 0 && handleSlotClick(slot.time)}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-3 text-sm font-medium border transition-all rounded-(--border-radius-sm)',
                        slot.spotsLeft === 0
                          ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                          : selectedSlot === slot.time
                          ? 'bg-(--color-primary) text-white border-(--color-primary)'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-(--color-primary) hover:text-(--color-primary)',
                      )}
                    >
                      <span>{slot.time}</span>
                      <span className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded-full',
                        slot.spotsLeft === 0
                          ? 'bg-red-100 text-red-600'
                          : slot.spotsLeft <= 2
                          ? 'bg-amber-100 text-amber-700'
                          : selectedSlot === slot.time
                          ? 'bg-white/20 text-white'
                          : 'bg-green-100 text-green-700',
                      )}>
                        {slot.spotsLeft === 0 ? 'Full' : `${slot.spotsLeft} spot${slot.spotsLeft === 1 ? '' : 's'} left`}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )
          ) : slots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
              <p className="text-sm font-medium">No availability on this day.</p>
              <p className="text-xs mt-1">Try a different date.</p>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700 mb-3">
                {format(selectedDate, 'EEEE, d MMMM')}
              </p>
              <div className="slot-grid">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => handleSlotClick(slot)}
                    className={cn(
                      'py-2.5 text-sm font-medium border transition-all [border-radius:var(--border-radius-sm)]',
                      selectedSlot === slot
                        ? 'bg-(--color-primary) text-white border-(--color-primary)'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-(--color-primary) hover:text-(--color-primary)',
                    )}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Spots picker — shown after selecting a group session slot */}
      {service?.is_group_session && selectedSlot && (() => {
        const slot = groupSlots.find((s) => s.time === selectedSlot)
        const maxSpots = slot?.spotsLeft ?? 1
        return (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-sm font-semibold text-gray-800 mb-3">How many spots?</p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSpotsBooked(Math.max(1, draft.spotsBooked - 1))}
                disabled={draft.spotsBooked <= 1}
                className="h-9 w-9 rounded-full border border-gray-300 bg-white flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                −
              </button>
              <span className="text-2xl font-bold text-gray-900 w-6 text-center">{draft.spotsBooked}</span>
              <button
                onClick={() => setSpotsBooked(Math.min(maxSpots, draft.spotsBooked + 1))}
                disabled={draft.spotsBooked >= maxSpots}
                className="h-9 w-9 rounded-full border border-gray-300 bg-white flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                +
              </button>
              <span className="text-xs text-gray-400">{maxSpots} spot{maxSpots !== 1 ? 's' : ''} available</span>
            </div>
            {draft.spotsBooked === maxSpots && maxSpots > 1 && (
              <p className="text-xs text-amber-600 mt-2">This will fill the session.</p>
            )}
          </div>
        )
      })()}

      <p className="flex items-center gap-1 text-xs text-gray-400 mt-4">
        <Globe className="h-3.5 w-3.5" />
        Times shown in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
      </p>

      <div className="mt-6 flex justify-between">
        <Button variant="secondary" onClick={() => navigate(rescheduleBookingId ? '/my-bookings' : service?.is_self_service ? '/book' : '/staff')}>Back</Button>
        <Button
          size="lg"
          disabled={!canContinue}
          onClick={() => navigate(rescheduleBookingId ? '/reschedule-confirm' : '/details')}
        >
          {rescheduleBookingId ? 'Choose this time →' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
