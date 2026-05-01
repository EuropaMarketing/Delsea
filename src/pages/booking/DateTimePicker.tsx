import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, isBefore, isAfter, startOfDay, endOfDay,
  getDay, addDays, isSameMonth,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Globe, CalendarSearch } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { generateTimeSlots } from '@/lib/slots'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import type { Availability, BlockedTime, Booking } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function DateTimePicker() {
  const navigate = useNavigate()
  const { draft, services, staff, setDate, setTimeSlot } = useBookingStore()

  const [calMonth, setCalMonth] = useState(() =>
    draft.date ? startOfMonth(draft.date) : startOfMonth(new Date())
  )
  const [selectedDate, setSelectedDate] = useState<Date | null>(draft.date ?? null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(draft.timeSlot || null)
  const [availability, setAvailability] = useState<Availability[]>([])
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

  // Load staff availability schedule (day-of-week rules)
  useEffect(() => {
    setLoadingAvail(true)
    async function load() {
      let query = supabase.from('availability').select('*')
      if (draft.staffId) {
        query = query.eq('staff_id', draft.staffId)
      } else {
        const ids = staff.map((s) => s.id)
        if (ids.length) query = query.in('staff_id', ids)
      }
      const { data } = await query
      if (data) setAvailability(data as Availability[])
      setLoadingAvail(false)
    }
    load()
  }, [draft.staffId, staff])

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
    () => new Set(availability.map((a) => a.day_of_week)),
    [availability]
  )

  // Compute available slots for every non-past day in the calendar month
  const slotsPerDay = useMemo(() => {
    if (!service || !availability.length) return new Map<string, string[]>()
    const map = new Map<string, string[]>()
    for (const day of eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })) {
      if (isBefore(day, todayStart)) continue
      if (!availableDays.has(getDay(day))) continue
      const dayKey = format(day, 'yyyy-MM-dd')
      const dStart = startOfDay(day)
      const dEnd = endOfDay(day)
      const bks = monthBookings.filter((b) => b.starts_at.startsWith(dayKey))
      const blk = monthBlocked.filter((bt) => {
        const s = new Date(bt.starts_at), e = new Date(bt.ends_at)
        return isBefore(s, dEnd) && isAfter(e, dStart)
      })
      map.set(dayKey, generateTimeSlots(day, availability, service.duration_minutes, bks, blk))
    }
    return map
  }, [calMonth, service, availability, availableDays, monthBookings, monthBlocked, todayStart])

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

    while (isBefore(from, limit)) {
      const month = startOfMonth(from)
      const monthEnd = endOfMonth(month)
      const [bRes, btRes] = await Promise.all([
        supabase.from('bookings').select('*')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', month.toISOString())
          .lte('starts_at', monthEnd.toISOString())
          .neq('status', 'cancelled'),
        supabase.from('blocked_times').select('*')
          .lt('starts_at', monthEnd.toISOString())
          .gt('ends_at', month.toISOString()),
      ])
      const bks = (bRes.data ?? []) as Booking[]
      const blk = (btRes.data ?? []) as BlockedTime[]

      for (const day of eachDayOfInterval({ start: month, end: monthEnd })) {
        if (isBefore(day, todayStart)) continue
        if (!availableDays.has(getDay(day))) continue
        const dayKey = format(day, 'yyyy-MM-dd')
        const dStart = startOfDay(day)
        const dEnd = endOfDay(day)
        const dayBks = bks.filter((b) => b.starts_at.startsWith(dayKey))
        const dayBlk = blk.filter((bt) => {
          const s = new Date(bt.starts_at), e = new Date(bt.ends_at)
          return isBefore(s, dEnd) && isAfter(e, dStart)
        })
        const daySlots = generateTimeSlots(day, availability, service.duration_minutes, dayBks, dayBlk)
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
            {staffMember ? ` with ${staffMember.name}` : ' · Any available team member'}
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
                      ? 'bg-[var(--color-primary)] text-white font-bold'
                      : isToday && hasSlots
                      ? 'border-2 border-[var(--color-primary)] font-semibold text-[var(--color-primary)]'
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
                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
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

      <p className="flex items-center gap-1 text-xs text-gray-400 mt-4">
        <Globe className="h-3.5 w-3.5" />
        Times shown in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
      </p>

      <div className="mt-6 flex justify-between">
        <Button variant="secondary" onClick={() => navigate('/staff')}>Back</Button>
        <Button size="lg" disabled={!canContinue} onClick={() => navigate('/details')}>Continue</Button>
      </div>
    </div>
  )
}
