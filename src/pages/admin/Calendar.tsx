import { useEffect, useState, useMemo } from 'react'
import {
  format, addWeeks, subWeeks, startOfWeek, eachDayOfInterval, addDays,
  parseISO, differenceInMinutes, setHours, setMinutes, isSameDay, addMinutes,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import type { Booking, Staff, Service, Customer } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string
const HOUR_HEIGHT = 60
const START_HOUR = 7
const END_HOUR = 21

const SERVICE_COLORS = [
  '#7C3AED', '#DB2777', '#0891B2', '#059669', '#D97706', '#DC2626',
]

type RichBooking = Booking & {
  service: { name: string; category: string }
  staff: { name: string } | null
  customer: { name: string }
}

interface DragState {
  bookingId: string
  startY: number
  originalEndsAt: string
  currentEndsAt: string
}

export default function AdminCalendar() {
  const [weekStart, setWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  )
  const [bookings, setBookings] = useState<RichBooking[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  // New booking modal state
  const [newBookingStaffId, setNewBookingStaffId] = useState<string | null>(null)
  const [nbServiceId, setNbServiceId] = useState('')
  const [nbDate, setNbDate] = useState('')
  const [nbTime, setNbTime] = useState('')
  const [nbName, setNbName] = useState('')
  const [nbEmail, setNbEmail] = useState('')
  const [nbPhone, setNbPhone] = useState('')
  const [nbNotes, setNbNotes] = useState('')
  const [nbSaving, setNbSaving] = useState(false)
  const [nbError, setNbError] = useState('')

  // Customer typeahead
  const [nbSuggestions, setNbSuggestions] = useState<Customer[]>([])
  const [nbShowSuggestions, setNbShowSuggestions] = useState(false)
  const [nbSelectedCustomerId, setNbSelectedCustomerId] = useState<string | null>(null)

  // Resize drag state
  const [drag, setDrag] = useState<DragState | null>(null)

  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) })

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [staffRes, bookRes, svcRes] = await Promise.all([
        supabase.from('staff').select('*').eq('business_id', BUSINESS_ID).order('name'),
        supabase
          .from('bookings')
          .select('*, service:services(name,category), staff:staff(name), customer:customers(name)')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', weekStart.toISOString())
          .lte('starts_at', addDays(weekStart, 7).toISOString())
          .neq('status', 'cancelled'),
        supabase.from('services').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).order('name'),
      ])
      if (staffRes.data) setStaff(staffRes.data as Staff[])
      if (bookRes.data) setBookings(bookRes.data as RichBooking[])
      if (svcRes.data) setServices(svcRes.data as Service[])
      setLoading(false)
    }
    load()
  }, [weekStart])

  // Attach drag-resize listeners to document
  useEffect(() => {
    if (!drag) return

    function onMouseMove(e: MouseEvent) {
      setDrag(prev => {
        if (!prev) return null
        const deltaY = e.clientY - prev.startY
        const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60 / 15) * 15
        const originalEnd = parseISO(prev.originalEndsAt)
        const booking = bookings.find(b => b.id === prev.bookingId)
        const startBase = booking ? parseISO(booking.starts_at) : originalEnd
        const minEnd = addMinutes(startBase, 15)
        const maxEnd = setMinutes(setHours(startBase, END_HOUR), 0)
        let newEnd = addMinutes(originalEnd, deltaMinutes)
        if (newEnd < minEnd) newEnd = minEnd
        if (newEnd > maxEnd) newEnd = maxEnd
        return { ...prev, currentEndsAt: newEnd.toISOString() }
      })
    }

    async function onMouseUp() {
      const snapshot = drag
      setDrag(null)
      if (!snapshot || snapshot.currentEndsAt === snapshot.originalEndsAt) return
      const { error } = await supabase
        .from('bookings')
        .update({ ends_at: snapshot.currentEndsAt })
        .eq('id', snapshot.bookingId)
      if (!error) {
        setBookings(prev =>
          prev.map(b => b.id === snapshot.bookingId ? { ...b, ends_at: snapshot.currentEndsAt } : b),
        )
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [drag, bookings])

  const categoryColorMap = useMemo(() => {
    const cats = [...new Set(bookings.map(b => b.service?.category))]
    return Object.fromEntries(cats.map((c, i) => [c, SERVICE_COLORS[i % SERVICE_COLORS.length]]))
  }, [bookings])

  function positionBooking(startsAt: string, endsAt: string) {
    const start = parseISO(startsAt)
    const end = parseISO(endsAt)
    const top = (differenceInMinutes(start, setMinutes(setHours(start, START_HOUR), 0)) / 60) * HOUR_HEIGHT
    const height = Math.max((differenceInMinutes(end, start) / 60) * HOUR_HEIGHT, 20)
    return { top, height }
  }

  function openNewBooking(e: React.MouseEvent<HTMLDivElement>, staffId: string) {
    if ((e.target as HTMLElement).closest('[data-booking]')) return
    if (drag) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const minutesFromStart = (y / HOUR_HEIGHT) * 60
    const totalMinutes = START_HOUR * 60 + minutesFromStart
    const snapped = Math.round(totalMinutes / 60) * 60
    const h = Math.min(Math.floor(snapped / 60), END_HOUR - 1)
    const m = snapped % 60
    const startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const today = format(new Date(), 'yyyy-MM-dd')
    setNewBookingStaffId(staffId)
    setNbDate(today)
    setNbTime(startTime)
    setNbServiceId(services[0]?.id ?? '')
    setNbName(''); setNbEmail(''); setNbPhone(''); setNbNotes('')
    setNbError(''); setNbSuggestions([]); setNbShowSuggestions(false); setNbSelectedCustomerId(null)
  }

  function closeNewBooking() {
    setNewBookingStaffId(null)
    setNbSuggestions([]); setNbShowSuggestions(false); setNbSelectedCustomerId(null)
  }

  async function searchCustomers(query: string) {
    if (query.length < 2) { setNbSuggestions([]); setNbShowSuggestions(false); return }
    const { data } = await supabase
      .from('customers')
      .select('id, name, email, phone, business_id, user_id, created_at')
      .eq('business_id', BUSINESS_ID)
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(8)
    if (data) { setNbSuggestions(data as Customer[]); setNbShowSuggestions(true) }
  }

  async function handleCreateBooking() {
    if (!newBookingStaffId) return
    if (!nbServiceId || !nbName.trim() || !nbEmail.trim()) {
      setNbError('Name, email and service are required.')
      return
    }
    const service = services.find(s => s.id === nbServiceId)
    if (!service || !nbDate || !nbTime) return

    const startsAt = new Date(`${nbDate}T${nbTime}:00`)
    const endsAt = addMinutes(startsAt, service.duration_minutes)

    setNbSaving(true)
    setNbError('')
    try {
      let customerId = nbSelectedCustomerId
      if (!customerId) {
        const { data: customer, error: custErr } = await supabase
          .from('customers')
          .upsert(
            {
              business_id: BUSINESS_ID,
              name: nbName.trim(),
              email: nbEmail.trim().toLowerCase(),
              phone: nbPhone.trim() || null,
            },
            { onConflict: 'business_id,email' },
          )
          .select('id')
          .single()
        if (custErr) throw custErr
        customerId = customer.id
      }

      const { data: booking, error: bookErr } = await supabase
        .from('bookings')
        .insert({
          business_id: BUSINESS_ID,
          customer_id: customerId,
          staff_id: newBookingStaffId,
          service_id: nbServiceId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: 'confirmed',
          notes: nbNotes.trim() || null,
        })
        .select('*, service:services(name,category), staff:staff(name), customer:customers(name)')
        .single()
      if (bookErr) throw bookErr

      setBookings(prev => [...prev, booking as RichBooking])
      closeNewBooking()
    } catch (err: unknown) {
      setNbError(err instanceof Error ? err.message : 'Failed to create booking.')
    } finally {
      setNbSaving(false)
    }
  }

  const selectedService = services.find(s => s.id === nbServiceId)
  const nbEndTime =
    selectedService && nbDate && nbTime
      ? format(addMinutes(new Date(`${nbDate}T${nbTime}:00`), selectedService.duration_minutes), 'HH:mm')
      : null

  if (loading) return <FullPageSpinner />

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

  return (
    <div className={cn(drag && 'select-none')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-45 text-center">
            {format(weekStart, 'd MMM')} – {format(addDays(weekStart, 6), 'd MMM yyyy')}
          </span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="ml-2 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Today
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 brand-card overflow-hidden overflow-x-auto">
        {/* Staff name header */}
        <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: `56px repeat(${staff.length || 1}, minmax(140px, 1fr))` }}>
          <div className="border-r border-gray-100" />
          {staff.map(member => (
            <div key={member.id} className="px-3 py-2.5 border-r border-gray-100 last:border-r-0 text-center">
              <p className="text-xs font-semibold text-gray-700 truncate">{member.name}</p>
              <p className="text-xs text-gray-400 capitalize">{member.role}</p>
            </div>
          ))}
        </div>

        {/* Date row */}
        <div className="grid border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns: `56px repeat(${staff.length || 1}, minmax(140px, 1fr))` }}>
          <div className="border-r border-gray-100" />
          {staff.map(member => (
            <div key={member.id} className="px-3 py-1.5 border-r border-gray-100 last:border-r-0 text-center">
              {weekDays.map(day => (
                <span
                  key={day.toISOString()}
                  className={cn(
                    'text-xs font-medium mr-1',
                    isSameDay(day, new Date()) ? 'text-(--color-primary)' : 'text-gray-500',
                  )}
                >
                  {format(day, 'EEE d')}
                </span>
              ))}
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div className="overflow-y-auto" style={{ maxHeight: `${HOUR_HEIGHT * (END_HOUR - START_HOUR)}px` }}>
          <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${staff.length || 1}, minmax(140px, 1fr))` }}>
            {/* Hour labels */}
            <div className="border-r border-gray-100">
              {hours.map(h => (
                <div
                  key={h}
                  className="text-right pr-2 text-xs text-gray-400 border-t border-gray-100 first:border-t-0"
                  style={{ height: HOUR_HEIGHT }}
                >
                  <span className="relative -top-2">{format(setMinutes(setHours(new Date(), h), 0), 'HH:mm')}</span>
                </div>
              ))}
            </div>

            {/* Staff columns */}
            {staff.map(member => (
              <div
                key={member.id}
                className="relative border-r border-gray-100 last:border-r-0 cursor-crosshair"
                style={{ height: HOUR_HEIGHT * (END_HOUR - START_HOUR) }}
                onClick={e => openNewBooking(e, member.id)}
              >
                {/* Hour lines */}
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-gray-100"
                    style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                  />
                ))}

                {/* Bookings */}
                {bookings
                  .filter(b => b.staff_id === member.id)
                  .map(booking => {
                    const isDragging = drag?.bookingId === booking.id
                    const endsAt = isDragging ? drag.currentEndsAt : booking.ends_at
                    const { top, height } = positionBooking(booking.starts_at, endsAt)
                    const color = categoryColorMap[booking.service?.category] ?? '#7C3AED'
                    return (
                      <div
                        key={booking.id}
                        data-booking="true"
                        className={cn(
                          'absolute left-1 right-1 rounded-md px-2 py-1 overflow-hidden transition-shadow',
                          isDragging ? 'shadow-lg ring-2 ring-offset-1' : 'hover:brightness-95',
                        )}
                        style={{
                          top,
                          height,
                          backgroundColor: `${color}22`,
                          borderLeft: `3px solid ${color}`,
                          ...(isDragging ? { ringColor: color } : {}),
                        }}
                        title={`${booking.customer?.name} — ${booking.service?.name}`}
                      >
                        <p className="text-xs font-semibold truncate" style={{ color }}>
                          {format(parseISO(booking.starts_at), 'HH:mm')} {booking.service?.name}
                        </p>
                        <p className="text-xs truncate text-gray-600">{booking.customer?.name}</p>
                        {isDragging && (
                          <p className="text-xs font-medium mt-0.5" style={{ color }}>
                            → {format(parseISO(endsAt), 'HH:mm')}
                          </p>
                        )}

                        {/* Drag-to-resize handle */}
                        <div
                          data-booking="true"
                          className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize flex items-end justify-center pb-0.5"
                          onMouseDown={e => {
                            e.stopPropagation()
                            e.preventDefault()
                            setDrag({
                              bookingId: booking.id,
                              startY: e.clientY,
                              originalEndsAt: booking.ends_at,
                              currentEndsAt: booking.ends_at,
                            })
                          }}
                        >
                          <div className="w-8 h-1 rounded-full opacity-40" style={{ backgroundColor: color }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New Booking Modal */}
      <Modal open={!!newBookingStaffId} onClose={closeNewBooking} title="New Booking" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Staff member</p>
              <p className="text-sm text-gray-900">{staff.find(s => s.id === newBookingStaffId)?.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Service</label>
              <select
                value={nbServiceId}
                onChange={e => setNbServiceId(e.target.value)}
                className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-(--color-primary)"
              >
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" value={nbDate} onChange={e => setNbDate(e.target.value)} required />
            <Input label="Start time" type="time" value={nbTime} onChange={e => setNbTime(e.target.value)} required />
          </div>

          {nbEndTime && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
              {selectedService?.duration_minutes} min · ends at {nbEndTime}
            </p>
          )}

          <hr className="border-gray-100" />

          <div className="relative">
            <Input
              label="Customer name"
              value={nbName}
              onChange={e => {
                setNbName(e.target.value)
                setNbSelectedCustomerId(null)
                searchCustomers(e.target.value)
              }}
              onFocus={() => nbName.length >= 2 && setNbShowSuggestions(true)}
              onBlur={() => setTimeout(() => setNbShowSuggestions(false), 150)}
              required
              placeholder="Start typing a name…"
              autoComplete="off"
            />
            {nbShowSuggestions && nbSuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {nbSuggestions.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    onMouseDown={() => {
                      setNbName(c.name)
                      setNbEmail(c.email)
                      setNbPhone(c.phone ?? '')
                      setNbSelectedCustomerId(c.id)
                      setNbShowSuggestions(false)
                    }}
                  >
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input
            label="Email"
            type="email"
            value={nbEmail}
            onChange={e => setNbEmail(e.target.value)}
            required
            placeholder="jane@example.com"
          />
          <Input
            label="Phone"
            type="tel"
            value={nbPhone}
            onChange={e => setNbPhone(e.target.value)}
            placeholder="+44 7700 900000"
          />
          <Textarea
            label="Notes"
            value={nbNotes}
            onChange={e => setNbNotes(e.target.value)}
            placeholder="Optional notes…"
          />

          {nbError && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{nbError}</p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={closeNewBooking}>Cancel</Button>
            <Button onClick={handleCreateBooking} loading={nbSaving}>Create Booking</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
