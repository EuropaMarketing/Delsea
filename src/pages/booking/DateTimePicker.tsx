import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, isBefore, startOfDay, getDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Globe } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { generateTimeSlots } from '@/lib/slots'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import type { Availability, BlockedTime, Booking } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function DateTimePicker() {
  const navigate = useNavigate()
  const { draft, services, staff, setDate, setTimeSlot } = useBookingStore()

  const [calMonth, setCalMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(draft.date)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(draft.timeSlot)
  const [availability, setAvailability] = useState<Availability[]>([])
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([])
  const [existingBookings, setExistingBookings] = useState<Booking[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  const service = services.find((s) => s.id === draft.serviceId)
  const staffMember = staff.find((s) => s.id === draft.staffId)

  if (!draft.serviceId) { navigate('/book'); return null }

  // Load availability for the selected staff (or all staff)
  useEffect(() => {
    async function loadAvailability() {
      let query = supabase.from('availability').select('*')
      if (draft.staffId) {
        query = query.eq('staff_id', draft.staffId)
      } else {
        // Get all staff for this business
        const staffIds = staff.map((s) => s.id)
        if (staffIds.length) query = query.in('staff_id', staffIds)
      }
      const { data } = await query
      if (data) setAvailability(data as Availability[])
    }
    loadAvailability()
  }, [draft.staffId, staff])

  // Load bookings and blocked times when a date is selected
  useEffect(() => {
    if (!selectedDate) return
    setLoadingSlots(true)
    async function loadSlotData() {
      const dayStart = format(selectedDate!, "yyyy-MM-dd'T'00:00:00")
      const dayEnd = format(selectedDate!, "yyyy-MM-dd'T'23:59:59")

      const [bRes, btRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('*')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', dayStart)
          .lte('starts_at', dayEnd)
          .neq('status', 'cancelled'),
        supabase
          .from('blocked_times')
          .select('*')
          .gte('starts_at', dayStart)
          .lte('ends_at', dayEnd),
      ])
      if (bRes.data) setExistingBookings(bRes.data as Booking[])
      if (btRes.data) setBlockedTimes(btRes.data as BlockedTime[])
      setLoadingSlots(false)
    }
    loadSlotData()
  }, [selectedDate])

  // Days with any availability
  const availableDays = useMemo(() => {
    return new Set(availability.map((a) => a.day_of_week))
  }, [availability])

  const slots = useMemo(() => {
    if (!selectedDate || !service) return []
    return generateTimeSlots(
      selectedDate,
      availability,
      service.duration_minutes,
      existingBookings,
      blockedTimes,
    )
  }, [selectedDate, service, availability, existingBookings, blockedTimes])

  // Calendar helpers
  const days = eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })
  const firstDow = getDay(startOfMonth(calMonth)) // 0=Sun
  const todayStart = startOfDay(new Date())

  function handleDayClick(day: Date) {
    if (isBefore(day, todayStart)) return
    if (!availableDays.has(getDay(day))) return
    setSelectedDate(day)
    setSelectedSlot(null)
    setDate(day)
    setTimeSlot('')
  }

  function handleSlotClick(slot: string) {
    setSelectedSlot(slot)
    setTimeSlot(slot)
  }

  const canContinue = selectedDate && selectedSlot

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
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
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
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {days.map((day) => {
              const isPast = isBefore(day, todayStart)
              const hasSlots = availableDays.has(getDay(day))
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
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
                      : isToday
                      ? 'border-2 border-[var(--color-primary)] font-semibold text-[var(--color-primary)]'
                      : hasSlots && !isPast
                      ? 'hover:bg-gray-100 text-gray-900 cursor-pointer'
                      : 'text-gray-300 cursor-not-allowed',
                  )}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
        </div>

        {/* Time slots */}
        <div>
          {!selectedDate ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
              <Globe className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Select a date to see available times</p>
            </div>
          ) : loadingSlots ? (
            <FullPageSpinner />
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

      {/* Timezone note */}
      <p className="flex items-center gap-1 text-xs text-gray-400 mt-4">
        <Globe className="h-3.5 w-3.5" />
        Times shown in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
      </p>

      <div className="mt-6 flex justify-between">
        <Button variant="secondary" onClick={() => navigate('/staff')}>
          Back
        </Button>
        <Button size="lg" disabled={!canContinue} onClick={() => navigate('/details')}>
          Continue
        </Button>
      </div>
    </div>
  )
}
