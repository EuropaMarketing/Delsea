import { useEffect, useState, useMemo, useRef } from 'react'
import {
  format, addDays, subDays, startOfDay, endOfDay,
  parseISO, differenceInMinutes, setHours, setMinutes, addMinutes, isToday,
} from 'date-fns'
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Star, Users, CheckCircle2, XCircle, Lock, Pencil, Ticket, Tag, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Input, Textarea } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/currency'
import type { Booking, Staff, Service, Customer } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string
const HOUR_HEIGHT = 60
const START_HOUR = 7
const END_HOUR = 21

const SERVICE_COLORS = [
  '#7C3AED', '#DB2777', '#0891B2', '#059669', '#D97706', '#DC2626',
]

type RichBooking = Booking & {
  discount_amount: number
  service: { name: string; category: string; price: number }
  staff: { name: string } | null
  customer: { name: string; email: string; phone: string | null }
}

type BlockedTime = {
  id: string
  staff_id: string
  starts_at: string
  ends_at: string
  reason: string | null
}

interface DragState {
  bookingId: string
  startY: number
  originalEndsAt: string
  currentEndsAt: string
}

export default function AdminCalendar() {
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [bookings, setBookings] = useState<RichBooking[]>([])
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [ratings, setRatings] = useState<Record<string, { avg: number; count: number }>>({})

  // New booking modal
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
  const [nbSuggestions, setNbSuggestions] = useState<Customer[]>([])
  const [nbShowSuggestions, setNbShowSuggestions] = useState(false)
  const [nbSelectedCustomerId, setNbSelectedCustomerId] = useState<string | null>(null)

  // Block Time modal
  const [btOpen, setBtOpen] = useState(false)
  const [btStaffId, setBtStaffId] = useState('')
  const [btDate, setBtDate] = useState('')
  const [btStart, setBtStart] = useState('09:00')
  const [btEnd, setBtEnd] = useState('10:00')
  const [btReason, setBtReason] = useState('Booked Time')
  const [btSaving, setBtSaving] = useState(false)
  const [btError, setBtError] = useState('')
  const [selectedBlock, setSelectedBlock] = useState<BlockedTime | null>(null)

  // Booking detail / edit
  const [selectedBooking, setSelectedBooking] = useState<RichBooking | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  // Token state in edit mode
  const [editTokenInfo, setEditTokenInfo] = useState<{ membershipId: string; planName: string; tokens: number } | null>(null)
  const [editTokenApplied, setEditTokenApplied] = useState(false)
  const [editTokenLoading, setEditTokenLoading] = useState(false)
  // Discount state in edit mode
  const [editDiscountCode, setEditDiscountCode] = useState('')
  const [editDiscountApplying, setEditDiscountApplying] = useState(false)
  const [editDiscountError, setEditDiscountError] = useState('')
  const [editDiscountApplied, setEditDiscountApplied] = useState(false)
  const [editDiscountAmount, setEditDiscountAmount] = useState(0)

  // Resize drag
  const [drag, setDrag] = useState<DragState | null>(null)

  // Current time line
  const [now, setNow] = useState(new Date())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!scrollRef.current) return
    const target = isToday(selectedDay)
      ? ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT - 120
      : 0
    scrollRef.current.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [selectedDay])

  useEffect(() => {
    async function loadRatings() {
      const { data } = await supabase
        .from('staff_reviews')
        .select('staff_id, rating')
        .eq('business_id', BUSINESS_ID)
        .eq('is_approved', true)
        .not('staff_id', 'is', null)
      if (!data) return
      const map: Record<string, { total: number; count: number }> = {}
      for (const r of data) {
        if (!r.staff_id) continue
        if (!map[r.staff_id]) map[r.staff_id] = { total: 0, count: 0 }
        map[r.staff_id].total += r.rating
        map[r.staff_id].count++
      }
      const result: Record<string, { avg: number; count: number }> = {}
      for (const [id, { total, count }] of Object.entries(map)) {
        result[id] = { avg: Math.round((total / count) * 10) / 10, count }
      }
      setRatings(result)
    }
    loadRatings()
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const dayStart = startOfDay(selectedDay).toISOString()
      const dayEnd = endOfDay(selectedDay).toISOString()

      const [staffRes, bookRes, svcRes, blockRes] = await Promise.all([
        supabase.from('staff').select('*').eq('business_id', BUSINESS_ID).order('name'),
        supabase
          .from('bookings')
          .select('*, service:services(name,category,price), staff:staff(name), customer:customers(name,email,phone)')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', dayStart)
          .lte('starts_at', dayEnd)
          .neq('status', 'cancelled'),
        supabase.from('services').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).order('name'),
        supabase
          .from('blocked_times')
          .select('id, staff_id, starts_at, ends_at, reason')
          .lt('starts_at', dayEnd)
          .gt('ends_at', dayStart),
      ])
      if (staffRes.data) setStaff(staffRes.data as Staff[])
      if (bookRes.data) setBookings(bookRes.data as RichBooking[])
      if (svcRes.data) setServices(svcRes.data as Service[])
      if (blockRes.data) setBlockedTimes(blockRes.data as BlockedTime[])
      setLoading(false)
    }
    load()
  }, [selectedDay])

  // Drag-to-resize
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

  function positionBlock(startsAt: string, endsAt: string) {
    const dayFloor = setMinutes(setHours(selectedDay, START_HOUR), 0)
    const dayCeil = setMinutes(setHours(selectedDay, END_HOUR), 0)
    const start = parseISO(startsAt)
    const end = parseISO(endsAt)
    const clampedStart = start < dayFloor ? dayFloor : start
    const clampedEnd = end > dayCeil ? dayCeil : end
    const top = (differenceInMinutes(clampedStart, dayFloor) / 60) * HOUR_HEIGHT
    const height = Math.max((differenceInMinutes(clampedEnd, clampedStart) / 60) * HOUR_HEIGHT, 20)
    return { top, height }
  }

  function openNewBooking(e: React.MouseEvent<HTMLDivElement>, staffId: string) {
    if ((e.target as HTMLElement).closest('[data-booking]')) return
    if (drag) return
    const member = staff.find(s => s.id === staffId)
    if (member?.on_holiday) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const minutesFromStart = (y / HOUR_HEIGHT) * 60
    const totalMinutes = START_HOUR * 60 + minutesFromStart
    const snapped = Math.round(totalMinutes / 60) * 60
    const h = Math.min(Math.floor(snapped / 60), END_HOUR - 1)
    const m = snapped % 60
    const startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    setNewBookingStaffId(staffId)
    setNbDate(format(selectedDay, 'yyyy-MM-dd'))
    setNbTime(startTime)
    setNbServiceId(services[0]?.id ?? '')
    setNbName(''); setNbEmail(''); setNbPhone(''); setNbNotes('')
    setNbError(''); setNbSuggestions([]); setNbShowSuggestions(false); setNbSelectedCustomerId(null)
  }

  function closeNewBooking() {
    setNewBookingStaffId(null)
    setNbSuggestions([]); setNbShowSuggestions(false); setNbSelectedCustomerId(null)
  }

  function openBlockTime() {
    setBtStaffId(staff[0]?.id ?? '')
    setBtDate(format(selectedDay, 'yyyy-MM-dd'))
    setBtStart('09:00')
    setBtEnd('10:00')
    setBtReason('Booked Time')
    setBtError('')
    setBtOpen(true)
  }

  async function handleCreateBlockTime() {
    if (!btStaffId || !btDate || !btStart || !btEnd) {
      setBtError('All fields are required.')
      return
    }
    if (btStart >= btEnd) {
      setBtError('End time must be after start time.')
      return
    }
    const startsAt = new Date(`${btDate}T${btStart}:00`)
    const endsAt = new Date(`${btDate}T${btEnd}:00`)
    setBtSaving(true)
    setBtError('')
    const { data, error } = await supabase
      .from('blocked_times')
      .insert({ staff_id: btStaffId, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), reason: btReason.trim() || 'Booked Time' })
      .select()
      .single()
    if (error) {
      setBtError(error.message)
    } else {
      setBlockedTimes(prev => [...prev, data as BlockedTime])
      setBtOpen(false)
    }
    setBtSaving(false)
  }

  async function handleDeleteBlock(blockId: string) {
    await supabase.from('blocked_times').delete().eq('id', blockId)
    setBlockedTimes(prev => prev.filter(bt => bt.id !== blockId))
    setSelectedBlock(null)
  }

  async function handleBookingAction(bookingId: string, status: 'completed' | 'cancelled') {
    if (status === 'cancelled' && !confirm('Cancel this booking?')) return
    setActionLoading(true)
    await supabase.from('bookings').update({ status }).eq('id', bookingId)
    if (status === 'cancelled') {
      setBookings(prev => prev.filter(b => b.id !== bookingId))
    } else {
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } as RichBooking : b))
    }
    setSelectedBooking(null)
    setActionLoading(false)
  }

  async function openEditMode() {
    if (!selectedBooking) return
    setEditMode(true)
    setEditNotes(selectedBooking.notes ?? '')
    setEditDiscountCode('')
    setEditDiscountError('')
    setEditDiscountApplied((selectedBooking.discount_amount ?? 0) > 0)
    setEditDiscountAmount(selectedBooking.discount_amount ?? 0)
    setEditTokenInfo(null)
    setEditTokenApplied(false)

    const email = selectedBooking.customer?.email
    if (email) {
      const [tokenRes, txRes] = await Promise.all([
        supabase.rpc('get_customer_token_balance', {
          p_email: email,
          p_business_id: BUSINESS_ID,
          p_category: selectedBooking.service?.category ?? null,
        }),
        supabase
          .from('membership_transactions')
          .select('id, membership_id')
          .eq('booking_id', selectedBooking.id)
          .eq('type', 'redeem')
          .maybeSingle(),
      ])
      if (tokenRes.data && tokenRes.data.length > 0) {
        const row = tokenRes.data[0] as { membership_id: string; plan_name: string; tokens_remaining: number }
        setEditTokenInfo({ membershipId: row.membership_id, planName: row.plan_name, tokens: row.tokens_remaining })
      }
      if (txRes.data) setEditTokenApplied(true)
    }
  }

  function closeDetail() {
    setSelectedBooking(null)
    setEditMode(false)
    setEditError('')
    setEditDiscountError('')
  }

  async function handleSaveEdit() {
    if (!selectedBooking) return
    setEditSaving(true)
    setEditError('')
    const { error } = await supabase
      .from('bookings')
      .update({ notes: editNotes.trim() || null })
      .eq('id', selectedBooking.id)
    if (error) {
      setEditError(error.message)
    } else {
      setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, notes: editNotes.trim() || null } : b))
      setSelectedBooking(prev => prev ? { ...prev, notes: editNotes.trim() || null } : null)
      setEditMode(false)
    }
    setEditSaving(false)
  }

  async function handleEditApplyToken(membershipId: string) {
    if (!selectedBooking) return
    setEditTokenLoading(true)
    const { error } = await supabase.rpc('redeem_token', {
      p_booking_id: selectedBooking.id,
      p_membership_id: membershipId,
    })
    if (!error) setEditTokenApplied(true)
    setEditTokenLoading(false)
  }

  async function handleEditRemoveToken() {
    if (!selectedBooking) return
    setEditTokenLoading(true)
    await supabase.rpc('refund_token_for_booking', { p_booking_id: selectedBooking.id })
    setEditTokenApplied(false)
    setEditTokenLoading(false)
  }

  async function handleEditApplyDiscount() {
    if (!selectedBooking || !editDiscountCode.trim()) return
    setEditDiscountApplying(true)
    setEditDiscountError('')
    const { data, error } = await supabase.rpc('apply_discount_to_booking', {
      p_booking_id: selectedBooking.id,
      p_code: editDiscountCode.trim(),
      p_business_id: BUSINESS_ID,
    })
    if (error) {
      setEditDiscountError(error.message)
    } else {
      const result = data as { discount_amount: number; code: string }
      setEditDiscountApplied(true)
      setEditDiscountAmount(result.discount_amount)
      setBookings(prev => prev.map(b =>
        b.id === selectedBooking.id ? { ...b, discount_amount: result.discount_amount } : b,
      ))
      setSelectedBooking(prev => prev ? { ...prev, discount_amount: result.discount_amount } : null)
    }
    setEditDiscountApplying(false)
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
            { business_id: BUSINESS_ID, name: nbName.trim(), email: nbEmail.trim().toLowerCase(), phone: nbPhone.trim() || null },
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
        .select('*, service:services(name,category,price), staff:staff(name), customer:customers(name,email,phone)')
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
  const todaySelected = isToday(selectedDay)
  const timeLineTop =
    todaySelected && now.getHours() >= START_HOUR && now.getHours() < END_HOUR
      ? ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT
      : null

  return (
    <div className={cn(drag && 'select-none')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
          <p className={cn('text-sm font-medium mt-0.5', todaySelected ? 'text-(--color-primary)' : 'text-gray-500')}>
            {todaySelected ? 'Today · ' : ''}{format(selectedDay, 'EEEE d MMMM yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={openBlockTime}>
            <Lock className="h-3.5 w-3.5" />
            Block Time
          </Button>
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedDay(d => subDays(d, 7))} className="p-2 rounded-lg hover:bg-gray-100" title="Previous week">
              <ChevronsLeft className="h-4 w-4 text-gray-500" />
            </button>
            <button onClick={() => setSelectedDay(d => subDays(d, 1))} className="p-2 rounded-lg hover:bg-gray-100" title="Previous day">
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
            <input
              type="date"
              value={format(selectedDay, 'yyyy-MM-dd')}
              onChange={e => { if (e.target.value) setSelectedDay(new Date(e.target.value + 'T12:00:00')) }}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white cursor-pointer hover:bg-gray-50 outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-(--color-primary)"
            />
            <button onClick={() => setSelectedDay(d => addDays(d, 1))} className="p-2 rounded-lg hover:bg-gray-100" title="Next day">
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
            <button onClick={() => setSelectedDay(d => addDays(d, 7))} className="p-2 rounded-lg hover:bg-gray-100" title="Next week">
              <ChevronsRight className="h-4 w-4 text-gray-500" />
            </button>
            {!todaySelected && (
              <button onClick={() => setSelectedDay(new Date())} className="ml-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 brand-card overflow-hidden overflow-x-auto">
        {/* Staff header row */}
        <div
          className="grid border-b border-gray-200"
          style={{ gridTemplateColumns: `56px repeat(${staff.length + 1}, minmax(140px, 1fr))` }}
        >
          <div className="border-r border-gray-100" />
          {staff.map(member => (
            <div
              key={member.id}
              className={cn('px-3 py-3 border-r border-gray-100 flex flex-col items-center gap-1.5', member.on_holiday ? 'bg-amber-50' : '')}
            >
              <div className="relative">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt={member.name} className={cn('h-10 w-10 rounded-full object-cover', member.on_holiday && 'opacity-60')} />
                ) : (
                  <div className={cn('h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold', member.on_holiday ? 'bg-amber-100 text-amber-500' : 'bg-gray-100 text-gray-500')}>
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {member.on_holiday && <span className="absolute -bottom-0.5 -right-0.5 text-sm leading-none">✈︎</span>}
              </div>
              <div className="text-center">
                <p className={cn('text-xs font-semibold truncate max-w-28', member.on_holiday ? 'text-amber-700' : 'text-gray-800')}>
                  {member.name}
                </p>
                <p className={cn('text-xs mt-0.5 capitalize', member.on_holiday ? 'text-amber-500 font-medium' : 'text-gray-400')}>
                  {member.on_holiday ? 'On Holiday' : member.role}
                </p>
                {!member.on_holiday && ratings[member.id] && (
                  <div className="flex items-center justify-center gap-0.5 mt-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-semibold text-gray-600">{ratings[member.id].avg}</span>
                    <span className="text-xs text-gray-400">({ratings[member.id].count})</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="px-3 py-3 flex flex-col items-center gap-1.5 bg-gray-50/60">
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-gray-500">Self-service</p>
              <p className="text-xs text-gray-400 mt-0.5">Unassigned</p>
            </div>
          </div>
        </div>

        {/* Time grid */}
        <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: `${HOUR_HEIGHT * (END_HOUR - START_HOUR)}px` }}>
          <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${staff.length + 1}, minmax(140px, 1fr))` }}>
            {/* Hour labels */}
            <div className="border-r border-gray-100">
              {hours.map(h => (
                <div key={h} className="text-right pr-2 text-xs text-gray-400 border-t border-gray-100 first:border-t-0" style={{ height: HOUR_HEIGHT }}>
                  <span className="relative -top-2">{format(setMinutes(setHours(new Date(), h), 0), 'HH:mm')}</span>
                </div>
              ))}
            </div>

            {/* Staff columns */}
            {staff.map(member => {
              const memberBlocks = blockedTimes.filter(bt => bt.staff_id === member.id)
              return (
                <div
                  key={member.id}
                  className={cn('relative border-r border-gray-100', member.on_holiday ? 'cursor-not-allowed' : 'cursor-crosshair')}
                  style={{ height: HOUR_HEIGHT * (END_HOUR - START_HOUR) }}
                  onClick={e => openNewBooking(e, member.id)}
                >
                  {hours.map(h => (
                    <div key={h} className="absolute w-full border-t border-gray-100" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
                  ))}

                  {member.on_holiday && (
                    <div
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5"
                      style={{ backgroundColor: 'rgba(254,243,199,0.55)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 14px, rgba(251,191,36,0.07) 14px, rgba(251,191,36,0.07) 28px)' }}
                    >
                      <span className="text-3xl leading-none">✈︎</span>
                      <p className="text-xs font-bold text-amber-700">On Holiday</p>
                      <p className="text-xs text-amber-500">No availability</p>
                    </div>
                  )}

                  {/* Blocked time chips — clickable to delete */}
                  {!member.on_holiday && memberBlocks.map(bt => {
                    const { top, height } = positionBlock(bt.starts_at, bt.ends_at)
                    return (
                      <div
                        key={bt.id}
                        data-booking="true"
                        onClick={e => { e.stopPropagation(); setSelectedBlock(bt) }}
                        className="absolute left-0.5 right-0.5 rounded overflow-hidden z-10 cursor-pointer group"
                        style={{ top, height, backgroundColor: 'rgba(254,243,199,0.85)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(251,191,36,0.18) 6px, rgba(251,191,36,0.18) 12px)', borderLeft: '3px solid #F59E0B' }}
                        title="Click to delete"
                      >
                        <p className="text-xs font-semibold text-amber-700 px-1.5 pt-1 truncate leading-tight">
                          {bt.reason ?? 'Booked Time'}
                        </p>
                        <p className="text-xs text-amber-600 px-1.5 truncate">
                          {format(parseISO(bt.starts_at), 'HH:mm')}–{format(parseISO(bt.ends_at), 'HH:mm')}
                        </p>
                      </div>
                    )
                  })}

                  {/* Bookings */}
                  {bookings.filter(b => b.staff_id === member.id).map(booking => {
                    const isDragging = drag?.bookingId === booking.id
                    const endsAt = isDragging ? drag.currentEndsAt : booking.ends_at
                    const { top, height } = positionBlock(booking.starts_at, endsAt)
                    const color = categoryColorMap[booking.service?.category] ?? '#7C3AED'
                    return (
                      <div
                        key={booking.id}
                        data-booking="true"
                        onClick={() => !isDragging && setSelectedBooking(booking)}
                        className={cn('absolute left-1 right-1 rounded-md px-2 py-1 overflow-hidden transition-shadow z-20 cursor-pointer', isDragging ? 'shadow-lg' : 'hover:brightness-95', booking.status === 'completed' && 'opacity-50')}
                        style={{ top, height, backgroundColor: `${color}22`, borderLeft: `3px solid ${color}` }}
                        title={`${booking.customer?.name} — ${booking.service?.name}`}
                      >
                        <p className="text-xs font-semibold truncate leading-tight" style={{ color }}>
                          {format(parseISO(booking.starts_at), 'HH:mm')} {booking.service?.name}
                        </p>
                        <p className="text-xs truncate text-gray-600">{booking.customer?.name}</p>
                        {isDragging && <p className="text-xs font-medium mt-0.5" style={{ color }}>→ {format(parseISO(endsAt), 'HH:mm')}</p>}
                        <div
                          data-booking="true"
                          className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize flex items-end justify-center pb-0.5"
                          onMouseDown={e => {
                            e.stopPropagation(); e.preventDefault()
                            setDrag({ bookingId: booking.id, startY: e.clientY, originalEndsAt: booking.ends_at, currentEndsAt: booking.ends_at })
                          }}
                        >
                          <div className="w-8 h-1 rounded-full opacity-40" style={{ backgroundColor: color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Unstaffed column */}
            <div className="relative border-gray-100 bg-gray-50/30" style={{ height: HOUR_HEIGHT * (END_HOUR - START_HOUR) }}>
              {hours.map(h => (
                <div key={h} className="absolute w-full border-t border-gray-100" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
              ))}
              {bookings.filter(b => b.staff_id === null).map(booking => {
                const { top, height } = positionBlock(booking.starts_at, booking.ends_at)
                const color = categoryColorMap[booking.service?.category] ?? '#7C3AED'
                return (
                  <div
                    key={booking.id}
                    data-booking="true"
                    onClick={() => setSelectedBooking(booking)}
                    className={cn('absolute left-1 right-1 rounded-md px-2 py-1 overflow-hidden cursor-pointer z-20', booking.status === 'completed' ? 'opacity-50' : 'hover:brightness-95')}
                    style={{ top, height, backgroundColor: `${color}22`, borderLeft: `3px solid ${color}` }}
                    title={`${booking.customer?.name} — ${booking.service?.name}`}
                  >
                    <p className="text-xs font-semibold truncate leading-tight" style={{ color }}>
                      {format(parseISO(booking.starts_at), 'HH:mm')} {booking.service?.name}
                    </p>
                    <p className="text-xs truncate text-gray-600">{booking.customer?.name}</p>
                    {(booking.spots_booked ?? 1) > 1 && <p className="text-xs text-gray-500">{booking.spots_booked} spots</p>}
                  </div>
                )
              })}
            </div>

            {/* Current time line */}
            {timeLineTop !== null && (
              <div className="absolute right-0 pointer-events-none z-30" style={{ top: timeLineTop, left: 56 }}>
                <div className="relative">
                  <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-(--color-primary) opacity-80" />
                  <div className="h-px w-full opacity-40" style={{ backgroundColor: 'var(--color-primary)' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── New Booking Modal ── */}
      <Modal open={!!newBookingStaffId} onClose={closeNewBooking} title="New Booking" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Staff member</p>
              <p className="text-sm text-gray-900 font-semibold">{staff.find(s => s.id === newBookingStaffId)?.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Service</label>
              <select value={nbServiceId} onChange={e => setNbServiceId(e.target.value)} className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded outline-none focus:ring-2 focus:ring-(--color-primary)">
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" value={nbDate} onChange={e => setNbDate(e.target.value)} required />
            <Input label="Start time" type="time" value={nbTime} onChange={e => setNbTime(e.target.value)} required />
          </div>
          {nbEndTime && <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">{selectedService?.duration_minutes} min · ends at {nbEndTime}</p>}
          <hr className="border-gray-100" />
          <div className="relative">
            <Input
              label="Customer name"
              value={nbName}
              onChange={e => { setNbName(e.target.value); setNbSelectedCustomerId(null); searchCustomers(e.target.value) }}
              onFocus={() => nbName.length >= 2 && setNbShowSuggestions(true)}
              onBlur={() => setTimeout(() => setNbShowSuggestions(false), 150)}
              required
              placeholder="Start typing a name…"
              autoComplete="off"
            />
            {nbShowSuggestions && nbSuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {nbSuggestions.map(c => (
                  <button key={c.id} type="button" className="w-full px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    onMouseDown={() => { setNbName(c.name); setNbEmail(c.email); setNbPhone(c.phone ?? ''); setNbSelectedCustomerId(c.id); setNbShowSuggestions(false) }}>
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input label="Email" type="email" value={nbEmail} onChange={e => setNbEmail(e.target.value)} required placeholder="jane@example.com" />
          <Input label="Phone" type="tel" value={nbPhone} onChange={e => setNbPhone(e.target.value)} placeholder="+44 7700 900000" />
          <Textarea label="Notes" value={nbNotes} onChange={e => setNbNotes(e.target.value)} placeholder="Optional notes…" />
          {nbError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{nbError}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={closeNewBooking}>Cancel</Button>
            <Button onClick={handleCreateBooking} loading={nbSaving}>Create Booking</Button>
          </div>
        </div>
      </Modal>

      {/* ── Block Time Modal ── */}
      <Modal open={btOpen} onClose={() => setBtOpen(false)} title="Block Time" size="sm">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Staff member</label>
            <select value={btStaffId} onChange={e => setBtStaffId(e.target.value)} className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)">
              {staff.filter(s => !s.on_holiday).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Input label="Date" type="date" value={btDate} onChange={e => setBtDate(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start time" type="time" value={btStart} onChange={e => setBtStart(e.target.value)} required />
            <Input label="End time" type="time" value={btEnd} onChange={e => setBtEnd(e.target.value)} required />
          </div>
          <Input label="Reason" value={btReason} onChange={e => setBtReason(e.target.value)} placeholder="Booked Time" />
          {btError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{btError}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setBtOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBlockTime} loading={btSaving}>Block Time</Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Block Confirmation ── */}
      <Modal open={!!selectedBlock} onClose={() => setSelectedBlock(null)} title="Remove Block" size="sm">
        {selectedBlock && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Remove <strong>{selectedBlock.reason ?? 'Booked Time'}</strong> ({format(parseISO(selectedBlock.starts_at), 'HH:mm')}–{format(parseISO(selectedBlock.ends_at), 'HH:mm')})?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setSelectedBlock(null)}>Keep It</Button>
              <Button variant="danger" onClick={() => handleDeleteBlock(selectedBlock.id)}>Remove</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Booking Detail / Edit Modal ── */}
      <Modal
        open={!!selectedBooking}
        onClose={closeDetail}
        title={selectedBooking ? `${format(parseISO(selectedBooking.starts_at), 'HH:mm')} – ${format(parseISO(selectedBooking.ends_at), 'HH:mm')}` : ''}
        size="sm"
      >
        {selectedBooking && !editMode && (
          <div className="space-y-4">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Service</dt>
                <dd className="font-medium text-gray-900">{selectedBooking.service?.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Customer</dt>
                <dd className="font-medium text-gray-900">{selectedBooking.customer?.name}</dd>
              </div>
              {selectedBooking.customer?.email && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Email</dt>
                  <dd className="text-gray-700 text-xs">{selectedBooking.customer.email}</dd>
                </div>
              )}
              {selectedBooking.staff && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Staff</dt>
                  <dd className="text-gray-700">{selectedBooking.staff.name}</dd>
                </div>
              )}
              {(selectedBooking.spots_booked ?? 1) > 1 && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Spots</dt>
                  <dd className="font-semibold text-gray-900">{selectedBooking.spots_booked}</dd>
                </div>
              )}
              {selectedBooking.notes && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0">Notes</dt>
                  <dd className="text-gray-700 text-right text-xs">{selectedBooking.notes}</dd>
                </div>
              )}
              {(selectedBooking.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between items-center">
                  <dt className="text-gray-500">Discount</dt>
                  <dd className="font-semibold text-green-700">−{formatCurrency(selectedBooking.discount_amount ?? 0)}</dd>
                </div>
              )}
              <div className="flex justify-between items-center">
                <dt className="text-gray-500">Status</dt>
                <dd><Badge variant={statusBadgeVariant(selectedBooking.status)} className="capitalize">{selectedBooking.status}</Badge></dd>
              </div>
            </dl>
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <Button variant="secondary" size="sm" onClick={openEditMode} className="shrink-0">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              {(selectedBooking.status === 'confirmed' || selectedBooking.status === 'pending') && (
                <>
                  <Button fullWidth variant="secondary" size="sm" loading={actionLoading} onClick={() => handleBookingAction(selectedBooking.id, 'completed')} className="text-green-700! border-green-200! hover:bg-green-50!">
                    <CheckCircle2 className="h-4 w-4" />
                    Complete
                  </Button>
                  <Button fullWidth variant="danger" size="sm" loading={actionLoading} onClick={() => handleBookingAction(selectedBooking.id, 'cancelled')}>
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {selectedBooking && editMode && (
          <div className="space-y-4">
            {/* Notes */}
            <Textarea label="Notes" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Add notes…" />

            {/* Membership token */}
            <div className="border border-gray-100 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <Ticket className="h-3.5 w-3.5" /> Membership Token
              </p>
              {editTokenApplied ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-green-700 font-medium">Token applied to this booking</span>
                  <button onClick={handleEditRemoveToken} disabled={editTokenLoading} className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
                    {editTokenLoading ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              ) : editTokenInfo ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{editTokenInfo.planName} · {editTokenInfo.tokens} session{editTokenInfo.tokens !== 1 ? 's' : ''} left</span>
                  <Button size="sm" loading={editTokenLoading} onClick={() => handleEditApplyToken(editTokenInfo.membershipId)}>
                    Apply Token
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-gray-400">No membership tokens available for this customer.</p>
              )}
            </div>

            {/* Discount code */}
            <div className="border border-gray-100 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" /> Discount Code
              </p>
              {editDiscountApplied ? (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span className="text-xs font-medium">Discount applied: −{formatCurrency(editDiscountAmount)}</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editDiscountCode}
                    onChange={e => { setEditDiscountCode(e.target.value.toUpperCase()); setEditDiscountError('') }}
                    placeholder="ENTER CODE"
                    className="flex-1 h-9 px-3 text-sm font-mono border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) uppercase"
                  />
                  <Button size="sm" loading={editDiscountApplying} onClick={handleEditApplyDiscount} disabled={!editDiscountCode.trim()}>
                    Apply
                  </Button>
                </div>
              )}
              {editDiscountError && <p className="text-xs text-red-600">{editDiscountError}</p>}
            </div>

            {editError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEditMode(false)} className="shrink-0">
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button fullWidth onClick={handleSaveEdit} loading={editSaving}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
