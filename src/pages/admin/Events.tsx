import { useEffect, useState } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { Plus, Users, Clock, Trash2, DoorOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDuration } from '@/lib/currency'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Input'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { MonthCalendar } from '@/components/ui/MonthCalendar'
import type { Resource, Service, Staff } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type EventRow = {
  id: string
  event_date: string
  start_time: string
  max_capacity_override: number | null
  resource: { name: string } | null
  service: { id: string; name: string; price: number; duration_minutes: number; max_capacity: number | null }
  staff: { id: string; name: string } | null
}

type Attendee = { spots_booked: number; customer: { name: string; email: string } | null }

function combineDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}`)
}

type AddMode = 'new' | 'existing'

export default function AdminEvents() {
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [events, setEvents] = useState<EventRow[]>([])
  const [groupServices, setGroupServices] = useState<Service[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [resources, setResources] = useState<Resource[]>([])

  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('new')
  // shared fields
  const [addDate, setAddDate] = useState('')
  const [addTime, setAddTime] = useState('19:00')
  const [addStaffId, setAddStaffId] = useState('')
  const [addResourceId, setAddResourceId] = useState('')
  // 'new' mode fields
  const [addTitle, setAddTitle] = useState('')
  const [addPrice, setAddPrice] = useState('')
  const [addDuration, setAddDuration] = useState('60')
  const [addCapacityNew, setAddCapacityNew] = useState('')
  // 'existing' mode fields
  const [addServiceId, setAddServiceId] = useState('')
  const [addCapacityOverride, setAddCapacityOverride] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [attendeesLoading, setAttendeesLoading] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [canceling, setCanceling] = useState(false)

  useEffect(() => {
    supabase.from('services').select('*').eq('business_id', BUSINESS_ID).eq('is_group_session', true).eq('is_active', true).eq('is_event_only', false).order('name')
      .then(({ data }) => { if (data) setGroupServices(data as Service[]) })
    supabase.from('staff').select('*').eq('business_id', BUSINESS_ID).order('name')
      .then(({ data }) => { if (data) setStaffList(data as Staff[]) })
    supabase.from('resources').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).eq('resource_type', 'room').order('name')
      .then(({ data }) => { if (data) setResources(data as Resource[]) })
  }, [])

  useEffect(() => { fetchEvents(month) }, [month])

  async function fetchEvents(m: Date) {
    setLoading(true)
    const start = format(addMonths(m, -1), 'yyyy-MM-01')
    const end = format(addMonths(m, 2), 'yyyy-MM-01')
    const { data } = await supabase
      .from('service_sessions')
      .select('id, event_date, start_time, max_capacity_override, resource:resources(name), service:services(id,name,price,duration_minutes,max_capacity), staff:staff(id,name)')
      .eq('business_id', BUSINESS_ID)
      .eq('is_active', true)
      .not('event_date', 'is', null)
      .gte('event_date', start)
      .lt('event_date', end)
      .order('event_date').order('start_time')
    if (data) setEvents(data as unknown as EventRow[])
    setLoading(false)
  }

  function dayBadge(day: Date) {
    const key = format(day, 'yyyy-MM-dd')
    return events.filter((e) => e.event_date === key).length
  }

  const dayEvents = selectedDate
    ? events.filter((e) => e.event_date === format(selectedDate, 'yyyy-MM-dd'))
    : []

  function openAddModal() {
    setAddMode('new')
    setAddDate(selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'))
    setAddTime('19:00')
    setAddTitle('')
    setAddPrice('')
    setAddDuration('60')
    setAddCapacityNew('')
    setAddServiceId(groupServices[0]?.id ?? '')
    setAddCapacityOverride('')
    setAddStaffId('')
    setAddResourceId('')
    setAddError('')
    setAddOpen(true)
  }

  async function handleAddEvent() {
    setAddError('')
    if (!addDate || !addTime) { setAddError('Date and time are required'); return }

    let serviceId: string
    setAddSaving(true)

    if (addMode === 'new') {
      if (!addTitle.trim()) { setAddError('Event title is required'); setAddSaving(false); return }
      if (!addCapacityNew || parseInt(addCapacityNew) < 1) { setAddError('Capacity is required for one-time events'); setAddSaving(false); return }
      const priceInPence = Math.round(parseFloat(addPrice || '0') * 100)
      const { data: newService, error: sErr } = await supabase.from('services').insert({
        business_id: BUSINESS_ID,
        name: addTitle.trim(),
        price: priceInPence,
        duration_minutes: parseInt(addDuration) || 60,
        max_capacity: parseInt(addCapacityNew),
        category: 'Events',
        is_active: true,
        is_group_session: true,
        is_self_service: true,
        is_event_only: true,
        deposit_type: 'none',
        deposit_value: 0,
        pre_buffer_minutes: 0,
        post_buffer_minutes: 0,
      }).select('id').single()
      if (sErr || !newService) { setAddError(sErr?.message ?? 'Failed to create event'); setAddSaving(false); return }
      serviceId = newService.id
    } else {
      if (!addServiceId) { setAddError('Please select a service'); setAddSaving(false); return }
      serviceId = addServiceId
    }

    const { error: sessErr } = await supabase.from('service_sessions').insert({
      business_id: BUSINESS_ID,
      service_id: serviceId,
      event_date: addDate,
      start_time: addTime,
      staff_id: addStaffId || null,
      resource_id: addResourceId || null,
      max_capacity_override: addMode === 'existing' && addCapacityOverride ? parseInt(addCapacityOverride) : null,
    })

    if (sessErr) {
      setAddError(sessErr.message)
    } else {
      setAddOpen(false)
      fetchEvents(month)
    }
    setAddSaving(false)
  }

  async function openEventDetail(e: EventRow) {
    setSelectedEvent(e)
    setCancelOpen(false)
    setCancelReason('')
    setAttendeesLoading(true)
    const startsAt = combineDateTime(e.event_date, e.start_time)
    const { data } = await supabase
      .from('bookings')
      .select('spots_booked, customer:customers(name,email)')
      .eq('service_id', e.service.id)
      .eq('starts_at', startsAt.toISOString())
      .neq('status', 'cancelled')
    setAttendees((data as unknown as Attendee[]) ?? [])
    setAttendeesLoading(false)
  }

  async function handleCancelEvent() {
    if (!selectedEvent || !cancelReason.trim()) return
    setCanceling(true)
    const startsAt = combineDateTime(selectedEvent.event_date, selectedEvent.start_time)
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancellation_reason: cancelReason.trim() })
      .eq('service_id', selectedEvent.service.id)
      .eq('starts_at', startsAt.toISOString())
      .neq('status', 'cancelled')
    await supabase.from('service_sessions').update({ is_active: false }).eq('id', selectedEvent.id)
    setSelectedEvent(null)
    setCancelOpen(false)
    setCancelReason('')
    fetchEvents(month)
    setCanceling(false)
  }

  const spotsBooked = attendees.reduce((sum, a) => sum + a.spots_booked, 0)
  const capacity = selectedEvent ? (selectedEvent.max_capacity_override ?? selectedEvent.service.max_capacity ?? 8) : 0

  if (loading && events.length === 0) return <FullPageSpinner />

  const SelectField = ({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1 block">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)">
        {children}
      </select>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Events</h1>
        <Button size="sm" onClick={openAddModal}>
          <Plus className="h-4 w-4" />
          Add Event
        </Button>
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
            <p className="text-sm text-gray-400 text-center py-8">No events scheduled.</p>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((e) => (
                <button key={e.id} onClick={() => openEventDetail(e)} className="w-full text-left border border-gray-200 rounded-lg p-3 hover:border-(--color-primary) transition-colors">
                  <p className="font-semibold text-gray-900 text-sm">{e.service.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{e.start_time.slice(0, 5)}</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{e.max_capacity_override ?? e.service.max_capacity ?? 8} spots</span>
                    {e.resource && <span className="flex items-center gap-1"><DoorOpen className="h-3 w-3" />{e.resource.name}</span>}
                  </div>
                  {e.staff && <p className="text-xs text-gray-400 mt-1">with {e.staff.name}</p>}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Add event modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Event" size="sm">
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button type="button" onClick={() => setAddMode('new')} className={`flex-1 py-2 font-medium transition-colors ${addMode === 'new' ? 'bg-(--color-primary) text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              One-time event
            </button>
            <button type="button" onClick={() => setAddMode('existing')} disabled={groupServices.length === 0} className={`flex-1 py-2 font-medium transition-colors disabled:opacity-40 ${addMode === 'existing' ? 'bg-(--color-primary) text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              Use existing service
            </button>
          </div>

          {addMode === 'new' ? (
            <>
              <Input label="Event title" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="e.g. Sound Bath, Full Moon Yoga…" />
              <div className="grid grid-cols-3 gap-3">
                <Input label="Price (£)" type="number" min={0} step="0.01" value={addPrice} onChange={(e) => setAddPrice(e.target.value)} placeholder="0.00" />
                <Input label="Duration (min)" type="number" min={5} value={addDuration} onChange={(e) => setAddDuration(e.target.value)} />
                <Input label="Capacity" type="number" min={1} value={addCapacityNew} onChange={(e) => setAddCapacityNew(e.target.value)} placeholder="e.g. 15" />
              </div>
            </>
          ) : (
            <>
              <SelectField label="Service" value={addServiceId} onChange={setAddServiceId}>
                {groupServices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </SelectField>
              <Input
                label="Capacity override (optional)"
                type="number"
                min={1}
                value={addCapacityOverride}
                onChange={(e) => setAddCapacityOverride(e.target.value)}
                placeholder={`Default: ${groupServices.find((s) => s.id === addServiceId)?.max_capacity ?? 8}`}
              />
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
            <Input label="Time" type="time" value={addTime} onChange={(e) => setAddTime(e.target.value)} />
          </div>

          {resources.length > 0 && (
            <SelectField label="Room (optional)" value={addResourceId} onChange={setAddResourceId}>
              <option value="">No room assigned</option>
              {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </SelectField>
          )}

          <SelectField label="Instructor (optional)" value={addStaffId} onChange={setAddStaffId}>
            <option value="">No instructor assigned</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>

          {addError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</p>}
          <Button fullWidth loading={addSaving} onClick={handleAddEvent}>Add Event</Button>
        </div>
      </Modal>

      {/* Event detail modal */}
      <Modal open={!!selectedEvent} onClose={() => setSelectedEvent(null)} title={selectedEvent?.service.name} size="sm">
        {selectedEvent && (
          <div className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Date & time</dt>
                <dd className="font-medium text-gray-900">{format(combineDateTime(selectedEvent.event_date, selectedEvent.start_time), 'EEE d MMM yyyy, HH:mm')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Duration</dt>
                <dd className="text-gray-700">{formatDuration(selectedEvent.service.duration_minutes)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Price per spot</dt>
                <dd className="text-gray-700">{formatCurrency(selectedEvent.service.price)}</dd>
              </div>
              {selectedEvent.resource && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Room</dt>
                  <dd className="text-gray-700">{selectedEvent.resource.name}</dd>
                </div>
              )}
              {selectedEvent.staff && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Instructor</dt>
                  <dd className="text-gray-700">{selectedEvent.staff.name}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Spots</dt>
                <dd className="font-semibold text-gray-900">{attendeesLoading ? '…' : `${spotsBooked} / ${capacity} booked`}</dd>
              </div>
            </dl>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Attendees
              </p>
              {attendeesLoading ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : attendees.length === 0 ? (
                <p className="text-sm text-gray-400">No bookings yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {attendees.map((a, i) => (
                    <li key={i} className="flex justify-between text-sm bg-gray-50 rounded-lg px-3 py-1.5">
                      <span className="text-gray-800">{a.customer?.name ?? 'Unknown'}</span>
                      <span className="text-gray-500">{a.spots_booked} spot{a.spots_booked !== 1 ? 's' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {cancelOpen ? (
              <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-red-800">Reason for cancelling this event (required)</p>
                <p className="text-xs text-red-700">This will cancel all {attendees.length} attendee booking{attendees.length !== 1 ? 's' : ''} for this event.</p>
                <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Not enough demand, venue unavailable…" rows={2} />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setCancelOpen(false); setCancelReason('') }} className="shrink-0">Back</Button>
                  <Button fullWidth variant="danger" size="sm" loading={canceling} disabled={!cancelReason.trim()} onClick={handleCancelEvent}>
                    Confirm Cancellation
                  </Button>
                </div>
              </div>
            ) : (
              <Button fullWidth variant="danger" size="sm" onClick={() => setCancelOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Cancel Event
              </Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
