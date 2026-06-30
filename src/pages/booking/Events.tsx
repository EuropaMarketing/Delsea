import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, addMonths, subMonths, addMinutes } from 'date-fns'
import { Clock, Users, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { formatCurrency } from '@/lib/currency'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { MonthCalendar } from '@/components/ui/MonthCalendar'
import type { Service, Staff } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type EventRow = {
  id: string
  event_date: string
  start_time: string
  max_capacity_override: number | null
  service: Service
  staff: Staff | null
  resource: { name: string } | null
}

function combineDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}`)
}

export default function Events() {
  const navigate = useNavigate()
  const { setServices, setStaffList, setEventBooking } = useBookingStore()

  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [events, setEvents] = useState<EventRow[]>([])
  const [spotsTaken, setSpotsTaken] = useState<Record<string, number>>({})
  const [activeEvent, setActiveEvent] = useState<EventRow | null>(null)
  const [spots, setSpots] = useState(1)

  useEffect(() => { fetchEvents(month) }, [month])

  async function fetchEvents(m: Date) {
    setLoading(true)
    const start = format(addMonths(m, -1), 'yyyy-MM-01')
    const end = format(addMonths(m, 2), 'yyyy-MM-01')
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('service_sessions')
      .select('id, event_date, start_time, max_capacity_override, resource:resources(name), service:services(*), staff:staff(*)')
      .eq('business_id', BUSINESS_ID)
      .eq('is_active', true)
      .not('event_date', 'is', null)
      .gte('event_date', start)
      .lt('event_date', end)
      .gte('event_date', today)
      .order('event_date').order('start_time')

    const rows = (data as unknown as EventRow[]) ?? []
    setEvents(rows)

    if (rows.length) {
      const counts: Record<string, number> = {}
      for (const e of rows) {
        const startsAt = combineDateTime(e.event_date, e.start_time)
        const { data: bookings } = await supabase
          .from('bookings')
          .select('spots_booked')
          .eq('service_id', e.service.id)
          .eq('starts_at', startsAt.toISOString())
          .neq('status', 'cancelled')
        counts[e.id] = (bookings ?? []).reduce((sum, b) => sum + b.spots_booked, 0)
      }
      setSpotsTaken(counts)
    }
    setLoading(false)
  }

  function dayBadge(day: Date) {
    const key = format(day, 'yyyy-MM-dd')
    return events.filter((e) => e.event_date === key).length
  }

  const dayEvents = selectedDate
    ? events.filter((e) => e.event_date === format(selectedDate, 'yyyy-MM-dd'))
    : []

  function spotsRemaining(e: EventRow) {
    const capacity = e.max_capacity_override ?? e.service.max_capacity ?? 8
    return Math.max(0, capacity - (spotsTaken[e.id] ?? 0))
  }

  function openEvent(e: EventRow) {
    setActiveEvent(e)
    setSpots(1)
  }

  function handleBook() {
    if (!activeEvent) return
    const startsAt = combineDateTime(activeEvent.event_date, activeEvent.start_time)
    setServices([activeEvent.service])
    setStaffList(activeEvent.staff ? [activeEvent.staff] : [])
    setEventBooking({
      serviceId: activeEvent.service.id,
      staffId: activeEvent.staff?.id ?? null,
      date: startsAt,
      timeSlot: format(startsAt, 'HH:mm'),
      spotsBooked: spots,
      sessionId: activeEvent.id,
    })
    navigate('/details')
  }

  if (loading && events.length === 0) return <FullPageSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <p className="text-sm text-gray-500 mt-1">Group sessions and one-off events — book your spot below.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card padding="md">
          <MonthCalendar
            month={month}
            onPrevMonth={() => setMonth((m) => subMonths(m, 1))}
            onNextMonth={() => setMonth((m) => addMonths(m, 1))}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            dayBadge={dayBadge}
          />
        </Card>

        <Card padding="md">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {selectedDate ? format(selectedDate, 'EEEE d MMMM yyyy') : 'Select a date'}
          </h2>
          {dayEvents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No events on this date.</p>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((e) => {
                const remaining = spotsRemaining(e)
                return (
                  <button
                    key={e.id}
                    onClick={() => remaining > 0 && openEvent(e)}
                    disabled={remaining === 0}
                    className="w-full text-left border border-gray-200 rounded-lg p-3 hover:border-(--color-primary) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <p className="font-semibold text-gray-900 text-sm">{e.service.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{e.start_time.slice(0, 5)}</span>
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{remaining > 0 ? `${remaining} left` : 'Full'}</span>
                    </div>
                    {(e.staff || e.resource) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {e.staff ? `with ${e.staff.name}` : ''}{e.staff && e.resource ? ' · ' : ''}{e.resource ? e.resource.name : ''}
                      </p>
                    )}
                    <p className="text-sm font-bold text-gray-900 mt-1">{formatCurrency(e.service.price)}</p>
                  </button>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Event booking panel */}
      {activeEvent && (() => {
        const remaining = spotsRemaining(activeEvent)
        const startsAt = combineDateTime(activeEvent.event_date, activeEvent.start_time)
        const endsAt = addMinutes(startsAt, activeEvent.service.duration_minutes)
        return (
          <Card padding="md" className="mt-5 border-2" style={{ borderColor: 'var(--color-primary)' }}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{activeEvent.service.name}</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {format(startsAt, 'EEEE d MMMM yyyy')} · {format(startsAt, 'HH:mm')} – {format(endsAt, 'HH:mm')}
                </p>
                {(activeEvent.staff || activeEvent.resource) && (
                  <p className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                    {activeEvent.staff && <><User className="h-3 w-3" /> {activeEvent.staff.name}</>}
                    {activeEvent.staff && activeEvent.resource && <span>·</span>}
                    {activeEvent.resource && <>{activeEvent.resource.name}</>}
                  </p>
                )}
              </div>
              <p className="text-lg font-bold text-gray-900 shrink-0">{formatCurrency(activeEvent.service.price)}</p>
            </div>

            <div className="flex items-center gap-4 p-3 bg-gray-50 border border-gray-200 rounded-xl">
              <button
                onClick={() => setSpots((n) => Math.max(1, n - 1))}
                disabled={spots <= 1}
                className="h-9 w-9 rounded-full border border-gray-300 bg-white flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                −
              </button>
              <span className="text-2xl font-bold text-gray-900 w-6 text-center">{spots}</span>
              <button
                onClick={() => setSpots((n) => Math.min(remaining, n + 1))}
                disabled={spots >= remaining}
                className="h-9 w-9 rounded-full border border-gray-300 bg-white flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                +
              </button>
              <span className="text-xs text-gray-400">{remaining} spot{remaining !== 1 ? 's' : ''} available</span>
            </div>

            <div className="flex justify-between items-center mt-4">
              <Button variant="secondary" onClick={() => setActiveEvent(null)}>Back</Button>
              <Button size="lg" onClick={handleBook}>
                Continue · {formatCurrency(activeEvent.service.price * spots)}
              </Button>
            </div>
          </Card>
        )
      })()}
    </div>
  )
}
