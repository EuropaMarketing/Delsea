import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format, addDays, subDays, addWeeks, subWeeks, addMonths, startOfDay, endOfDay, startOfWeek, endOfWeek,
  parseISO, differenceInMinutes, setHours, setMinutes, addMinutes, isToday, isSameDay, getDay, isPast,
} from 'date-fns'
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Star, Users, CheckCircle2, XCircle, Lock, Pencil, Ticket, Tag, Gift, X, CalendarPlus, CreditCard, History, UserCheck, ClipboardList,
  Clock, CalendarRange, Sparkles, Mail, Phone as PhoneIcon, CalendarClock,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadFormAlertSet, checkBookingForm, type BookingFormStatus } from '@/lib/formAlerts'
import { generateTimeSlots } from '@/lib/slots'
import { useAuthStore } from '@/store/authStore'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Input, Textarea } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/currency'
import type { Booking, Staff, Service, Customer, Resource, Availability } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string
const HOUR_HEIGHT = 60
const START_HOUR = 7
const END_HOUR = 21

const SERVICE_COLORS = [
  '#7C3AED', '#DB2777', '#0891B2', '#059669', '#D97706', '#DC2626',
]

type RichBooking = Omit<Booking, 'staff' | 'service' | 'customer' | 'price_override'> & {
  discount_amount: number
  payment_status: string
  deposit_charged: number
  checked_in_at: string | null
  price_override: number | null
  equipment_resource_id?: string | null
  service: { name: string; category: string; price: number }
  staff: { name: string } | null
  customer: { name: string; email: string; phone: string | null; sumup_card_token: string | null }
  resource: { name: string } | null
  equipment_resource?: { name: string } | null
}

function bookingPrice(b: { price_override?: number | null; service?: { price: number } | null }): number {
  return b.price_override ?? b.service?.price ?? 0
}

const MAX_RECURRENCE_OCCURRENCES = 52

function computeOccurrenceDates(
  start: Date,
  repeat: 'none' | 'daily' | 'weekly' | 'monthly',
  interval: number,
  endType: 'count' | 'until',
  count: number,
  until: Date | null,
): Date[] {
  if (repeat === 'none') return [start]
  const step = (d: Date) =>
    repeat === 'daily' ? addDays(d, interval) : repeat === 'weekly' ? addWeeks(d, interval) : addMonths(d, interval)
  const dates: Date[] = [start]
  let next = step(start)
  while (dates.length < MAX_RECURRENCE_OCCURRENCES) {
    if (endType === 'count' && dates.length >= Math.max(count, 1)) break
    if (endType === 'until' && until && next > until) break
    dates.push(next)
    next = step(next)
  }
  return dates
}

type BlockedTime = {
  id: string
  staff_id: string
  starts_at: string
  ends_at: string
  reason: string | null
  is_shift_adjustment: boolean
}

type ActivityLogEntry = {
  id: string
  actor_type: string
  actor_name: string
  action: string
  summary: string
  reason: string | null
  created_at: string
}

interface DragState {
  bookingId: string
  startY: number
  originalEndsAt: string
  currentEndsAt: string
}

type BookingAddon = {
  addon_id: string
  price: number
  service_addon: { name: string; duration_minutes: number } | null
}

type AvailableAddon = {
  id: string
  service_id: string
  name: string
  duration_minutes: number
  price: number
}

type SessionRow = {
  id: string
  service_id: string
  event_date: string
  start_time: string
  staff_id: string | null
  max_capacity_override: number | null
  service: { name: string; category: string; max_capacity: number | null; duration_minutes: number } | null
}

type Attendee = {
  id: string
  spots_booked: number
  customer: { name: string; email: string } | null
}

type CustomerBookingHistory = {
  id: string
  starts_at: string
  status: string
  service: { name: string } | null
}

type CustomerFormHistory = {
  id: string
  completed_at: string
  expires_at: string
  form: { title: string } | null
}

type CustomerMembershipHistory = {
  id: string
  tokens_remaining: number
  plan: { name: string } | null
}

export default function AdminCalendar() {
  const navigate = useNavigate()
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day')
  const [bookings, setBookings] = useState<RichBooking[]>([])
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [ratings, setRatings] = useState<Record<string, { avg: number; count: number }>>({})
  const [availability, setAvailability] = useState<Availability[]>([])
  const authStaffId = useAuthStore(s => s.staffId)

  // Staff view filter + roster panel
  const [staffFilter, setStaffFilter] = useState<'all' | 'mine' | string>('all')
  const [rosterOpen, setRosterOpen] = useState(false)

  // Shift adjustment popover
  const [shiftAdjustFor, setShiftAdjustFor] = useState<Staff | null>(null)
  const [shiftStart, setShiftStart] = useState('')
  const [shiftEnd, setShiftEnd] = useState('')
  const [shiftReason, setShiftReason] = useState('')
  const [shiftSaving, setShiftSaving] = useState(false)
  const [shiftError, setShiftError] = useState('')

  // Session attendee modal (open group-session slots)
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null)
  const [sessionAttendees, setSessionAttendees] = useState<Attendee[]>([])
  const [sessionAttendeesLoading, setSessionAttendeesLoading] = useState(false)
  const [sessionCancelOpen, setSessionCancelOpen] = useState(false)
  const [sessionCanceling, setSessionCanceling] = useState(false)

  // New booking modal
  const [nbModalOpen, setNbModalOpen] = useState(false)
  const [nbBookingMode, setNbBookingMode] = useState<'customer' | 'open'>('customer')
  const [nbStaffId, setNbStaffId] = useState<string | null>(null)
  const [nbServiceId, setNbServiceId] = useState('')
  const [nbDate, setNbDate] = useState('')
  const [nbTime, setNbTime] = useState('')
  const [nbName, setNbName] = useState('')
  const [nbEmail, setNbEmail] = useState('')
  const [nbPhone, setNbPhone] = useState('')
  const [nbNotes, setNbNotes] = useState('')
  const [nbPrice, setNbPrice] = useState('')
  const [nbPriceTouched, setNbPriceTouched] = useState(false)
  const [nbSaving, setNbSaving] = useState(false)
  const [nbError, setNbError] = useState('')
  const [nbSuggestions, setNbSuggestions] = useState<Customer[]>([])
  const [nbShowSuggestions, setNbShowSuggestions] = useState(false)
  const [nbSelectedCustomerId, setNbSelectedCustomerId] = useState<string | null>(null)
  // Group-session spots + live capacity readout
  const [nbSpotsBooked, setNbSpotsBooked] = useState(1)
  const [nbSlotCapacity, setNbSlotCapacity] = useState<{ taken: number; max: number } | null>(null)
  // Repeat (Outlook-style recurrence)
  const [nbRepeat, setNbRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none')
  const [nbRepeatInterval, setNbRepeatInterval] = useState(1)
  const [nbRepeatEndType, setNbRepeatEndType] = useState<'count' | 'until'>('count')
  const [nbRepeatCount, setNbRepeatCount] = useState(8)
  const [nbRepeatUntil, setNbRepeatUntil] = useState('')
  const [nbSkippedDates, setNbSkippedDates] = useState<string[]>([])

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
  const [detailCapacity, setDetailCapacity] = useState<{ taken: number; max: number } | null>(null)
  const [detailAddons, setDetailAddons] = useState<BookingAddon[]>([])
  const [customerBookings, setCustomerBookings] = useState<CustomerBookingHistory[]>([])
  const [customerForms, setCustomerForms] = useState<CustomerFormHistory[]>([])
  const [customerMemberships, setCustomerMemberships] = useState<CustomerMembershipHistory[]>([])
  const [customerSidebarLoading, setCustomerSidebarLoading] = useState(false)

  // Linked follow-on service booking (e.g. pressotherapy before/after)
  const [linkedBookings, setLinkedBookings] = useState<Array<{ id: string; starts_at: string; ends_at: string; service: { name: string } | null }>>([])
  const [addLinkedOpen, setAddLinkedOpen] = useState(false)
  const [addLinkedServiceId, setAddLinkedServiceId] = useState('')
  const [addLinkedStaffId, setAddLinkedStaffId] = useState<string | null>(null)
  const [addLinkedPosition, setAddLinkedPosition] = useState<'before' | 'after'>('after')
  const [addLinkedChecking, setAddLinkedChecking] = useState(false)
  const [addLinkedChecked, setAddLinkedChecked] = useState(false)
  const [addLinkedAvailable, setAddLinkedAvailable] = useState<{ startsAt: Date; endsAt: Date } | null>(null)
  const [addLinkedSaving, setAddLinkedSaving] = useState(false)
  const [addLinkedError, setAddLinkedError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [cancelReasonOpen, setCancelReasonOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [activityLogOpen, setActivityLogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [formAlerts, setFormAlerts] = useState<Set<string>>(new Set())
  const [selectedBookingForm, setSelectedBookingForm] = useState<BookingFormStatus | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  // Customer / service / staff / date-time / price — full detail edit
  const [editCustomerId, setEditCustomerId] = useState<string | null>(null)
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editCustomerEmail, setEditCustomerEmail] = useState('')
  const [editCustomerPhone, setEditCustomerPhone] = useState('')
  const [editCustomerSuggestions, setEditCustomerSuggestions] = useState<Customer[]>([])
  const [editCustomerShowSuggestions, setEditCustomerShowSuggestions] = useState(false)
  const [editServiceId, setEditServiceId] = useState('')
  const [editStaffId, setEditStaffId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editPriceTouched, setEditPriceTouched] = useState(false)
  const [editSpotsBooked, setEditSpotsBooked] = useState(1)
  const [editSlotCapacity, setEditSlotCapacity] = useState<{ taken: number; max: number } | null>(null)
  const [cancelScope, setCancelScope] = useState<'one' | 'series'>('one')
  // Add-ons in edit mode
  const [availableAddons, setAvailableAddons] = useState<AvailableAddon[]>([])
  const [editAddonIds, setEditAddonIds] = useState<Set<string>>(new Set())
  const [originalAddonIds, setOriginalAddonIds] = useState<Set<string>>(new Set())
  // Token state in edit mode
  const [editTokenInfo, setEditTokenInfo] = useState<{ membershipId: string; planName: string; tokens: number } | null>(null)
  const [editTokenApplied, setEditTokenApplied] = useState(false)
  const [editTokenLoading, setEditTokenLoading] = useState(false)
  // Resource state in edit mode
  const [editResourceId, setEditResourceId] = useState<string | null>(null)
  const [editEquipmentResourceId, setEditEquipmentResourceId] = useState<string | null>(null)
  const [equipmentResources, setEquipmentResources] = useState<Resource[]>([])

  // Gift voucher state in edit mode
  const [editVoucherCode, setEditVoucherCode] = useState('')
  const [editVoucherApplying, setEditVoucherApplying] = useState(false)
  const [editVoucherRemoving, setEditVoucherRemoving] = useState(false)
  const [editVoucherApplied, setEditVoucherApplied] = useState(false)
  const [editVoucherAmount, setEditVoucherAmount] = useState(0)
  const [editVoucherError, setEditVoucherError] = useState('')

  // Discount state in edit mode
  const [editDiscountCode, setEditDiscountCode] = useState('')
  const [editDiscountApplying, setEditDiscountApplying] = useState(false)
  const [editDiscountError, setEditDiscountError] = useState('')
  const [editDiscountApplied, setEditDiscountApplied] = useState(false)
  const [editDiscountAmount, setEditDiscountAmount] = useState(0)

  // Charge balance (saved card)
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeType, setChargeType] = useState<'balance' | 'noshow'>('balance')
  const [charging, setCharging] = useState(false)
  const [chargeError, setChargeError] = useState('')
  const [chargeSuccess, setChargeSuccess] = useState(false)

  // Cell click popover (new booking vs block time)
  const [cellPopover, setCellPopover] = useState<{ staffId: string | null; date: Date; time: string; pageX: number; pageY: number; keepUnassigned: boolean } | null>(null)

  // Resize drag
  const [drag, setDrag] = useState<DragState | null>(null)

  // Move drag (native HTML5 drag-and-drop, reposition to a different time/staff/day)
  const [draggingBookingId, setDraggingBookingId] = useState<string | null>(null)

  // Hover preview card for a booking block
  const [hoverBooking, setHoverBooking] = useState<RichBooking | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })

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
  }, [selectedDay, viewMode])

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
    supabase.from('availability').select('*').then(({ data }) => {
      if (data) setAvailability(data as Availability[])
    })
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const rangeStart = viewMode === 'week' ? startOfWeek(selectedDay, { weekStartsOn: 1 }) : startOfDay(selectedDay)
      const rangeEnd = viewMode === 'week' ? endOfWeek(selectedDay, { weekStartsOn: 1 }) : endOfDay(selectedDay)
      const dayStart = rangeStart.toISOString()
      const dayEnd = rangeEnd.toISOString()

      const [staffRes, bookRes, svcRes, blockRes, resRes, equipRes, sessRes, hiddenRes] = await Promise.all([
        supabase.from('staff').select('*').eq('business_id', BUSINESS_ID).order('name'),
        supabase
          .from('bookings')
          .select('*, service:services(name,category,price), staff:staff(name), customer:customers(name,email,phone,sumup_card_token), resource:resources!resource_id(name)')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', dayStart)
          .lte('starts_at', dayEnd)
          .neq('status', 'cancelled'),
        supabase.from('services').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).eq('hide_from_main_calendar', false).order('name'),
        supabase
          .from('blocked_times')
          .select('id, staff_id, starts_at, ends_at, reason, is_shift_adjustment')
          .lt('starts_at', dayEnd)
          .gt('ends_at', dayStart),
        supabase.from('resources').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).eq('resource_type', 'room').order('name'),
          supabase.from('resources').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).eq('resource_type', 'equipment').order('name'),
        supabase
          .from('service_sessions')
          .select('id, service_id, event_date, start_time, staff_id, max_capacity_override, service:services(name,category,max_capacity,duration_minutes)')
          .eq('business_id', BUSINESS_ID)
          .eq('is_active', true)
          .not('event_date', 'is', null)
          .gte('event_date', format(rangeStart, 'yyyy-MM-dd'))
          .lte('event_date', format(rangeEnd, 'yyyy-MM-dd')),
        // Services with their own dedicated calendar (e.g. Contrast Room) are excluded here entirely
        supabase.from('services').select('id').eq('business_id', BUSINESS_ID).eq('hide_from_main_calendar', true),
      ])
      const hiddenIds = new Set((hiddenRes.data ?? []).map(r => r.id))
      if (staffRes.data) setStaff(staffRes.data as Staff[])
      if (bookRes.data) {
        const bks = (bookRes.data as RichBooking[]).filter(b => !hiddenIds.has(b.service_id))
        setBookings(bks)
        loadFormAlertSet(BUSINESS_ID, bks as Array<{ id: string; service_id: string; customer_id: string }>).then(setFormAlerts)
      }
      if (svcRes.data) setServices(svcRes.data as Service[])
      if (blockRes.data) setBlockedTimes(blockRes.data as BlockedTime[])
      if (resRes.data) setResources(resRes.data as Resource[])
      if (equipRes.data) setEquipmentResources(equipRes.data as Resource[])
      if (sessRes.data) setSessions((sessRes.data as unknown as SessionRow[]).filter(s => !hiddenIds.has(s.service_id)))
      setLoading(false)
    }
    load()
  }, [selectedDay, viewMode])

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

  // Live capacity readout in the New Booking modal, for group-session services.
  useEffect(() => {
    if (!nbModalOpen || !nbServiceId || !nbDate || !nbTime) { setNbSlotCapacity(null); return }
    const startsAt = new Date(`${nbDate}T${nbTime}:00`).toISOString()
    let cancelled = false
    fetchSlotCapacity(nbServiceId, startsAt).then(cap => { if (!cancelled) setNbSlotCapacity(cap) })
    return () => { cancelled = true }
  }, [nbModalOpen, nbServiceId, nbDate, nbTime])

  // Live capacity readout in the edit form, for group-session services (excluding this booking's own spots).
  useEffect(() => {
    if (!editMode || !selectedBooking || !editServiceId || !editDate || !editTime) { setEditSlotCapacity(null); return }
    const startsAt = new Date(`${editDate}T${editTime}:00`).toISOString()
    let cancelled = false
    fetchSlotCapacity(editServiceId, startsAt, selectedBooking.id).then(cap => { if (!cancelled) setEditSlotCapacity(cap) })
    return () => { cancelled = true }
  }, [editMode, selectedBooking, editServiceId, editDate, editTime])

  // Available add-ons for the edit form, staff-qualification-aware (same RPC the customer booking flow uses).
  useEffect(() => {
    if (!editMode || !editServiceId) { setAvailableAddons([]); return }
    let cancelled = false
    supabase
      .rpc('get_available_addons', { p_service_id: editServiceId, p_staff_id: editStaffId })
      .then(({ data }) => { if (!cancelled) setAvailableAddons((data ?? []) as AvailableAddon[]) })
    return () => { cancelled = true }
  }, [editMode, editServiceId, editStaffId])

  const categoryColorMap = useMemo(() => {
    const cats = [...new Set(bookings.map(b => b.service?.category))]
    return Object.fromEntries(cats.map((c, i) => [c, SERVICE_COLORS[i % SERVICE_COLORS.length]]))
  }, [bookings])

  // Aggregate capacity per group-session slot (service_id + starts_at) for the "X/Y" badge on calendar blocks.
  const slotCapacityMap = useMemo(() => {
    const map = new Map<string, { taken: number; max: number }>()
    for (const b of bookings) {
      const service = services.find(s => s.id === b.service_id)
      if (!service?.is_group_session) continue
      const key = `${b.service_id}|${b.starts_at}`
      const spots = b.spots_booked ?? 1
      const existing = map.get(key)
      if (existing) existing.taken += spots
      else map.set(key, { taken: spots, max: service.max_capacity ?? 8 })
    }
    return map
  }, [bookings, services])

  // Attendee capacity for open group-session slots — always has an entry per session,
  // even with zero bookings so far, unlike slotCapacityMap above.
  const sessionCapacityMap = useMemo(() => {
    const map = new Map<string, { taken: number; max: number }>()
    for (const session of sessions) {
      const startsAt = new Date(`${session.event_date}T${session.start_time}`).toISOString()
      const taken = bookings
        .filter(b => b.service_id === session.service_id && b.starts_at === startsAt)
        .reduce((sum, b) => sum + (b.spots_booked ?? 1), 0)
      const max = session.max_capacity_override ?? session.service?.max_capacity ?? 8
      map.set(session.id, { taken, max })
    }
    return map
  }, [sessions, bookings])

  function positionBlock(startsAt: string, endsAt: string, refDay: Date = selectedDay) {
    const dayFloor = setMinutes(setHours(refDay, START_HOUR), 0)
    const dayCeil = setMinutes(setHours(refDay, END_HOUR), 0)
    const start = parseISO(startsAt)
    const end = parseISO(endsAt)
    const clampedStart = start < dayFloor ? dayFloor : start
    const clampedEnd = end > dayCeil ? dayCeil : end
    const top = (differenceInMinutes(clampedStart, dayFloor) / 60) * HOUR_HEIGHT
    const height = Math.max((differenceInMinutes(clampedEnd, clampedStart) / 60) * HOUR_HEIGHT, 20)
    return { top, height }
  }

  // Packs same-day overlapping bookings into side-by-side sub-columns (week view, which
  // has no staff-column split, so two staff members' bookings can land at the same time).
  function packOverlaps(items: RichBooking[]): Array<RichBooking & { col: number; cols: number }> {
    const sorted = [...items].sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime())
    const colEndTimes: number[] = []
    const placed: Array<RichBooking & { col: number }> = []
    for (const item of sorted) {
      const start = parseISO(item.starts_at).getTime()
      const end = parseISO(item.ends_at).getTime()
      let col = colEndTimes.findIndex(t => t <= start)
      if (col === -1) { col = colEndTimes.length; colEndTimes.push(end) } else { colEndTimes[col] = end }
      placed.push({ ...item, col })
    }
    const cols = Math.max(colEndTimes.length, 1)
    return placed.map(p => ({ ...p, cols }))
  }

  // Slot capacity for a group-session service; excludeBookingId lets an in-progress
  // edit compute "how many spots are taken by OTHER bookings" for validation.
  async function fetchSlotCapacity(serviceId: string, startsAtISO: string, excludeBookingId?: string): Promise<{ taken: number; max: number } | null> {
    const service = services.find(s => s.id === serviceId)
    if (!service?.is_group_session) return null
    const { data } = await supabase
      .from('bookings')
      .select('id, spots_booked')
      .eq('service_id', serviceId)
      .eq('starts_at', startsAtISO)
      .neq('status', 'cancelled')
    const taken = (data ?? [])
      .filter(b => b.id !== excludeBookingId)
      .reduce((sum, b) => sum + (b.spots_booked ?? 1), 0)
    return { taken, max: service.max_capacity ?? 8 }
  }

  async function fetchBookingAddons(bookingId: string): Promise<BookingAddon[]> {
    const { data } = await supabase
      .from('booking_addons')
      .select('addon_id, price, service_addon:service_addons(name, duration_minutes)')
      .eq('booking_id', bookingId)
    return (data ?? []) as unknown as BookingAddon[]
  }

  function sessionStartsAt(session: SessionRow): string {
    return new Date(`${session.event_date}T${session.start_time}`).toISOString()
  }

  async function openSessionDetail(session: SessionRow) {
    setSelectedSession(session)
    setSessionCancelOpen(false)
    setSessionAttendeesLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select('id, spots_booked, customer:customers(name,email)')
      .eq('service_id', session.service_id)
      .eq('starts_at', sessionStartsAt(session))
      .neq('status', 'cancelled')
    setSessionAttendees((data as unknown as Attendee[]) ?? [])
    setSessionAttendeesLoading(false)
  }

  async function openAttendeeBooking(attendeeId: string) {
    const { data } = await supabase
      .from('bookings')
      .select('*, service:services(name,category,price), staff:staff(name), customer:customers(name,email,phone,sumup_card_token), resource:resources!resource_id(name)')
      .eq('id', attendeeId)
      .single()
    if (data) {
      setSelectedSession(null)
      openBookingDetail(data as RichBooking)
    }
  }

  async function handleCancelSession(reason: string) {
    if (!selectedSession || !reason.trim()) return
    setSessionCanceling(true)
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancellation_reason: reason.trim() })
      .eq('service_id', selectedSession.service_id)
      .eq('starts_at', sessionStartsAt(selectedSession))
      .neq('status', 'cancelled')
    await supabase.from('service_sessions').update({ is_active: false }).eq('id', selectedSession.id)
    setSessions(prev => prev.filter(s => s.id !== selectedSession.id))
    setSelectedSession(null)
    setSessionCancelOpen(false)
    setSessionCanceling(false)
  }

  // A staff member's effective working window for a given day: their normal weekly
  // availability, narrowed by any is_shift_adjustment blocks (e.g. an early finish)
  // for that specific day — without ever touching the underlying availability row.
  function getStaffDayStatus(member: Staff, day: Date):
    | { kind: 'holiday' }
    | { kind: 'not_scheduled' }
    | { kind: 'scheduled'; start: string; end: string; adjusted: boolean } {
    if (member.on_holiday) return { kind: 'holiday' }
    const dow = getDay(day)
    const avail = availability.find(a => a.staff_id === member.id && a.day_of_week === dow)
    if (!avail) return { kind: 'not_scheduled' }
    let start = avail.start_time.slice(0, 5)
    let end = avail.end_time.slice(0, 5)
    let adjusted = false
    const dayStr = format(day, 'yyyy-MM-dd')
    for (const bt of blockedTimes) {
      if (bt.staff_id !== member.id || !bt.is_shift_adjustment) continue
      if (format(parseISO(bt.starts_at), 'yyyy-MM-dd') !== dayStr) continue
      const btStart = format(parseISO(bt.starts_at), 'HH:mm')
      const btEnd = format(parseISO(bt.ends_at), 'HH:mm')
      if (btStart <= start) { start = btEnd; adjusted = true }
      if (btEnd >= end) { end = btStart; adjusted = true }
    }
    return { kind: 'scheduled', start, end, adjusted }
  }

  function timeToTop(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number)
    const raw = (h - START_HOUR) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT
    return Math.max(0, Math.min(raw, HOUR_HEIGHT * (END_HOUR - START_HOUR)))
  }

  function openShiftAdjust(member: Staff) {
    const status = getStaffDayStatus(member, selectedDay)
    if (status.kind !== 'scheduled') return
    setShiftAdjustFor(member)
    setShiftStart(status.start)
    setShiftEnd(status.end)
    setShiftReason('')
    setShiftError('')
  }

  async function handleSaveShiftAdjust() {
    if (!shiftAdjustFor) return
    const status = getStaffDayStatus(shiftAdjustFor, selectedDay)
    if (status.kind !== 'scheduled') return
    const dow = getDay(selectedDay)
    const avail = availability.find(a => a.staff_id === shiftAdjustFor.id && a.day_of_week === dow)
    if (!avail) return
    const originalStart = avail.start_time.slice(0, 5)
    const originalEnd = avail.end_time.slice(0, 5)
    if (shiftStart >= shiftEnd) { setShiftError('Start must be before finish.'); return }
    if (shiftStart < originalStart || shiftEnd > originalEnd) {
      setShiftError(`Adjusted hours must fall within their normal shift (${originalStart}–${originalEnd}).`)
      return
    }
    const rows: Array<{ staff_id: string; starts_at: string; ends_at: string; reason: string | null; is_shift_adjustment: boolean }> = []
    const dayStr = format(selectedDay, 'yyyy-MM-dd')
    if (shiftStart > originalStart) {
      rows.push({
        staff_id: shiftAdjustFor.id,
        starts_at: new Date(`${dayStr}T${originalStart}:00`).toISOString(),
        ends_at: new Date(`${dayStr}T${shiftStart}:00`).toISOString(),
        reason: shiftReason.trim() || 'Shift adjusted', is_shift_adjustment: true,
      })
    }
    if (shiftEnd < originalEnd) {
      rows.push({
        staff_id: shiftAdjustFor.id,
        starts_at: new Date(`${dayStr}T${shiftEnd}:00`).toISOString(),
        ends_at: new Date(`${dayStr}T${originalEnd}:00`).toISOString(),
        reason: shiftReason.trim() || 'Shift adjusted', is_shift_adjustment: true,
      })
    }
    if (rows.length === 0) { setShiftError('No change to save.'); return }
    setShiftSaving(true)
    setShiftError('')
    const { data, error } = await supabase
      .from('blocked_times')
      .insert(rows)
      .select('id, staff_id, starts_at, ends_at, reason, is_shift_adjustment')
    if (error) {
      setShiftError(error.message)
    } else {
      setBlockedTimes(prev => [...prev, ...(data as BlockedTime[])])
      setShiftAdjustFor(null)
    }
    setShiftSaving(false)
  }

  function timeFromPointerY(e: React.MouseEvent | React.DragEvent, el: HTMLElement) {
    const rect = el.getBoundingClientRect()
    const y = e.clientY - rect.top
    const totalMinutes = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60
    const snapped = Math.round(totalMinutes / 15) * 15
    const h = Math.min(Math.floor(snapped / 60), END_HOUR - 1)
    const m = snapped % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, bookingId: string) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', bookingId)
    setDraggingBookingId(bookingId)
    setHoverBooking(null)
  }

  function handleBookingHover(e: React.MouseEvent<HTMLDivElement>, booking: RichBooking) {
    if (drag || draggingBookingId) return
    setHoverBooking(booking)
    setHoverPos({ x: e.clientX, y: e.clientY })
  }

  function clearBookingHover() {
    setHoverBooking(null)
  }

  // targetStaffId: pass explicitly (including null for "unassigned") in day view to reassign staff;
  // omit it in week view so the booking's existing staff stays unchanged (week columns are days, not staff).
  async function handleDropBooking(e: React.DragEvent<HTMLDivElement>, targetDate: Date, targetStaffId?: string | null) {
    e.preventDefault()
    const bookingId = draggingBookingId ?? e.dataTransfer.getData('text/plain')
    setDraggingBookingId(null)
    const booking = bookings.find(b => b.id === bookingId)
    if (!booking) return
    const newStaffId = targetStaffId === undefined ? booking.staff_id : targetStaffId
    const targetMember = newStaffId ? staff.find(s => s.id === newStaffId) : null
    if (targetMember?.on_holiday) return

    const durationMinutes = differenceInMinutes(parseISO(booking.ends_at), parseISO(booking.starts_at))
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const totalMinutes = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60
    const snapped = Math.round(totalMinutes / 15) * 15
    const maxStart = Math.max(END_HOUR * 60 - durationMinutes, START_HOUR * 60)
    const clamped = Math.min(Math.max(snapped, START_HOUR * 60), maxStart)
    const h = Math.floor(clamped / 60), m = clamped % 60
    const newStart = setMinutes(setHours(startOfDay(targetDate), h), m)
    const newEnd = addMinutes(newStart, durationMinutes)

    if (newStart.toISOString() === booking.starts_at && newStaffId === booking.staff_id) return

    const { error } = await supabase
      .from('bookings')
      .update({ starts_at: newStart.toISOString(), ends_at: newEnd.toISOString(), staff_id: newStaffId })
      .eq('id', booking.id)
    if (!error) {
      const staffObj = newStaffId ? staff.find(s => s.id === newStaffId) : null
      setBookings(prev => prev.map(b => b.id === booking.id
        ? { ...b, starts_at: newStart.toISOString(), ends_at: newEnd.toISOString(), staff_id: newStaffId, staff: staffObj ? { name: staffObj.name } : null }
        : b,
      ))
    }
  }

  function handleCellClick(e: React.MouseEvent<HTMLDivElement>, staffId: string | null, date: Date, keepUnassigned = false) {
    if ((e.target as HTMLElement).closest('[data-booking]')) return
    if (drag) return
    const member = staffId ? staff.find(s => s.id === staffId) : null
    if (member?.on_holiday) return
    const time = timeFromPointerY(e, e.currentTarget)
    setCellPopover({ staffId, date, time, pageX: e.clientX, pageY: e.clientY, keepUnassigned })
  }

  function openNewBookingFromPopover() {
    if (!cellPopover) return
    setNbBookingMode('customer')
    setNbStaffId(cellPopover.staffId ?? (cellPopover.keepUnassigned ? null : staff.find(s => !s.on_holiday)?.id ?? null))
    setNbDate(format(cellPopover.date, 'yyyy-MM-dd'))
    setNbTime(cellPopover.time)
    setNbServiceId(services[0]?.id ?? '')
    setNbName(''); setNbEmail(''); setNbPhone(''); setNbNotes('')
    setNbPrice(services[0] ? (services[0].price / 100).toFixed(2) : '')
    setNbPriceTouched(false)
    setNbSpotsBooked(1)
    setNbSlotCapacity(null)
    setNbRepeat('none'); setNbRepeatInterval(1); setNbRepeatEndType('count'); setNbRepeatCount(8); setNbRepeatUntil('')
    setNbSkippedDates([])
    setNbError(''); setNbSuggestions([]); setNbShowSuggestions(false); setNbSelectedCustomerId(null)
    setNbModalOpen(true)
    setCellPopover(null)
  }

  function openBlockTimeFromPopover() {
    if (!cellPopover) return
    const endTime = format(addMinutes(new Date(`2000-01-01T${cellPopover.time}:00`), 60), 'HH:mm')
    setBtStaffId(cellPopover.staffId ?? staff.find(s => !s.on_holiday)?.id ?? '')
    setBtDate(format(cellPopover.date, 'yyyy-MM-dd'))
    setBtStart(cellPopover.time)
    setBtEnd(endTime)
    setBtReason('Booked Time')
    setBtError('')
    setBtOpen(true)
    setCellPopover(null)
  }

  function closeNewBooking() {
    setNbModalOpen(false)
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

  async function handleBookingAction(bookingId: string, status: 'completed') {
    setActionLoading(true)
    await supabase.from('bookings').update({ status }).eq('id', bookingId)
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } as RichBooking : b))
    setSelectedBooking(null)
    setActionLoading(false)
  }

  async function handleCheckIn(bookingId: string) {
    setActionLoading(true)
    const checkedInAt = new Date().toISOString()
    await supabase.from('bookings').update({ checked_in_at: checkedInAt }).eq('id', bookingId)
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, checked_in_at: checkedInAt } as RichBooking : b))
    setSelectedBooking(prev => prev ? { ...prev, checked_in_at: checkedInAt } : prev)
    setActionLoading(false)
  }

  async function handleUnmarkCheckIn(bookingId: string) {
    setActionLoading(true)
    await supabase.from('bookings').update({ checked_in_at: null }).eq('id', bookingId)
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, checked_in_at: null } as RichBooking : b))
    setSelectedBooking(prev => prev ? { ...prev, checked_in_at: null } : prev)
    await refreshActivityLog(bookingId)
    setActionLoading(false)
  }


  async function refreshEditTokenInfo(email: string | undefined, category: string | undefined, bookingId: string, checkExistingRedemption: boolean) {
    setEditTokenInfo(null)
    setEditTokenApplied(false)
    if (!email) return
    const [tokenRes, txRes] = await Promise.all([
      supabase.rpc('get_customer_token_balance', {
        p_email: email,
        p_business_id: BUSINESS_ID,
        p_category: category ?? null,
      }),
      checkExistingRedemption
        ? supabase
          .from('membership_transactions')
          .select('id, membership_id')
          .eq('booking_id', bookingId)
          .eq('type', 'redeem')
          .maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    if (tokenRes.data && tokenRes.data.length > 0) {
      const row = tokenRes.data[0] as { membership_id: string; plan_name: string; tokens_remaining: number }
      setEditTokenInfo({ membershipId: row.membership_id, planName: row.plan_name, tokens: row.tokens_remaining })
    }
    if (txRes.data) setEditTokenApplied(true)
  }

  async function openEditMode() {
    if (!selectedBooking) return
    setEditMode(true)
    setEditError('')
    setEditNotes(selectedBooking.notes ?? '')
    setEditResourceId(selectedBooking.resource_id ?? null)
    setEditEquipmentResourceId(selectedBooking.equipment_resource_id ?? null)
    setEditVoucherCode('')
    setEditVoucherError('')
    setEditVoucherApplied((selectedBooking.gift_voucher_amount ?? 0) > 0)
    setEditVoucherAmount(selectedBooking.gift_voucher_amount ?? 0)
    setEditDiscountCode('')
    setEditDiscountError('')
    setEditDiscountApplied((selectedBooking.discount_amount ?? 0) > 0)
    setEditDiscountAmount(selectedBooking.discount_amount ?? 0)

    setEditCustomerId(selectedBooking.customer_id)
    setEditCustomerName(selectedBooking.customer?.name ?? '')
    setEditCustomerEmail(selectedBooking.customer?.email ?? '')
    setEditCustomerPhone(selectedBooking.customer?.phone ?? '')
    setEditCustomerSuggestions([]); setEditCustomerShowSuggestions(false)
    setEditServiceId(selectedBooking.service_id)
    setEditStaffId(selectedBooking.staff_id)
    setEditDate(format(parseISO(selectedBooking.starts_at), 'yyyy-MM-dd'))
    setEditTime(format(parseISO(selectedBooking.starts_at), 'HH:mm'))
    setEditPrice((bookingPrice(selectedBooking) / 100).toFixed(2))
    setEditPriceTouched(false)
    setEditSpotsBooked(selectedBooking.spots_booked ?? 1)
    setEditSlotCapacity(null)

    const currentAddons = await fetchBookingAddons(selectedBooking.id)
    const currentIds = new Set(currentAddons.map(a => a.addon_id))
    setEditAddonIds(currentIds)
    setOriginalAddonIds(currentIds)

    await refreshEditTokenInfo(selectedBooking.customer?.email, selectedBooking.service?.category, selectedBooking.id, true)
  }

  async function editSearchCustomers(query: string) {
    if (query.length < 2) { setEditCustomerSuggestions([]); setEditCustomerShowSuggestions(false); return }
    const { data } = await supabase
      .from('customers')
      .select('id, name, email, phone, business_id, user_id, created_at')
      .eq('business_id', BUSINESS_ID)
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(8)
    if (data) { setEditCustomerSuggestions(data as Customer[]); setEditCustomerShowSuggestions(true) }
  }

  function selectEditCustomer(c: Customer) {
    setEditCustomerId(c.id)
    setEditCustomerName(c.name)
    setEditCustomerEmail(c.email)
    setEditCustomerPhone(c.phone ?? '')
    setEditCustomerShowSuggestions(false)
    if (selectedBooking) {
      refreshEditTokenInfo(c.email, editService?.category, selectedBooking.id, false)
    }
  }

  function closeDetail() {
    setSelectedBooking(null)
    setEditMode(false)
    setEditError('')
    setEditDiscountError('')
  }

  async function refreshActivityLog(bookingId: string) {
    const { data } = await supabase
      .from('booking_activity_log')
      .select('id, actor_type, actor_name, action, summary, reason, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
    if (data) setActivityLog(data as ActivityLogEntry[])
  }

  async function fetchCustomerSidebar(customerId: string, excludeBookingId: string) {
    setCustomerSidebarLoading(true)
    const [bkRes, formRes, memRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, starts_at, status, service:services(name)')
        .eq('customer_id', customerId)
        .neq('id', excludeBookingId)
        .order('starts_at', { ascending: false })
        .limit(8),
      supabase
        .from('form_responses')
        .select('id, completed_at, expires_at, form:service_forms(title)')
        .eq('customer_id', customerId)
        .order('completed_at', { ascending: false })
        .limit(8),
      supabase
        .from('customer_memberships')
        .select('id, tokens_remaining, plan:membership_plans(name)')
        .eq('customer_id', customerId)
        .order('purchased_at', { ascending: false }),
    ])
    setCustomerBookings((bkRes.data ?? []) as unknown as CustomerBookingHistory[])
    setCustomerForms((formRes.data ?? []) as unknown as CustomerFormHistory[])
    setCustomerMemberships((memRes.data ?? []) as unknown as CustomerMembershipHistory[])
    setCustomerSidebarLoading(false)
  }

  async function fetchLinkedBookings(comboGroupId: string, excludeBookingId: string) {
    const { data } = await supabase
      .from('bookings')
      .select('id, starts_at, ends_at, service:services(name)')
      .eq('combo_group_id', comboGroupId)
      .neq('id', excludeBookingId)
      .neq('status', 'cancelled')
    setLinkedBookings((data ?? []) as unknown as Array<{ id: string; starts_at: string; ends_at: string; service: { name: string } | null }>)
  }

  function openBookingDetail(b: RichBooking) {
    setHoverBooking(null)
    setSelectedBooking(b)
    setSelectedBookingForm(null)
    const remaining = bookingPrice(b) - (b.discount_amount ?? 0) - (b.gift_voucher_amount ?? 0) - (b.deposit_charged ?? 0)
    setChargeAmount(remaining > 0 ? (remaining / 100).toFixed(2) : '')
    setChargeType('balance')
    setChargeError('')
    setChargeSuccess(false)
    setCancelReasonOpen(false)
    setCancelReason('')
    setCancelScope('one')
    setActivityLog([])
    setActivityLogOpen(false)
    refreshActivityLog(b.id)
    checkBookingForm(b.service_id, b.customer_id).then(setSelectedBookingForm)
    setDetailCapacity(null)
    fetchSlotCapacity(b.service_id, b.starts_at).then(setDetailCapacity)
    setDetailAddons([])
    fetchBookingAddons(b.id).then(setDetailAddons)
    setCustomerBookings([]); setCustomerForms([]); setCustomerMemberships([])
    fetchCustomerSidebar(b.customer_id, b.id)
    setLinkedBookings([])
    if (b.combo_group_id) fetchLinkedBookings(b.combo_group_id, b.id)
    setAddLinkedOpen(false)
    setAddLinkedError('')
  }

  function openAddLinkedService() {
    setAddLinkedOpen(true)
    setAddLinkedServiceId('')
    setAddLinkedStaffId(null)
    setAddLinkedPosition('after')
    setAddLinkedChecked(false)
    setAddLinkedAvailable(null)
    setAddLinkedError('')
  }

  function checkLinkedAvailability(serviceId: string, position: 'before' | 'after', staffId: string | null) {
    if (!selectedBooking || !serviceId) return
    const svc = services.find(s => s.id === serviceId)
    if (!svc) return
    setAddLinkedChecking(true)
    setAddLinkedChecked(false)
    setAddLinkedAvailable(null)

    const anchorStart = parseISO(selectedBooking.starts_at)
    const anchorEnd = parseISO(selectedBooking.ends_at)
    const day = anchorStart
    const candidateStart = position === 'after' ? anchorEnd : addMinutes(anchorStart, -svc.duration_minutes)
    const candidateEnd = addMinutes(candidateStart, svc.duration_minutes)
    const candidateLabel = format(candidateStart, 'HH:mm')

    const dayBookings = bookings.filter(b => isSameDay(parseISO(b.starts_at), day) && b.id !== selectedBooking.id) as unknown as Booking[]
    const dayBlocks = blockedTimes.filter(bt => isSameDay(parseISO(bt.starts_at), day) && !bt.is_shift_adjustment)
    const relevantAvailability = staffId ? availability.filter(a => a.staff_id === staffId) : availability
    const slots = generateTimeSlots(day, relevantAvailability, svc.duration_minutes, dayBookings, dayBlocks, svc.pre_buffer_minutes, svc.post_buffer_minutes)

    setAddLinkedChecking(false)
    setAddLinkedChecked(true)
    setAddLinkedAvailable(slots.includes(candidateLabel) ? { startsAt: candidateStart, endsAt: candidateEnd } : null)
  }

  async function handleAddLinkedService() {
    if (!selectedBooking || !addLinkedAvailable) return
    setAddLinkedSaving(true)
    setAddLinkedError('')
    const { data: blocked } = await supabase.rpc('is_contact_blocked', {
      p_business_id: BUSINESS_ID,
      p_email: selectedBooking.customer?.email ?? null,
      p_phone: selectedBooking.customer?.phone ?? null,
    })
    if (blocked) {
      setAddLinkedError('This client is blocked and cannot be booked.')
      setAddLinkedSaving(false)
      return
    }
    const comboGroupId = selectedBooking.combo_group_id ?? crypto.randomUUID()
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        business_id: BUSINESS_ID,
        customer_id: selectedBooking.customer_id,
        staff_id: addLinkedStaffId,
        service_id: addLinkedServiceId,
        starts_at: addLinkedAvailable.startsAt.toISOString(),
        ends_at: addLinkedAvailable.endsAt.toISOString(),
        status: 'confirmed',
        notes: `Linked ${addLinkedPosition} ${selectedBooking.service?.name ?? 'booking'}`,
        combo_group_id: comboGroupId,
      })
      .select('id, starts_at, ends_at, service:services(name,category,price), staff:staff(name), customer:customers(name,email,phone,sumup_card_token)')
      .single()
    if (error) {
      setAddLinkedError(error.message)
      setAddLinkedSaving(false)
      return
    }
    if (!selectedBooking.combo_group_id) {
      await supabase.from('bookings').update({ combo_group_id: comboGroupId }).eq('id', selectedBooking.id)
      setSelectedBooking(prev => prev ? { ...prev, combo_group_id: comboGroupId } : null)
      setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, combo_group_id: comboGroupId } : b))
    }
    const rangeStart = viewMode === 'week' ? startOfWeek(selectedDay, { weekStartsOn: 1 }) : startOfDay(selectedDay)
    const rangeEnd = viewMode === 'week' ? endOfWeek(selectedDay, { weekStartsOn: 1 }) : endOfDay(selectedDay)
    const newBooking = data as unknown as RichBooking
    const t = parseISO(newBooking.starts_at)
    if (t >= rangeStart && t <= rangeEnd) setBookings(prev => [...prev, newBooking])
    setLinkedBookings(prev => [...prev, { id: newBooking.id, starts_at: newBooking.starts_at, ends_at: newBooking.ends_at, service: newBooking.service }])
    setAddLinkedOpen(false)
    setAddLinkedSaving(false)
  }

  async function handleCancelWithReason(bookingId: string) {
    if (!cancelReason.trim()) return
    setActionLoading(true)
    const booking = selectedBooking
    if (cancelScope === 'series' && booking && booking.recurrence_id) {
      const { data } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', cancellation_reason: cancelReason.trim() })
        .eq('recurrence_id', booking.recurrence_id)
        .gte('starts_at', booking.starts_at)
        .neq('status', 'cancelled')
        .select('id')
      const cancelledIds = new Set((data ?? []).map(r => r.id))
      setBookings(prev => prev.filter(b => !cancelledIds.has(b.id)))
    } else {
      await supabase.from('bookings').update({ status: 'cancelled', cancellation_reason: cancelReason.trim() }).eq('id', bookingId)
      setBookings(prev => prev.filter(b => b.id !== bookingId))
    }
    setSelectedBooking(null)
    setCancelReasonOpen(false)
    setCancelReason('')
    setActionLoading(false)
  }

  async function handleChargeBalance(bookingId: string) {
    const amountPence = Math.round(parseFloat(chargeAmount) * 100)
    if (!amountPence || amountPence <= 0) { setChargeError('Enter a valid amount'); return }
    setCharging(true)
    setChargeError('')
    setChargeSuccess(false)
    const { data, error } = await supabase.functions.invoke('sumup-charge-balance', {
      body: { booking_id: bookingId, amount: amountPence, type: chargeType },
    })
    if (error || !data?.success) {
      setChargeError((data as { error?: string } | null)?.error ?? error?.message ?? 'Charge failed')
    } else {
      setChargeSuccess(true)
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, payment_status: 'paid_in_full' } : b))
      setSelectedBooking(prev => prev ? { ...prev, payment_status: 'paid_in_full' } : prev)
      await refreshActivityLog(bookingId)
    }
    setCharging(false)
  }

  async function handleSaveEdit() {
    if (!selectedBooking) return
    if (!editCustomerId) { setEditError('Select a customer.'); return }
    const newService = services.find(s => s.id === editServiceId)
    if (!newService) { setEditError('Select a service.'); return }
    if (!editDate || !editTime) { setEditError('Date and time are required.'); return }
    if (newService.is_group_session) {
      const startsAtISO = new Date(`${editDate}T${editTime}:00`).toISOString()
      const cap = await fetchSlotCapacity(editServiceId, startsAtISO, selectedBooking.id)
      if (cap && cap.taken + editSpotsBooked > cap.max) {
        setEditError(`Not enough spots available. Only ${Math.max(cap.max - cap.taken, 0)} spot(s) remaining.`)
        return
      }
    }
    setEditSaving(true)
    setEditError('')
    const matchedResource = resources.find((r) => r.id === editResourceId) ?? null
    const matchedEquipment = equipmentResources.find((r) => r.id === editEquipmentResourceId) ?? null
    const matchedStaff = editStaffId ? staff.find(s => s.id === editStaffId) ?? null : null
    const selectedAddons = availableAddons.filter(a => editAddonIds.has(a.id))
    const addonExtraDuration = selectedAddons.reduce((sum, a) => sum + a.duration_minutes, 0)
    const startsAt = new Date(`${editDate}T${editTime}:00`)
    const endsAt = addMinutes(startsAt, newService.duration_minutes + addonExtraDuration)
    const enteredPrice = editPrice.trim() ? Math.round(parseFloat(editPrice) * 100) : newService.price
    const priceOverride = Number.isFinite(enteredPrice) && enteredPrice !== newService.price ? enteredPrice : null

    const { error } = await supabase
      .from('bookings')
      .update({
        customer_id: editCustomerId,
        service_id: editServiceId,
        staff_id: editStaffId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        price_override: priceOverride,
        notes: editNotes.trim() || null,
        resource_id: editResourceId,
        equipment_resource_id: editEquipmentResourceId,
        spots_booked: newService.is_group_session ? editSpotsBooked : 1,
      })
      .eq('id', selectedBooking.id)
    if (error) {
      setEditError(error.message)
    } else {
      const resourceObj = matchedResource ? { name: matchedResource.name } : null
      const equipmentObj = matchedEquipment ? { name: matchedEquipment.name } : null
      const customerObj = {
        name: editCustomerName,
        email: editCustomerEmail,
        phone: editCustomerPhone || null,
        sumup_card_token: editCustomerId === selectedBooking.customer_id ? selectedBooking.customer?.sumup_card_token ?? null : null,
      }
      const serviceObj = { name: newService.name, category: newService.category, price: newService.price }
      const staffObj = matchedStaff ? { name: matchedStaff.name } : null
      const patch = {
        customer_id: editCustomerId,
        customer: customerObj,
        service_id: editServiceId,
        service: serviceObj,
        staff_id: editStaffId,
        staff: staffObj,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        price_override: priceOverride,
        notes: editNotes.trim() || null,
        resource_id: editResourceId,
        resource: resourceObj,
        equipment_resource_id: editEquipmentResourceId,
        equipment_resource: equipmentObj,
        spots_booked: newService.is_group_session ? editSpotsBooked : 1,
      }
      setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, ...patch } : b))
      setSelectedBooking(prev => prev ? { ...prev, ...patch } : null)

      const addonsToAdd = [...editAddonIds].filter(id => !originalAddonIds.has(id))
      const addonsToRemove = [...originalAddonIds].filter(id => !editAddonIds.has(id))
      if (addonsToAdd.length) {
        await supabase.from('booking_addons').insert(
          addonsToAdd.map(addonId => ({
            booking_id: selectedBooking.id,
            addon_id: addonId,
            price: availableAddons.find(a => a.id === addonId)?.price ?? 0,
          })),
        )
      }
      if (addonsToRemove.length) {
        await supabase.from('booking_addons').delete().eq('booking_id', selectedBooking.id).in('addon_id', addonsToRemove)
      }
      fetchBookingAddons(selectedBooking.id).then(setDetailAddons)

      await refreshActivityLog(selectedBooking.id)
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

  async function handleEditApplyVoucher() {
    if (!selectedBooking || !editVoucherCode.trim()) return
    setEditVoucherApplying(true)
    setEditVoucherError('')
    const { data, error } = await supabase.rpc('apply_gift_voucher_to_booking', {
      p_booking_id: selectedBooking.id,
      p_code: editVoucherCode.trim(),
      p_business_id: BUSINESS_ID,
    })
    if (error) {
      setEditVoucherError(error.message)
    } else {
      const result = data as { voucher_amount: number }
      setEditVoucherApplied(true)
      setEditVoucherAmount(result.voucher_amount)
      setBookings((prev) => prev.map((b) =>
        b.id === selectedBooking.id ? { ...b, gift_voucher_amount: result.voucher_amount } : b,
      ))
      setSelectedBooking((prev) => prev ? { ...prev, gift_voucher_amount: result.voucher_amount } : null)
    }
    setEditVoucherApplying(false)
  }

  async function handleEditRemoveVoucher() {
    if (!selectedBooking) return
    setEditVoucherRemoving(true)
    await supabase.rpc('remove_gift_voucher_from_booking', { p_booking_id: selectedBooking.id })
    setEditVoucherApplied(false)
    setEditVoucherAmount(0)
    setEditVoucherCode('')
    setBookings((prev) => prev.map((b) =>
      b.id === selectedBooking.id ? { ...b, gift_voucher_amount: 0, gift_voucher_id: null } : b,
    ))
    setSelectedBooking((prev) => prev ? { ...prev, gift_voucher_amount: 0, gift_voucher_id: null } : null)
    setEditVoucherRemoving(false)
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

  async function handleCreateOpenSessions() {
    if (!nbServiceId || !nbDate || !nbTime) { setNbError('Service, date and time are required.'); return }
    const service = services.find(s => s.id === nbServiceId)
    if (!service) return
    if (!service.is_group_session) { setNbError('Only group-session services can have open slots.'); return }
    const baseStartsAt = new Date(`${nbDate}T${nbTime}:00`)
    const occurrenceDates = computeOccurrenceDates(
      baseStartsAt,
      nbRepeat,
      nbRepeatInterval,
      nbRepeatEndType,
      nbRepeatCount,
      nbRepeatEndType === 'until' && nbRepeatUntil ? new Date(`${nbRepeatUntil}T23:59:59`) : null,
    )
    setNbSaving(true)
    setNbError('')
    try {
      const rows = occurrenceDates.map(d => ({
        business_id: BUSINESS_ID,
        service_id: nbServiceId,
        event_date: format(d, 'yyyy-MM-dd'),
        start_time: nbTime,
        staff_id: nbStaffId,
        max_capacity_override: nbSpotsBooked,
        resource_id: null,
      }))
      const { data, error } = await supabase
        .from('service_sessions')
        .insert(rows)
        .select('id, service_id, event_date, start_time, staff_id, max_capacity_override, service:services(name,category,max_capacity,duration_minutes)')
      if (error) throw error
      const rangeStart = viewMode === 'week' ? startOfWeek(selectedDay, { weekStartsOn: 1 }) : startOfDay(selectedDay)
      const rangeEnd = viewMode === 'week' ? endOfWeek(selectedDay, { weekStartsOn: 1 }) : endOfDay(selectedDay)
      const created = (data ?? []) as unknown as SessionRow[]
      const inView = created.filter(s => {
        const d = parseISO(s.event_date)
        return d >= rangeStart && d <= rangeEnd
      })
      if (inView.length) setSessions(prev => [...prev, ...inView])
      closeNewBooking()
    } catch (err: unknown) {
      setNbError(err instanceof Error ? err.message : 'Failed to create sessions.')
    } finally {
      setNbSaving(false)
    }
  }

  async function handleCreateBooking() {
    if (nbBookingMode === 'open') { await handleCreateOpenSessions(); return }
    if (!nbServiceId || !nbName.trim() || !nbEmail.trim()) {
      setNbError('Name, email and service are required.')
      return
    }
    const service = services.find(s => s.id === nbServiceId)
    if (!service || !nbDate || !nbTime) return
    const baseStartsAt = new Date(`${nbDate}T${nbTime}:00`)
    const enteredPrice = nbPrice.trim() ? Math.round(parseFloat(nbPrice) * 100) : service.price
    const priceOverride = Number.isFinite(enteredPrice) && enteredPrice !== service.price ? enteredPrice : null
    const occurrenceDates = computeOccurrenceDates(
      baseStartsAt,
      nbRepeat,
      nbRepeatInterval,
      nbRepeatEndType,
      nbRepeatCount,
      nbRepeatEndType === 'until' && nbRepeatUntil ? new Date(`${nbRepeatUntil}T23:59:59`) : null,
    )
    setNbSaving(true)
    setNbError('')
    setNbSkippedDates([])
    try {
      const { data: blocked } = await supabase.rpc('is_contact_blocked', {
        p_business_id: BUSINESS_ID,
        p_email: nbEmail.trim().toLowerCase(),
        p_phone: nbPhone.trim() || null,
      })
      if (blocked) {
        setNbError('This client is blocked and cannot be booked. Unblock them first if this is a mistake.')
        setNbSaving(false)
        return
      }
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

      const rowsToInsert: Record<string, unknown>[] = []
      const skipped: string[] = []
      for (const occStart of occurrenceDates) {
        const occEnd = addMinutes(occStart, service.duration_minutes)
        if (service.is_group_session) {
          const cap = await fetchSlotCapacity(nbServiceId, occStart.toISOString())
          if (cap && cap.taken + nbSpotsBooked > cap.max) {
            skipped.push(format(occStart, 'EEE d MMM yyyy, HH:mm'))
            continue
          }
        }
        rowsToInsert.push({
          business_id: BUSINESS_ID,
          customer_id: customerId,
          staff_id: nbStaffId,
          service_id: nbServiceId,
          starts_at: occStart.toISOString(),
          ends_at: occEnd.toISOString(),
          status: 'confirmed',
          notes: nbNotes.trim() || null,
          price_override: priceOverride,
          spots_booked: service.is_group_session ? nbSpotsBooked : 1,
        })
      }

      if (rowsToInsert.length > 1) {
        const recurrenceId = crypto.randomUUID()
        rowsToInsert.forEach((row, i) => {
          row.recurrence_id = recurrenceId
          row.recurrence_index = i + 1
          row.recurrence_total = rowsToInsert.length
        })
      }

      if (rowsToInsert.length > 0) {
        const { data: created, error: bookErr } = await supabase
          .from('bookings')
          .insert(rowsToInsert)
          .select('*, service:services(name,category,price), staff:staff(name), customer:customers(name,email,phone,sumup_card_token)')
        if (bookErr) throw bookErr

        const rangeStart = viewMode === 'week' ? startOfWeek(selectedDay, { weekStartsOn: 1 }) : startOfDay(selectedDay)
        const rangeEnd = viewMode === 'week' ? endOfWeek(selectedDay, { weekStartsOn: 1 }) : endOfDay(selectedDay)
        const inView = (created as RichBooking[]).filter(b => {
          const t = parseISO(b.starts_at)
          return t >= rangeStart && t <= rangeEnd
        })
        if (inView.length) setBookings(prev => [...prev, ...inView])
      }

      if (skipped.length > 0) {
        setNbSkippedDates(skipped)
      } else {
        closeNewBooking()
      }
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
  const editService = services.find(s => s.id === editServiceId)

  if (loading) return <FullPageSpinner />

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const todaySelected = isToday(selectedDay)
  const timeLineTop =
    todaySelected && now.getHours() >= START_HOUR && now.getHours() < END_HOUR
      ? ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT
      : null
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(selectedDay, { weekStartsOn: 1 }), i))

  const resolvedStaffFilterId = staffFilter === 'all' ? null : staffFilter === 'mine' ? authStaffId : staffFilter
  const visibleStaff = resolvedStaffFilterId ? staff.filter(s => s.id === resolvedStaffFilterId) : staff

  return (
    <div className={cn(drag && 'select-none')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
          <p className={cn('text-sm font-medium mt-0.5', todaySelected ? 'text-(--color-primary)' : 'text-gray-500')}>
            {viewMode === 'week'
              ? `${format(weekDays[0], 'd MMM')} – ${format(weekDays[6], 'd MMM yyyy')}`
              : <>{todaySelected ? 'Today · ' : ''}{format(selectedDay, 'EEEE d MMMM yyyy')}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('day')}
              className={cn('px-3 py-1.5 text-sm font-medium rounded-md transition-colors', viewMode === 'day' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={cn('px-3 py-1.5 text-sm font-medium rounded-md transition-colors', viewMode === 'week' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}
            >
              Week
            </button>
          </div>
          <select
            value={staffFilter}
            onChange={e => setStaffFilter(e.target.value)}
            className="h-9 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
          >
            <option value="all">All staff</option>
            {authStaffId && staff.some(s => s.id === authStaffId) && <option value="mine">Just me</option>}
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button variant={rosterOpen ? 'primary' : 'secondary'} size="sm" onClick={() => setRosterOpen(o => !o)}>
            <CalendarRange className="h-3.5 w-3.5" />
            Roster
          </Button>
          <Button variant="secondary" size="sm" onClick={openBlockTime}>
            <Lock className="h-3.5 w-3.5" />
            Block Time
          </Button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedDay(d => viewMode === 'week' ? subWeeks(d, 4) : subDays(d, 7))}
              className="p-2 rounded-lg hover:bg-gray-100"
              title={viewMode === 'week' ? 'Back 4 weeks' : 'Previous week'}
            >
              <ChevronsLeft className="h-4 w-4 text-gray-500" />
            </button>
            <button
              onClick={() => setSelectedDay(d => viewMode === 'week' ? subWeeks(d, 1) : subDays(d, 1))}
              className="p-2 rounded-lg hover:bg-gray-100"
              title={viewMode === 'week' ? 'Previous week' : 'Previous day'}
            >
              <ChevronLeft className="h-4 w-4 text-gray-600" />
            </button>
            <input
              type="date"
              value={format(selectedDay, 'yyyy-MM-dd')}
              onChange={e => { if (e.target.value) setSelectedDay(new Date(e.target.value + 'T12:00:00')) }}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white cursor-pointer hover:bg-gray-50 outline-none focus:ring-2 focus:ring-(--color-primary) focus:border-(--color-primary)"
            />
            <button
              onClick={() => setSelectedDay(d => viewMode === 'week' ? addWeeks(d, 1) : addDays(d, 1))}
              className="p-2 rounded-lg hover:bg-gray-100"
              title={viewMode === 'week' ? 'Next week' : 'Next day'}
            >
              <ChevronRight className="h-4 w-4 text-gray-600" />
            </button>
            <button
              onClick={() => setSelectedDay(d => viewMode === 'week' ? addWeeks(d, 4) : addDays(d, 7))}
              className="p-2 rounded-lg hover:bg-gray-100"
              title={viewMode === 'week' ? 'Forward 4 weeks' : 'Next week'}
            >
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

      {rosterOpen && (
        <div className="bg-white border border-gray-200 brand-card overflow-hidden mb-5 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Roster · {format(selectedDay, 'EEEE d MMM')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map(member => {
              const status = getStaffDayStatus(member, selectedDay)
              return (
                <div key={member.id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                      {status.kind === 'holiday' && <p className="text-xs text-amber-600">On Holiday</p>}
                      {status.kind === 'not_scheduled' && <p className="text-xs text-gray-400">Not scheduled</p>}
                      {status.kind === 'scheduled' && (
                        <p className="text-xs text-gray-500">
                          {status.start}–{status.end}
                          {status.adjusted && <span className="text-(--color-primary) font-medium"> · adjusted</span>}
                        </p>
                      )}
                    </div>
                  </div>
                  {status.kind === 'scheduled' && (
                    <button
                      onClick={() => openShiftAdjust(member)}
                      title="Adjust shift for this day"
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0"
                    >
                      <Clock className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {viewMode === 'day' ? (
      <div className="bg-white border border-gray-200 brand-card overflow-hidden overflow-x-auto">
        {/* Staff header row */}
        <div
          className="grid border-b border-gray-200"
          style={{ gridTemplateColumns: `56px repeat(${visibleStaff.length + (resolvedStaffFilterId ? 0 : 1)}, minmax(140px, 1fr))` }}
        >
          <div className="border-r border-gray-100" />
          {visibleStaff.map(member => {
            const dayStatus = getStaffDayStatus(member, selectedDay)
            return (
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
                <button
                  type="button"
                  onClick={() => navigate(`/admin/staff?edit=${member.id}`)}
                  title="Open staff record"
                  className={cn('text-xs font-semibold truncate max-w-28 hover:underline', member.on_holiday ? 'text-amber-700' : 'text-gray-800')}
                >
                  {member.name}
                </button>
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
                {dayStatus.kind === 'scheduled' && (
                  <button
                    onClick={() => openShiftAdjust(member)}
                    title="Adjust shift for this day"
                    className={cn('flex items-center gap-1 mx-auto mt-1 text-xs hover:text-gray-700', dayStatus.adjusted ? 'text-(--color-primary) font-medium' : 'text-gray-400')}
                  >
                    <Clock className="h-3 w-3" />
                    {dayStatus.start}–{dayStatus.end}
                  </button>
                )}
              </div>
            </div>
            )
          })}
          {!resolvedStaffFilterId && (
          <div className="px-3 py-3 flex flex-col items-center gap-1.5 bg-gray-50/60">
            <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-gray-500">Self-service</p>
              <p className="text-xs text-gray-400 mt-0.5">Unassigned</p>
            </div>
          </div>
          )}
        </div>

        {/* Time grid */}
        <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: `${HOUR_HEIGHT * (END_HOUR - START_HOUR)}px` }}>
          <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${visibleStaff.length + (resolvedStaffFilterId ? 0 : 1)}, minmax(140px, 1fr))` }}>
            {/* Hour labels */}
            <div className="border-r border-gray-100">
              {hours.map(h => (
                <div key={h} className="text-right pr-2 text-xs text-gray-400 border-t border-gray-100 first:border-t-0" style={{ height: HOUR_HEIGHT }}>
                  <span className="relative -top-2">{format(setMinutes(setHours(new Date(), h), 0), 'HH:mm')}</span>
                </div>
              ))}
            </div>

            {/* Staff columns */}
            {visibleStaff.map(member => {
              const memberBlocks = blockedTimes.filter(bt => bt.staff_id === member.id && !bt.is_shift_adjustment)
              const dayStatus = getStaffDayStatus(member, selectedDay)
              return (
                <div
                  key={member.id}
                  className={cn('relative border-r border-gray-100', member.on_holiday ? 'cursor-not-allowed' : 'cursor-crosshair')}
                  style={{ height: HOUR_HEIGHT * (END_HOUR - START_HOUR) }}
                  onClick={e => handleCellClick(e, member.id, selectedDay)}
                  onDragOver={e => !member.on_holiday && e.preventDefault()}
                  onDrop={e => !member.on_holiday && handleDropBooking(e, selectedDay, member.id)}
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

                  {/* Shift-adjustment overlay — off-duty portions of an adjusted shift */}
                  {!member.on_holiday && dayStatus.kind === 'scheduled' && dayStatus.adjusted && (
                    <>
                      {timeToTop(dayStatus.start) > 0 && (
                        <div
                          className="absolute left-0 right-0 top-0 z-[5] flex items-end justify-center pb-1"
                          style={{ height: timeToTop(dayStatus.start), backgroundColor: 'rgba(229,231,235,0.5)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(107,114,128,0.08) 10px, rgba(107,114,128,0.08) 20px)' }}
                        >
                          <p className="text-xs text-gray-400 font-medium">Starts {dayStatus.start}</p>
                        </div>
                      )}
                      {timeToTop(dayStatus.end) < HOUR_HEIGHT * (END_HOUR - START_HOUR) && (
                        <div
                          className="absolute left-0 right-0 bottom-0 z-[5] flex items-start justify-center pt-1"
                          style={{ top: timeToTop(dayStatus.end), backgroundColor: 'rgba(229,231,235,0.5)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(107,114,128,0.08) 10px, rgba(107,114,128,0.08) 20px)' }}
                        >
                          <p className="text-xs text-gray-400 font-medium">Finished {dayStatus.end}</p>
                        </div>
                      )}
                    </>
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
                        draggable={!member.on_holiday}
                        onDragStart={e => { e.stopPropagation(); handleDragStart(e, booking.id) }}
                        onDragEnd={() => setDraggingBookingId(null)}
                        onClick={() => !isDragging && openBookingDetail(booking)}
                        onMouseEnter={e => handleBookingHover(e, booking)}
                        onMouseMove={e => handleBookingHover(e, booking)}
                        onMouseLeave={clearBookingHover}
                        className={cn('absolute left-1 right-1 rounded-md px-2 py-1 overflow-hidden transition-shadow z-20 cursor-pointer', isDragging ? 'shadow-lg' : 'hover:brightness-95', booking.status === 'completed' && 'opacity-50', draggingBookingId === booking.id && 'opacity-30')}
                        style={{ top, height, backgroundColor: `${color}22`, borderLeft: `3px solid ${color}` }}
                      >
                        <p className="text-xs font-semibold truncate leading-tight flex items-center gap-1" style={{ color }}>
                          {booking.checked_in_at && <UserCheck className="h-3 w-3 shrink-0" />}
                          {formAlerts.has(booking.id) && <ClipboardList className="h-3 w-3 shrink-0 text-amber-500" />}
                          {format(parseISO(booking.starts_at), 'HH:mm')} {booking.service?.name}
                        </p>
                        <p className="text-xs truncate text-gray-600">{booking.customer?.name}</p>
                        {slotCapacityMap.get(`${booking.service_id}|${booking.starts_at}`) && (
                          <p className="text-xs font-medium" style={{ color }}>
                            {slotCapacityMap.get(`${booking.service_id}|${booking.starts_at}`)!.taken}/{slotCapacityMap.get(`${booking.service_id}|${booking.starts_at}`)!.max} spots
                          </p>
                        )}
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

                  {/* Open group-session slots */}
                  {sessions.filter(s => s.staff_id === member.id).map(session => {
                    const start = new Date(`${session.event_date}T${session.start_time}`)
                    const end = addMinutes(start, session.service?.duration_minutes ?? 60)
                    const { top, height } = positionBlock(start.toISOString(), end.toISOString())
                    const cap = sessionCapacityMap.get(session.id)
                    const color = categoryColorMap[session.service?.category ?? ''] ?? '#7C3AED'
                    return (
                      <div
                        key={session.id}
                        data-booking="true"
                        onClick={() => openSessionDetail(session)}
                        className="absolute left-1 right-1 rounded-md px-2 py-1 overflow-hidden cursor-pointer z-20 border-2 border-dashed hover:brightness-95"
                        style={{ top, height, backgroundColor: `${color}11`, borderColor: color }}
                        title={`${session.service?.name} — open session`}
                      >
                        <p className="text-xs font-semibold truncate leading-tight" style={{ color }}>
                          {session.start_time.slice(0, 5)} {session.service?.name}
                        </p>
                        {cap && <p className="text-xs font-medium" style={{ color }}>{cap.taken}/{cap.max} booked</p>}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Unstaffed column */}
            {!resolvedStaffFilterId && (
            <div
              className="relative border-gray-100 bg-gray-50/30 cursor-crosshair"
              style={{ height: HOUR_HEIGHT * (END_HOUR - START_HOUR) }}
              onClick={e => handleCellClick(e, null, selectedDay, true)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDropBooking(e, selectedDay, null)}
            >
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
                    draggable
                    onDragStart={e => { e.stopPropagation(); handleDragStart(e, booking.id) }}
                    onDragEnd={() => setDraggingBookingId(null)}
                    onClick={() => openBookingDetail(booking)}
                    onMouseEnter={e => handleBookingHover(e, booking)}
                    onMouseMove={e => handleBookingHover(e, booking)}
                    onMouseLeave={clearBookingHover}
                    className={cn('absolute left-1 right-1 rounded-md px-2 py-1 overflow-hidden cursor-pointer z-20', booking.status === 'completed' ? 'opacity-50' : 'hover:brightness-95', draggingBookingId === booking.id && 'opacity-30')}
                    style={{ top, height, backgroundColor: `${color}22`, borderLeft: `3px solid ${color}` }}
                  >
                    <p className="text-xs font-semibold truncate leading-tight flex items-center gap-1" style={{ color }}>
                      {formAlerts.has(booking.id) && <ClipboardList className="h-3 w-3 shrink-0 text-amber-500" />}
                      {format(parseISO(booking.starts_at), 'HH:mm')} {booking.service?.name}
                    </p>
                    <p className="text-xs truncate text-gray-600">{booking.customer?.name}</p>
                    {(() => {
                      const cap = slotCapacityMap.get(`${booking.service_id}|${booking.starts_at}`)
                      return cap
                        ? <p className="text-xs font-medium" style={{ color }}>{cap.taken}/{cap.max} spots</p>
                        : (booking.spots_booked ?? 1) > 1 ? <p className="text-xs text-gray-500">{booking.spots_booked} spots</p> : null
                    })()}
                  </div>
                )
              })}
              {sessions.filter(s => s.staff_id === null).map(session => {
                const start = new Date(`${session.event_date}T${session.start_time}`)
                const end = addMinutes(start, session.service?.duration_minutes ?? 60)
                const { top, height } = positionBlock(start.toISOString(), end.toISOString())
                const cap = sessionCapacityMap.get(session.id)
                const color = categoryColorMap[session.service?.category ?? ''] ?? '#7C3AED'
                return (
                  <div
                    key={session.id}
                    data-booking="true"
                    onClick={() => openSessionDetail(session)}
                    className="absolute left-1 right-1 rounded-md px-2 py-1 overflow-hidden cursor-pointer z-20 border-2 border-dashed hover:brightness-95"
                    style={{ top, height, backgroundColor: `${color}11`, borderColor: color }}
                    title={`${session.service?.name} — open session`}
                  >
                    <p className="text-xs font-semibold truncate leading-tight" style={{ color }}>
                      {session.start_time.slice(0, 5)} {session.service?.name}
                    </p>
                    {cap && <p className="text-xs font-medium" style={{ color }}>{cap.taken}/{cap.max} booked</p>}
                  </div>
                )
              })}
            </div>
            )}

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
      ) : (
      <div className="bg-white border border-gray-200 brand-card overflow-hidden overflow-x-auto">
        {/* Day header row */}
        <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: `56px repeat(7, minmax(140px, 1fr))` }}>
          <div className="border-r border-gray-100" />
          {weekDays.map(day => (
            <div key={day.toISOString()} className={cn('px-3 py-3 border-r border-gray-100 text-center', isToday(day) && 'bg-(--color-primary)/5')}>
              <p className="text-xs text-gray-400 uppercase tracking-wide">{format(day, 'EEE')}</p>
              <p className={cn('text-sm font-semibold mt-0.5', isToday(day) ? 'text-(--color-primary)' : 'text-gray-800')}>{format(day, 'd MMM')}</p>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: `${HOUR_HEIGHT * (END_HOUR - START_HOUR)}px` }}>
          <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(7, minmax(140px, 1fr))` }}>
            {/* Hour labels */}
            <div className="border-r border-gray-100">
              {hours.map(h => (
                <div key={h} className="text-right pr-2 text-xs text-gray-400 border-t border-gray-100 first:border-t-0" style={{ height: HOUR_HEIGHT }}>
                  <span className="relative -top-2">{format(setMinutes(setHours(new Date(), h), 0), 'HH:mm')}</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map(day => {
              const dayKey = format(day, 'yyyy-MM-dd')
              const dayBookings = packOverlaps(bookings.filter(b => isSameDay(parseISO(b.starts_at), day) && (!resolvedStaffFilterId || b.staff_id === resolvedStaffFilterId)))
              const dayBlocks = blockedTimes.filter(bt => isSameDay(parseISO(bt.starts_at), day))
              const daySessions = sessions.filter(s => s.event_date === dayKey && (!resolvedStaffFilterId || s.staff_id === resolvedStaffFilterId))
              return (
                <div
                  key={day.toISOString()}
                  className="relative border-r border-gray-100 cursor-crosshair"
                  style={{ height: HOUR_HEIGHT * (END_HOUR - START_HOUR) }}
                  onClick={e => handleCellClick(e, null, day)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => handleDropBooking(e, day)}
                >
                  {hours.map(h => (
                    <div key={h} className="absolute w-full border-t border-gray-100" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
                  ))}

                  {dayBlocks.map(bt => {
                    const { top, height } = positionBlock(bt.starts_at, bt.ends_at, day)
                    return (
                      <div
                        key={bt.id}
                        data-booking="true"
                        onClick={e => { e.stopPropagation(); setSelectedBlock(bt) }}
                        className="absolute left-0.5 right-0.5 rounded overflow-hidden z-10 cursor-pointer"
                        style={{ top, height, backgroundColor: 'rgba(254,243,199,0.85)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(251,191,36,0.18) 6px, rgba(251,191,36,0.18) 12px)', borderLeft: '3px solid #F59E0B' }}
                        title="Click to delete"
                      >
                        <p className="text-xs font-semibold text-amber-700 px-1.5 pt-1 truncate leading-tight">{bt.reason ?? 'Booked Time'}</p>
                        <p className="text-xs text-amber-600 px-1.5 truncate">{format(parseISO(bt.starts_at), 'HH:mm')}–{format(parseISO(bt.ends_at), 'HH:mm')}</p>
                      </div>
                    )
                  })}

                  {dayBookings.map(booking => {
                    const { top, height } = positionBlock(booking.starts_at, booking.ends_at, day)
                    const color = categoryColorMap[booking.service?.category] ?? '#7C3AED'
                    const widthPct = 100 / booking.cols
                    return (
                      <div
                        key={booking.id}
                        data-booking="true"
                        draggable
                        onDragStart={e => { e.stopPropagation(); handleDragStart(e, booking.id) }}
                        onDragEnd={() => setDraggingBookingId(null)}
                        onClick={() => openBookingDetail(booking)}
                        onMouseEnter={e => handleBookingHover(e, booking)}
                        onMouseMove={e => handleBookingHover(e, booking)}
                        onMouseLeave={clearBookingHover}
                        className={cn('absolute rounded-md px-1.5 py-1 overflow-hidden cursor-pointer z-20', booking.status === 'completed' ? 'opacity-50' : 'hover:brightness-95', draggingBookingId === booking.id && 'opacity-30')}
                        style={{ top, height, left: `calc(${widthPct * booking.col}% + 2px)`, width: `calc(${widthPct}% - 4px)`, backgroundColor: `${color}22`, borderLeft: `3px solid ${color}` }}
                      >
                        <p className="text-xs font-semibold truncate leading-tight" style={{ color }}>
                          {format(parseISO(booking.starts_at), 'HH:mm')} {booking.service?.name}
                        </p>
                        <p className="text-xs truncate text-gray-600">{booking.customer?.name}</p>
                        <p className="text-xs truncate text-gray-400">{booking.staff?.name ?? 'Unassigned'}</p>
                        {slotCapacityMap.get(`${booking.service_id}|${booking.starts_at}`) && (
                          <p className="text-xs font-medium" style={{ color }}>
                            {slotCapacityMap.get(`${booking.service_id}|${booking.starts_at}`)!.taken}/{slotCapacityMap.get(`${booking.service_id}|${booking.starts_at}`)!.max} spots
                          </p>
                        )}
                      </div>
                    )
                  })}

                  {daySessions.map(session => {
                    const start = new Date(`${session.event_date}T${session.start_time}`)
                    const end = addMinutes(start, session.service?.duration_minutes ?? 60)
                    const { top, height } = positionBlock(start.toISOString(), end.toISOString(), day)
                    const cap = sessionCapacityMap.get(session.id)
                    const color = categoryColorMap[session.service?.category ?? ''] ?? '#7C3AED'
                    return (
                      <div
                        key={session.id}
                        data-booking="true"
                        onClick={() => openSessionDetail(session)}
                        className="absolute left-1 right-1 rounded-md px-1.5 py-1 overflow-hidden cursor-pointer z-20 border-2 border-dashed hover:brightness-95"
                        style={{ top, height, backgroundColor: `${color}11`, borderColor: color }}
                        title={`${session.service?.name} — open session`}
                      >
                        <p className="text-xs font-semibold truncate leading-tight" style={{ color }}>
                          {session.start_time.slice(0, 5)} {session.service?.name}
                        </p>
                        {cap && <p className="text-xs font-medium" style={{ color }}>{cap.taken}/{cap.max} booked</p>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      )}

      {/* ── Cell click popover: New Booking or Block Time ── */}
      {cellPopover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCellPopover(null)} />
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-44"
            style={{ top: cellPopover.pageY + 6, left: cellPopover.pageX }}
          >
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-100 mb-1">
              {format(cellPopover.date, 'EEE d MMM')} · {cellPopover.time}
              {cellPopover.staffId
                ? ` · ${staff.find(s => s.id === cellPopover.staffId)?.name ?? ''}`
                : cellPopover.keepUnassigned ? ' · Unassigned' : ''}
            </div>
            <button
              onClick={openNewBookingFromPopover}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
            >
              <CalendarPlus className="h-4 w-4 text-gray-400" />
              New Booking
            </button>
            {!cellPopover.keepUnassigned && (
              <button
                onClick={openBlockTimeFromPopover}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5 transition-colors"
              >
                <Lock className="h-4 w-4 text-gray-400" />
                Block Time
              </button>
            )}
          </div>
        </>
      )}

      {/* ── New Booking Modal ── */}
      <Modal open={nbModalOpen} onClose={closeNewBooking} title="New Booking" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Staff member</label>
              <select
                value={nbStaffId ?? ''}
                onChange={e => setNbStaffId(e.target.value || null)}
                className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded outline-none focus:ring-2 focus:ring-(--color-primary)"
              >
                <option value="">Unassigned</option>
                {staff.filter(s => !s.on_holiday).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Service</label>
              <select
                value={nbServiceId}
                onChange={e => {
                  const id = e.target.value
                  setNbServiceId(id)
                  const svc = services.find(s => s.id === id)
                  if (!svc?.is_group_session) setNbBookingMode('customer')
                  if (!nbPriceTouched && svc) setNbPrice((svc.price / 100).toFixed(2))
                }}
                className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded outline-none focus:ring-2 focus:ring-(--color-primary)"
              >
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {selectedService?.is_group_session && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              <button type="button" onClick={() => setNbBookingMode('customer')} className={cn('flex-1 py-2 font-medium transition-colors', nbBookingMode === 'customer' ? 'bg-(--color-primary) text-white' : 'text-gray-600 hover:bg-gray-50')}>
                Assign to a customer
              </button>
              <button type="button" onClick={() => setNbBookingMode('open')} className={cn('flex-1 py-2 font-medium transition-colors', nbBookingMode === 'open' ? 'bg-(--color-primary) text-white' : 'text-gray-600 hover:bg-gray-50')}>
                Leave spots open
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" value={nbDate} onChange={e => setNbDate(e.target.value)} required />
            <Input label="Start time" type="time" value={nbTime} onChange={e => setNbTime(e.target.value)} required />
          </div>
          {nbEndTime && <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">{selectedService?.duration_minutes} min · ends at {nbEndTime}</p>}
          {nbBookingMode === 'open' && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
              This opens {nbSpotsBooked} spot{nbSpotsBooked !== 1 ? 's' : ''} for customers to book online — no need to enter a customer below.
            </p>
          )}

          {/* Repeat */}
          <div className="border border-gray-100 rounded-lg p-3 space-y-2">
            <label className="text-sm font-medium text-gray-700 block">Repeat</label>
            <select
              value={nbRepeat}
              onChange={e => setNbRepeat(e.target.value as typeof nbRepeat)}
              className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded outline-none focus:ring-2 focus:ring-(--color-primary)"
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {nbRepeat !== 'none' && (
              <>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span>Every</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={nbRepeatInterval}
                    onChange={e => setNbRepeatInterval(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 h-9 px-2 text-sm border border-gray-200 rounded text-center outline-none focus:ring-2 focus:ring-(--color-primary)"
                  />
                  <span>{nbRepeat === 'daily' ? 'day(s)' : nbRepeat === 'weekly' ? 'week(s)' : 'month(s)'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <select
                    value={nbRepeatEndType}
                    onChange={e => setNbRepeatEndType(e.target.value as typeof nbRepeatEndType)}
                    className="h-9 px-2 text-sm border border-gray-200 rounded bg-white outline-none focus:ring-2 focus:ring-(--color-primary)"
                  >
                    <option value="count">After</option>
                    <option value="until">Until</option>
                  </select>
                  {nbRepeatEndType === 'count' ? (
                    <>
                      <input
                        type="number"
                        min={1}
                        max={MAX_RECURRENCE_OCCURRENCES}
                        value={nbRepeatCount}
                        onChange={e => setNbRepeatCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 h-9 px-2 text-sm border border-gray-200 rounded text-center outline-none focus:ring-2 focus:ring-(--color-primary)"
                      />
                      <span>occurrence(s)</span>
                    </>
                  ) : (
                    <input
                      type="date"
                      value={nbRepeatUntil}
                      onChange={e => setNbRepeatUntil(e.target.value)}
                      className="h-9 px-2 text-sm border border-gray-200 rounded outline-none focus:ring-2 focus:ring-(--color-primary)"
                    />
                  )}
                </div>
                {nbDate && nbTime && (() => {
                  const occurrences = computeOccurrenceDates(
                    new Date(`${nbDate}T${nbTime}:00`),
                    nbRepeat,
                    nbRepeatInterval,
                    nbRepeatEndType,
                    nbRepeatCount,
                    nbRepeatEndType === 'until' && nbRepeatUntil ? new Date(`${nbRepeatUntil}T23:59:59`) : null,
                  )
                  const last = occurrences[occurrences.length - 1]
                  return (
                    <p className="text-xs text-gray-500">
                      Creates {occurrences.length} booking{occurrences.length !== 1 ? 's' : ''}, {nbRepeat}, ending {format(last, 'd MMM yyyy')}
                      {occurrences.length >= MAX_RECURRENCE_OCCURRENCES ? ' (capped at 52)' : ''}
                    </p>
                  )
                })()}
              </>
            )}
          </div>

          <div className="flex items-end gap-3">
            {nbBookingMode === 'customer' && (
              <div className="relative w-32">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Price</label>
                <span className="absolute left-2.5 top-1/2 translate-y-[3px] text-sm text-gray-500">£</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nbPrice}
                  onChange={e => { setNbPrice(e.target.value); setNbPriceTouched(true) }}
                  className="w-full h-10 pl-5 pr-2 text-sm border border-gray-200 rounded outline-none focus:ring-2 focus:ring-(--color-primary)"
                />
              </div>
            )}
            {selectedService?.is_group_session && (
              <div className="w-24">
                <label className="text-sm font-medium text-gray-700 mb-1 block">{nbBookingMode === 'open' ? 'Capacity' : 'Spots'}</label>
                <input
                  type="number"
                  min={1}
                  value={nbSpotsBooked}
                  onChange={e => setNbSpotsBooked(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded outline-none focus:ring-2 focus:ring-(--color-primary)"
                />
              </div>
            )}
          </div>
          {nbBookingMode === 'customer' && selectedService?.is_group_session && nbSlotCapacity && (
            <p className={cn('text-xs px-2.5 py-1.5 rounded-lg inline-block', nbSlotCapacity.taken >= nbSlotCapacity.max ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600')}>
              {nbSlotCapacity.taken} of {nbSlotCapacity.max} spots booked at this time
            </p>
          )}

          {nbBookingMode === 'customer' && (
            <>
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
            </>
          )}
          {nbError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{nbError}</p>}
          {nbSkippedDates.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-amber-800">{nbSkippedDates.length} occurrence{nbSkippedDates.length !== 1 ? 's' : ''} skipped — not enough capacity:</p>
              <ul className="text-xs text-amber-700 list-disc list-inside">
                {nbSkippedDates.map(d => <li key={d}>{d}</li>)}
              </ul>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            {nbSkippedDates.length > 0 ? (
              <Button onClick={closeNewBooking}>OK</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={closeNewBooking}>Cancel</Button>
                <Button onClick={handleCreateBooking} loading={nbSaving}>
                  {nbBookingMode === 'open'
                    ? (nbRepeat === 'none' ? 'Open Session' : 'Open Sessions')
                    : (nbRepeat === 'none' ? 'Create Booking' : 'Create Bookings')}
                </Button>
              </>
            )}
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

      {/* ── Adjust Shift Modal ── */}
      <Modal open={!!shiftAdjustFor} onClose={() => setShiftAdjustFor(null)} title={`Adjust Shift — ${shiftAdjustFor?.name ?? ''}`} size="sm">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            For {format(selectedDay, 'EEEE d MMM')} only — their regular weekly hours are unchanged.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start" type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)} required />
            <Input label="Finish" type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)} required />
          </div>
          <Input label="Reason (optional)" value={shiftReason} onChange={e => setShiftReason(e.target.value)} placeholder="e.g. Early finish, no bookings" />
          {shiftError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{shiftError}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setShiftAdjustFor(null)}>Cancel</Button>
            <Button onClick={handleSaveShiftAdjust} loading={shiftSaving}>Save</Button>
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
        size={editMode ? 'md' : 'xl'}
      >
        {selectedBooking && !editMode && (
          <div className="flex flex-col lg:flex-row gap-5">
          <div className="flex-1 min-w-0 space-y-4">
            {selectedBookingForm?.needsForm && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <ClipboardList className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">Health form not completed</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Customer must complete <span className="font-medium">{selectedBookingForm.formTitle}</span> before this session can take place.
                  </p>
                </div>
              </div>
            )}
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Service</dt>
                <dd className="font-medium text-gray-900">{selectedBooking.service?.name}</dd>
              </div>
              {selectedBooking.recurrence_id && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Recurring</dt>
                  <dd className="text-gray-700">Occurrence {selectedBooking.recurrence_index} of {selectedBooking.recurrence_total}</dd>
                </div>
              )}
              <div className="flex justify-between items-center">
                <dt className="text-gray-500">Price</dt>
                <dd className="font-medium text-gray-900 flex items-center gap-1.5">
                  {formatCurrency(bookingPrice(selectedBooking))}
                  {selectedBooking.price_override != null && (
                    <span className="text-xs font-normal text-(--color-primary) bg-(--color-primary)/10 px-1.5 py-0.5 rounded">custom</span>
                  )}
                </dd>
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
              {selectedBooking.staff && selectedBooking.staff_id && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Staff</dt>
                  <dd>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/staff?edit=${selectedBooking.staff_id}`)}
                      className="text-(--color-primary) hover:underline font-medium"
                    >
                      {selectedBooking.staff.name}
                    </button>
                  </dd>
                </div>
              )}
              {(detailCapacity || (selectedBooking.spots_booked ?? 1) > 1) && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Spots</dt>
                  <dd className="font-semibold text-gray-900">
                    {selectedBooking.spots_booked ?? 1}
                    {detailCapacity && <span className="text-gray-400 font-normal"> · {detailCapacity.taken} of {detailCapacity.max} booked</span>}
                  </dd>
                </div>
              )}
              {selectedBooking.notes && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0">Notes</dt>
                  <dd className="text-gray-700 text-right text-xs">{selectedBooking.notes}</dd>
                </div>
              )}
              {detailAddons.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0 flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Add-ons</dt>
                  <dd className="text-gray-900 text-right text-xs space-y-0.5">
                    {detailAddons.map(a => (
                      <p key={a.addon_id}>{a.service_addon?.name ?? 'Add-on'} · {formatCurrency(a.price)}</p>
                    ))}
                  </dd>
                </div>
              )}
              {linkedBookings.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0">Linked</dt>
                  <dd className="text-right text-xs space-y-0.5">
                    {linkedBookings.map(lb => (
                      <button
                        key={lb.id}
                        type="button"
                        onClick={() => openAttendeeBooking(lb.id)}
                        className="block w-full text-(--color-primary) hover:underline text-right"
                      >
                        {lb.service?.name ?? 'Booking'} · {format(parseISO(lb.starts_at), 'HH:mm')}
                      </button>
                    ))}
                  </dd>
                </div>
              )}
              {(selectedBooking.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between items-center">
                  <dt className="text-gray-500">Discount</dt>
                  <dd className="font-semibold text-green-700">−{formatCurrency(selectedBooking.discount_amount ?? 0)}</dd>
                </div>
              )}
              {selectedBooking.resource && (
                <div className="flex justify-between items-center">
                  <dt className="text-gray-500">Resource</dt>
                  <dd className="font-medium text-gray-900">{selectedBooking.resource.name}</dd>
                </div>
              )}
              {(selectedBooking.gift_voucher_amount ?? 0) > 0 && (
                <div className="flex justify-between items-center">
                  <dt className="text-gray-500">Gift Voucher</dt>
                  <dd className="font-semibold text-green-700">−{formatCurrency(selectedBooking.gift_voucher_amount ?? 0)}</dd>
                </div>
              )}
              <div className="flex justify-between items-center">
                <dt className="text-gray-500">Status</dt>
                <dd><Badge variant={statusBadgeVariant(selectedBooking.status)} className="capitalize">{selectedBooking.status}</Badge></dd>
              </div>
            </dl>

            {/* Add linked follow-on service */}
            <div className="border border-gray-100 rounded-lg p-3 space-y-2">
              {!addLinkedOpen ? (
                <button
                  type="button"
                  onClick={openAddLinkedService}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 uppercase tracking-wide"
                >
                  <CalendarPlus className="h-3.5 w-3.5" /> Add Linked Service
                </button>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Linked Service</p>
                  <select
                    value={addLinkedServiceId}
                    onChange={e => {
                      const id = e.target.value
                      setAddLinkedServiceId(id)
                      if (id) checkLinkedAvailability(id, addLinkedPosition, addLinkedStaffId)
                    }}
                    className="w-full h-9 px-2.5 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                  >
                    <option value="">Select a service…</option>
                    {services.filter(s => !s.is_group_session && s.id !== selectedBooking.service_id).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={addLinkedStaffId ?? ''}
                      onChange={e => {
                        const id = e.target.value || null
                        setAddLinkedStaffId(id)
                        if (addLinkedServiceId) checkLinkedAvailability(addLinkedServiceId, addLinkedPosition, id)
                      }}
                      className="h-9 px-2.5 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                    >
                      <option value="">Any staff</option>
                      {staff.filter(s => !s.on_holiday).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                      <button type="button" onClick={() => { setAddLinkedPosition('before'); if (addLinkedServiceId) checkLinkedAvailability(addLinkedServiceId, 'before', addLinkedStaffId) }}
                        className={cn('flex-1 font-medium transition-colors', addLinkedPosition === 'before' ? 'bg-(--color-primary) text-white' : 'text-gray-600 hover:bg-gray-50')}>
                        Before
                      </button>
                      <button type="button" onClick={() => { setAddLinkedPosition('after'); if (addLinkedServiceId) checkLinkedAvailability(addLinkedServiceId, 'after', addLinkedStaffId) }}
                        className={cn('flex-1 font-medium transition-colors', addLinkedPosition === 'after' ? 'bg-(--color-primary) text-white' : 'text-gray-600 hover:bg-gray-50')}>
                        After
                      </button>
                    </div>
                  </div>
                  {addLinkedChecking ? (
                    <p className="text-xs text-gray-400">Checking availability…</p>
                  ) : addLinkedChecked && addLinkedAvailable ? (
                    <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
                      Available: {format(addLinkedAvailable.startsAt, 'HH:mm')}–{format(addLinkedAvailable.endsAt, 'HH:mm')}
                    </p>
                  ) : addLinkedChecked ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">Not available at that time.</p>
                  ) : null}
                  {addLinkedError && <p className="text-xs text-red-600">{addLinkedError}</p>}
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setAddLinkedOpen(false)} className="shrink-0">Cancel</Button>
                    <Button fullWidth size="sm" loading={addLinkedSaving} disabled={!addLinkedAvailable} onClick={handleAddLinkedService}>Add</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Saved card / charge balance */}
            <div className="border border-gray-100 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Payment
              </p>
              <p className="text-xs text-gray-500 capitalize">
                Status: <span className="font-medium text-gray-700">{(selectedBooking.payment_status ?? 'unpaid').replaceAll('_', ' ')}</span>
              </p>
              {selectedBooking.customer?.sumup_card_token ? (
                selectedBooking.payment_status === 'paid_in_full' ? (
                  <p className="text-xs text-green-700 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Paid in full</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={chargeType}
                        onChange={e => setChargeType(e.target.value as 'balance' | 'noshow')}
                        className="h-9 flex-1 px-2 text-xs border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-(--color-primary)"
                      >
                        <option value="balance">Balance</option>
                        <option value="noshow">No-show fee</option>
                      </select>
                      <div className="relative w-24 shrink-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">£</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={chargeAmount}
                          onChange={e => setChargeAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full h-9 pl-5 pr-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                        />
                      </div>
                    </div>
                    <Button fullWidth size="sm" loading={charging} onClick={() => handleChargeBalance(selectedBooking.id)} disabled={!chargeAmount}>
                      Charge Card
                    </Button>
                    {chargeError && <p className="text-xs text-red-600">{chargeError}</p>}
                    {chargeSuccess && <p className="text-xs text-green-700 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Charge successful</p>}
                  </div>
                )
              ) : (
                <p className="text-xs text-gray-400">No card on file for this customer.</p>
              )}
            </div>

            {/* Activity log */}
            {activityLog.length > 0 && (
              <button
                type="button"
                onClick={() => setActivityLogOpen(true)}
                className="w-full flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" /> Activity ({activityLog.length})
                </span>
                <span className="text-gray-400 normal-case font-normal">View →</span>
              </button>
            )}

            {cancelReasonOpen ? (
              <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-red-800">
                  {cancelScope === 'series' ? 'Cancel this & all future occurrences' : 'Reason for cancellation'} (required)
                </p>
                <Textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer requested, double-booked, staff unavailable…"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setCancelReasonOpen(false); setCancelReason('') }} className="shrink-0">
                    Back
                  </Button>
                  <Button fullWidth variant="danger" size="sm" loading={actionLoading} disabled={!cancelReason.trim()} onClick={() => handleCancelWithReason(selectedBooking.id)}>
                    {cancelScope === 'series' ? 'Confirm — Cancel Series' : 'Confirm Cancellation'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                {/* Check In */}
                {(selectedBooking.status === 'confirmed' || selectedBooking.status === 'pending') && (
                  selectedBooking.checked_in_at ? (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span className="flex items-center gap-2 text-xs text-green-700">
                        <UserCheck className="h-4 w-4 shrink-0" />
                        Checked in at {format(parseISO(selectedBooking.checked_in_at), 'HH:mm')}
                      </span>
                      <button onClick={() => handleUnmarkCheckIn(selectedBooking.id)} disabled={actionLoading} className="text-xs text-gray-400 hover:text-red-600 transition-colors">
                        Undo
                      </button>
                    </div>
                  ) : (
                    <Button fullWidth size="sm" loading={actionLoading} onClick={() => handleCheckIn(selectedBooking.id)} style={{ backgroundColor: 'var(--color-primary)' }}>
                      <UserCheck className="h-4 w-4" />
                      Check In Customer
                    </Button>
                  )
                )}
                <div className="flex gap-2">
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
                      <Button fullWidth variant="danger" size="sm" onClick={() => { setCancelScope('one'); setCancelReasonOpen(true) }}>
                        <XCircle className="h-4 w-4" />
                        Cancel
                      </Button>
                    </>
                  )}
                  {selectedBooking.recurrence_id && (selectedBooking.status === 'confirmed' || selectedBooking.status === 'pending') && (
                    <Button fullWidth variant="secondary" size="sm" onClick={() => { setCancelScope('series'); setCancelReasonOpen(true) }} className="text-red-600! border-red-200! hover:bg-red-50!">
                      Cancel & Future
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Customer sidebar ── */}
          <div className="lg:w-64 shrink-0 lg:border-l lg:border-gray-100 lg:pl-5 space-y-4 lg:max-h-[70vh] lg:overflow-y-auto">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                  {selectedBooking.customer?.name?.charAt(0).toUpperCase() ?? '?'}
                </div>
                <p className="font-semibold text-gray-900 text-sm truncate">{selectedBooking.customer?.name}</p>
              </div>
              <div className="space-y-1">
                {selectedBooking.customer?.email && (
                  <p className="flex items-center gap-1.5 text-xs text-gray-500 truncate">
                    <Mail className="h-3 w-3 shrink-0" />{selectedBooking.customer.email}
                  </p>
                )}
                {selectedBooking.customer?.phone && (
                  <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    <PhoneIcon className="h-3 w-3 shrink-0" />{selectedBooking.customer.phone}
                  </p>
                )}
              </div>
            </div>

            {customerSidebarLoading ? (
              <p className="text-xs text-gray-400">Loading…</p>
            ) : (
              <>
                {customerMemberships.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <Ticket className="h-3 w-3" /> Memberships
                    </p>
                    <div className="space-y-1">
                      {customerMemberships.map(m => (
                        <p key={m.id} className="text-xs text-gray-700">{m.plan?.name ?? 'Membership'} · {m.tokens_remaining} left</p>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <CalendarClock className="h-3 w-3" /> Previous Bookings
                  </p>
                  {customerBookings.length === 0 ? (
                    <p className="text-xs text-gray-400">No previous bookings.</p>
                  ) : (
                    <div className="space-y-2">
                      {customerBookings.map(cb => (
                        <div key={cb.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs text-gray-800 truncate">{cb.service?.name ?? 'Booking'}</p>
                            <p className="text-xs text-gray-400">{format(parseISO(cb.starts_at), 'd MMM yyyy')}</p>
                          </div>
                          <Badge variant={statusBadgeVariant(cb.status)} className="capitalize shrink-0">{cb.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <ClipboardList className="h-3 w-3" /> Forms
                  </p>
                  {customerForms.length === 0 ? (
                    <p className="text-xs text-gray-400">No forms completed.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {customerForms.map(fr => {
                        const valid = !isPast(parseISO(fr.expires_at))
                        return (
                          <div key={fr.id} className="flex items-center justify-between gap-2">
                            <p className="text-xs text-gray-800 truncate">{fr.form?.title ?? 'Form'}</p>
                            <span className={cn('text-xs font-medium shrink-0', valid ? 'text-green-600' : 'text-amber-600')}>
                              {valid ? 'Valid' : 'Expired'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        )}

        {selectedBooking && editMode && (
          <div className="space-y-4">
            {/* Customer */}
            <div className="relative">
              <Input
                label="Customer"
                value={editCustomerName}
                onChange={e => {
                  setEditCustomerName(e.target.value)
                  if (e.target.value !== selectedBooking.customer?.name) setEditCustomerId(null)
                  editSearchCustomers(e.target.value)
                }}
                onFocus={() => editCustomerName.length >= 2 && setEditCustomerShowSuggestions(true)}
                onBlur={() => setTimeout(() => setEditCustomerShowSuggestions(false), 150)}
                placeholder="Start typing a name…"
                autoComplete="off"
              />
              {editCustomerShowSuggestions && editCustomerSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  {editCustomerSuggestions.map(c => (
                    <button key={c.id} type="button" className="w-full px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      onMouseDown={() => selectEditCustomer(c)}>
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
              {!editCustomerId && <p className="text-xs text-amber-600 mt-1">Select a customer from the list.</p>}
            </div>

            {/* Service / Staff */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Service</label>
                <select
                  value={editServiceId}
                  onChange={e => {
                    const id = e.target.value
                    setEditServiceId(id)
                    if (!editPriceTouched) {
                      const svc = services.find(s => s.id === id)
                      if (svc) setEditPrice((svc.price / 100).toFixed(2))
                    }
                  }}
                  className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                >
                  {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Staff</label>
                <select
                  value={editStaffId ?? ''}
                  onChange={e => setEditStaffId(e.target.value || null)}
                  className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                >
                  <option value="">Unassigned</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Date / Time / Price */}
            <div className="grid grid-cols-3 gap-3">
              <Input label="Date" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} required />
              <Input label="Start time" type="time" value={editTime} onChange={e => setEditTime(e.target.value)} required />
              <div className="relative">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Price</label>
                <span className="absolute left-2.5 top-1/2 translate-y-[3px] text-sm text-gray-500">£</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editPrice}
                  onChange={e => { setEditPrice(e.target.value); setEditPriceTouched(true) }}
                  className="w-full h-10 pl-5 pr-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                />
              </div>
            </div>
            {editService && (() => {
              const addonMinutes = availableAddons.filter(a => editAddonIds.has(a.id)).reduce((sum, a) => sum + a.duration_minutes, 0)
              const totalMinutes = editService.duration_minutes + addonMinutes
              return (
                <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 -mt-2">
                  {totalMinutes} min{addonMinutes > 0 ? ` (${editService.duration_minutes} + ${addonMinutes} add-on)` : ''} · ends at {editDate && editTime ? format(addMinutes(new Date(`${editDate}T${editTime}:00`), totalMinutes), 'HH:mm') : '—'}
                </p>
              )
            })()}

            {editService?.is_group_session && (
              <div className="flex items-end gap-3">
                <div className="w-24">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Spots</label>
                  <input
                    type="number"
                    min={1}
                    value={editSpotsBooked}
                    onChange={e => setEditSpotsBooked(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                  />
                </div>
                {editSlotCapacity && (
                  <p className={cn('text-xs px-2.5 py-1.5 rounded-lg', editSlotCapacity.taken + editSpotsBooked > editSlotCapacity.max ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600')}>
                    {editSlotCapacity.taken} of {editSlotCapacity.max} other spot(s) booked at this time
                  </p>
                )}
              </div>
            )}

            {availableAddons.length > 0 && (
              <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Add-ons
                </p>
                <div className="space-y-1.5">
                  {availableAddons.map(addon => {
                    const checked = editAddonIds.has(addon.id)
                    return (
                      <label key={addon.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setEditAddonIds(prev => {
                            const next = new Set(prev)
                            checked ? next.delete(addon.id) : next.add(addon.id)
                            return next
                          })}
                          className="accent-(--color-primary)"
                        />
                        <span className="flex-1 text-gray-700">{addon.name}</span>
                        <span className="text-xs text-gray-400">+{addon.duration_minutes}min</span>
                        <span className="text-xs font-semibold text-gray-900">{formatCurrency(addon.price)}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <hr className="border-gray-100" />

            {/* Notes */}
            <Textarea label="Notes" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Add notes…" />

            {/* Room */}
            {resources.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Room</label>
                <select
                  value={editResourceId ?? ''}
                  onChange={e => setEditResourceId(e.target.value || null)}
                  className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                >
                  <option value="">No room assigned</option>
                  {resources.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Equipment */}
            {equipmentResources.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Equipment</label>
                <select
                  value={editEquipmentResourceId ?? ''}
                  onChange={e => setEditEquipmentResourceId(e.target.value || null)}
                  className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                >
                  <option value="">No equipment</option>
                  {equipmentResources.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

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

            {/* Gift voucher */}
            <div className="border border-gray-100 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5" /> Gift Voucher
              </p>
              {editVoucherApplied ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-green-700 font-medium">Voucher applied: −{formatCurrency(editVoucherAmount)}</span>
                  <button onClick={handleEditRemoveVoucher} disabled={editVoucherRemoving} className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
                    {editVoucherRemoving ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editVoucherCode}
                    onChange={(e) => { setEditVoucherCode(e.target.value.toUpperCase()); setEditVoucherError('') }}
                    placeholder="VOUCHER CODE"
                    className="flex-1 h-9 px-3 text-sm font-mono border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) uppercase"
                  />
                  <Button size="sm" loading={editVoucherApplying} onClick={handleEditApplyVoucher} disabled={!editVoucherCode.trim()}>
                    Apply
                  </Button>
                </div>
              )}
              {editVoucherError && <p className="text-xs text-red-600">{editVoucherError}</p>}
            </div>

            {editError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => { setEditMode(false); if (selectedBooking) refreshActivityLog(selectedBooking.id) }} className="shrink-0">
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button fullWidth onClick={handleSaveEdit} loading={editSaving} disabled={!editCustomerId}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Activity Log Modal ── */}
      <Modal open={activityLogOpen} onClose={() => setActivityLogOpen(false)} title="Activity Log" size="sm">
        <ul className="space-y-3">
          {activityLog.map(entry => (
            <li key={entry.id} className="text-sm border-l-2 border-gray-200 pl-3">
              <p className="text-gray-800">{entry.summary}</p>
              {entry.reason && <p className="text-gray-500 italic mt-0.5">"{entry.reason}"</p>}
              <p className="text-xs text-gray-400 mt-0.5">
                {entry.actor_name} · {format(parseISO(entry.created_at), 'd MMM yyyy, HH:mm')}
              </p>
            </li>
          ))}
        </ul>
      </Modal>

      {/* ── Session Attendees Modal (open group-session slots) ── */}
      <Modal
        open={!!selectedSession}
        onClose={() => setSelectedSession(null)}
        title={selectedSession ? `${selectedSession.service?.name} — ${format(parseISO(selectedSession.event_date), 'EEE d MMM')}, ${selectedSession.start_time.slice(0, 5)}` : ''}
        size="sm"
      >
        {selectedSession && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {sessionAttendeesLoading ? '…' : `${sessionCapacityMap.get(selectedSession.id)?.taken ?? 0} of ${sessionCapacityMap.get(selectedSession.id)?.max ?? 8} spots booked`}
            </p>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Attendees
              </p>
              {sessionAttendeesLoading ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : sessionAttendees.length === 0 ? (
                <p className="text-sm text-gray-400">No bookings yet — this session is still open online.</p>
              ) : (
                <ul className="space-y-1.5">
                  {sessionAttendees.map(a => (
                    <li key={a.id}>
                      <button
                        onClick={() => openAttendeeBooking(a.id)}
                        className="w-full flex justify-between text-sm bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition-colors text-left"
                      >
                        <span className="text-gray-800">{a.customer?.name ?? 'Unknown'}</span>
                        <span className="text-gray-500">{a.spots_booked} spot{a.spots_booked !== 1 ? 's' : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {sessionCancelOpen ? (
              <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-red-800">Reason for cancelling this session (required)</p>
                {sessionAttendees.length > 0 && (
                  <p className="text-xs text-red-700">This will cancel all {sessionAttendees.length} attendee booking{sessionAttendees.length !== 1 ? 's' : ''}.</p>
                )}
                <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Not enough demand, room unavailable…" rows={2} />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setSessionCancelOpen(false); setCancelReason('') }} className="shrink-0">Back</Button>
                  <Button fullWidth variant="danger" size="sm" loading={sessionCanceling} disabled={!cancelReason.trim()} onClick={() => handleCancelSession(cancelReason)}>
                    Confirm Cancellation
                  </Button>
                </div>
              </div>
            ) : (
              <Button fullWidth variant="danger" size="sm" onClick={() => { setSessionCancelOpen(true); setCancelReason('') }}>
                <XCircle className="h-4 w-4" />
                Cancel Session
              </Button>
            )}
          </div>
        )}
      </Modal>

      {/* ── Hover preview card ── */}
      {hoverBooking && !selectedBooking && (() => {
        const color = categoryColorMap[hoverBooking.service?.category] ?? '#7C3AED'
        const cardWidth = 260
        const cardMaxHeight = 280
        const left = Math.max(8, Math.min(hoverPos.x + 14, window.innerWidth - cardWidth - 8))
        const top = Math.max(8, Math.min(hoverPos.y + 14, window.innerHeight - cardMaxHeight - 8))
        const cap = slotCapacityMap.get(`${hoverBooking.service_id}|${hoverBooking.starts_at}`)
        const svc = services.find(s => s.id === hoverBooking.service_id)
        const apptStart = parseISO(hoverBooking.starts_at)
        const apptEnd = parseISO(hoverBooking.ends_at)
        const apptMinutes = differenceInMinutes(apptEnd, apptStart)
        const preBuffer = svc?.pre_buffer_minutes ?? 0
        const postBuffer = svc?.post_buffer_minutes ?? 0
        const hasBuffer = preBuffer > 0 || postBuffer > 0
        const blockedStart = addMinutes(apptStart, -preBuffer)
        const blockedEnd = addMinutes(apptEnd, postBuffer)
        return (
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 pointer-events-none"
            style={{ left, top, width: cardWidth, borderTop: `3px solid ${color}` }}
          >
            <p className="text-xs font-semibold text-gray-500 mb-0.5">
              Appt time: {format(apptStart, 'HH:mm')}–{format(apptEnd, 'HH:mm')} <span className="text-gray-400 font-normal">({apptMinutes} min)</span>
            </p>
            {hasBuffer && (
              <p className="text-xs text-gray-400 mb-1">
                Blocked time: {format(blockedStart, 'HH:mm')}–{format(blockedEnd, 'HH:mm')}
                {preBuffer > 0 && ` · +${preBuffer}min prep`}
                {postBuffer > 0 && ` · +${postBuffer}min set-down`}
              </p>
            )}
            <p className={cn('text-sm font-semibold text-gray-900 truncate', hasBuffer ? 'mt-1.5' : 'mt-1')}>{hoverBooking.service?.name}</p>
            <p className="text-sm text-gray-700 truncate">{hoverBooking.customer?.name}</p>
            {hoverBooking.staff?.name && <p className="text-xs text-gray-500 mt-1">with {hoverBooking.staff.name}</p>}
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                {formatCurrency(bookingPrice(hoverBooking))}
                {hoverBooking.price_override != null && (
                  <span className="text-xs font-normal text-(--color-primary) bg-(--color-primary)/10 px-1.5 py-0.5 rounded">custom</span>
                )}
              </span>
              <Badge variant={statusBadgeVariant(hoverBooking.status)} className="capitalize">{hoverBooking.status}</Badge>
            </div>
            {cap && <p className="text-xs text-gray-500 mt-1.5">{cap.taken}/{cap.max} spots booked</p>}
            {hoverBooking.notes && <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{hoverBooking.notes}</p>}
          </div>
        )
      })()}
    </div>
  )
}
