import { useCallback, useEffect, useState } from 'react'
import {
  format, startOfDay, endOfDay, addDays, subDays, addMinutes,
  isToday, isTomorrow, isSameDay, parseISO, startOfWeek, endOfWeek, differenceInMinutes,
} from 'date-fns'
import {
  CalendarClock, Clock, UserCheck, CheckCircle2, XCircle, Pencil, CreditCard,
  ChevronLeft, ChevronRight, Plus, Trash2, Star,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatDuration } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { StaffLayout, type StaffSection } from '@/components/layout/StaffLayout'
import type { Resource } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string
const HOUR_HEIGHT = 64
const START_HOUR = 8
const END_HOUR = 20

type Appt = {
  id: string; starts_at: string; ends_at: string; status: string; notes: string | null
  resource_id: string | null; equipment_resource_id: string | null; checked_in_at: string | null
  payment_status: string; deposit_charged: number; discount_amount: number; gift_voucher_amount: number
  customer: { name: string; phone: string | null; email: string; sumup_card_token: string | null } | null
  service: { name: string; duration_minutes: number; price: number } | null
  resource: { name: string } | null; equipment_resource: { name: string } | null
}
type CalAppt = { id: string; starts_at: string; ends_at: string; status: string; payment_status: string; customer: { name: string } | null; service: { name: string } | null }
type BlockedTime = { id: string; staff_id: string; starts_at: string; ends_at: string; reason: string | null }
type ActivityEntry = { id: string; actor_name: string; summary: string; reason: string | null; created_at: string }
type Review = { id: string; reviewer_name: string; rating: number; comment: string | null; is_approved: boolean; created_at: string }
type ClientEntry = { customer_id: string; name: string; email: string; visits: number; upcoming: number }

function positionBlock(startsAt: string, endsAt: string) {
  const s = parseISO(startsAt), e = parseISO(endsAt)
  const top = (s.getHours() + s.getMinutes() / 60 - START_HOUR) * HOUR_HEIGHT
  const height = Math.max(differenceInMinutes(e, s) / 60 * HOUR_HEIGHT, 24)
  return { top, height }
}

function StarRating({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5">
      {[1,2,3,4,5].map(i => <Star key={i} className={`h-3.5 w-3.5 ${i <= n ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />)}
    </span>
  )
}

export default function StaffPortal() {
  const { staffId } = useAuthStore()
  const [staffName, setStaffName] = useState('')
  const [activeSection, setActiveSection] = useState<StaffSection>('schedule')

  // ── Schedule ──────────────────────────────────────────────────────────────
  const [todayAppts, setTodayAppts] = useState<Appt[]>([])
  const [upcomingAppts, setUpcomingAppts] = useState<Appt[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [equipmentResources, setEquipmentResources] = useState<Resource[]>([])
  const [weekCancellations, setWeekCancellations] = useState(0)
  const [nextApptIn, setNextApptIn] = useState('—')
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)

  const [selected, setSelected] = useState<Appt | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editResourceId, setEditResourceId] = useState<string | null>(null)
  const [editEquipmentResourceId, setEditEquipmentResourceId] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeType, setChargeType] = useState<'balance' | 'noshow'>('balance')
  const [charging, setCharging] = useState(false)
  const [chargeError, setChargeError] = useState('')
  const [chargeSuccess, setChargeSuccess] = useState(false)
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([])

  // ── Calendar ──────────────────────────────────────────────────────────────
  const [calDay, setCalDay] = useState(() => new Date())
  const [calWeekAppts, setCalWeekAppts] = useState<CalAppt[]>([])
  const [calBlocked, setCalBlocked] = useState<BlockedTime[]>([])
  // Cell click popover
  const [cellPopover, setCellPopover] = useState<{ x: number; y: number; time: string } | null>(null)
  // New booking from calendar
  const [nbOpen, setNbOpen] = useState(false)
  const [nbTime, setNbTime] = useState('')
  const [nbForm, setNbForm] = useState({ name: '', email: '', phone: '', serviceId: '', resourceId: '', equipmentResourceId: '', notes: '' })
  const [nbSaving, setNbSaving] = useState(false)
  const [nbError, setNbError] = useState('')
  const [calServices, setCalServices] = useState<{ id: string; name: string; duration_minutes: number }[]>([])
  const [calLoading, setCalLoading] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockForm, setBlockForm] = useState({ startDate: '', endDate: '', allDay: false, startTime: '09:00', endTime: '17:00', reason: '' })
  const [blockSaving, setBlockSaving] = useState(false)
  const [blockError, setBlockError] = useState('')

  // ── Reviews ───────────────────────────────────────────────────────────────
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewsLoaded, setReviewsLoaded] = useState(false)

  // ── Clients ───────────────────────────────────────────────────────────────
  const [clients, setClients] = useState<ClientEntry[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [clientsLoaded, setClientsLoaded] = useState(false)

  // Initial load: schedule data
  useEffect(() => {
    if (!staffId) return
    async function load() {
      const [staffRes, apptRes, resRes, equipRes, cancelRes] = await Promise.all([
        supabase.from('staff').select('name').eq('id', staffId).single(),
        supabase.from('bookings')
          .select('id, starts_at, ends_at, status, notes, resource_id, equipment_resource_id, checked_in_at, payment_status, deposit_charged, discount_amount, gift_voucher_amount, customer:customers(name,phone,email,sumup_card_token), service:services(name,duration_minutes,price), resource:resources!resource_id(name), equipment_resource:resources!equipment_resource_id(name)')
          .eq('business_id', BUSINESS_ID).eq('staff_id', staffId).neq('status', 'cancelled')
          .gte('starts_at', startOfDay(new Date()).toISOString())
          .lte('starts_at', endOfDay(addDays(new Date(), 60)).toISOString()).order('starts_at'),
        supabase.from('resources').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).eq('resource_type', 'room').order('name'),
        supabase.from('resources').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).eq('resource_type', 'equipment').order('name'),
        supabase.from('bookings').select('id', { count: 'exact', head: true })
          .eq('business_id', BUSINESS_ID).eq('staff_id', staffId).eq('status', 'cancelled')
          .gte('starts_at', startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString())
          .lte('starts_at', endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString()),
      ])
      if (staffRes.data) setStaffName(staffRes.data.name)
      const all = (apptRes.data ?? []) as unknown as Appt[]
      setTodayAppts(all.filter(a => isToday(parseISO(a.starts_at))))
      setUpcomingAppts(all.filter(a => !isToday(parseISO(a.starts_at))))
      if (resRes.data) setResources(resRes.data as Resource[])
      if (equipRes.data) setEquipmentResources(equipRes.data as Resource[])
      setWeekCancellations((cancelRes as { count: number | null }).count ?? 0)
      setLoading(false)
    }
    load()
  }, [staffId])

  // Calendar week loader
  // Live countdown to next appointment — updates every 30 seconds
  useEffect(() => {
    function tick() {
      const all = [...todayAppts, ...upcomingAppts]
      const next = all
        .filter(a => (a.status === 'confirmed' || a.status === 'pending') && new Date(a.starts_at) > new Date())
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0]
      if (!next) { setNextApptIn('None'); return }
      const diff = differenceInMinutes(parseISO(next.starts_at), new Date())
      if (diff <= 0) { setNextApptIn('Now'); return }
      const h = Math.floor(diff / 60), m = diff % 60
      setNextApptIn(h > 0 ? `${h}h ${m}m` : `${m}m`)
    }
    tick()
    const timer = setInterval(tick, 30000)
    return () => clearInterval(timer)
  }, [todayAppts, upcomingAppts])

  const loadCalWeek = useCallback(async (day: Date) => {
    if (!staffId) return
    setCalLoading(true)
    const ws = startOfWeek(day, { weekStartsOn: 1 }), we = endOfWeek(day, { weekStartsOn: 1 })
    const [apptRes, blockRes] = await Promise.all([
      supabase.from('bookings')
        .select('id, starts_at, ends_at, status, payment_status, customer:customers(name), service:services(name)')
        .eq('business_id', BUSINESS_ID).eq('staff_id', staffId).neq('status', 'cancelled')
        .gte('starts_at', ws.toISOString()).lte('starts_at', we.toISOString()).order('starts_at'),
      supabase.from('blocked_times').select('*').eq('staff_id', staffId)
        .gte('starts_at', ws.toISOString()).lte('ends_at', we.toISOString()),
    ])
    setCalWeekAppts((apptRes.data ?? []) as unknown as CalAppt[])
    setCalBlocked((blockRes.data ?? []) as BlockedTime[])
    setCalLoading(false)
  }, [staffId])

  useEffect(() => {
    if (activeSection !== 'calendar') return
    loadCalWeek(calDay)
    if (calServices.length === 0) {
      supabase.from('services').select('id, name, duration_minutes').eq('business_id', BUSINESS_ID).eq('is_active', true).eq('is_group_session', false).neq('is_self_service', true).order('name')
        .then(({ data }) => { if (data) setCalServices(data as { id: string; name: string; duration_minutes: number }[]) })
    }
  }, [activeSection, calDay, loadCalWeek])

  // Reviews loader (lazy)
  useEffect(() => {
    if (activeSection !== 'reviews' || reviewsLoaded || !staffId) return
    setReviewsLoading(true)
    supabase.from('staff_reviews').select('id, reviewer_name, rating, comment, is_approved, created_at')
      .eq('staff_id', staffId).eq('business_id', BUSINESS_ID).order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setReviews(data as Review[])
        setReviewsLoading(false)
        setReviewsLoaded(true)
      })
  }, [activeSection, reviewsLoaded, staffId])

  // Clients loader (lazy)
  useEffect(() => {
    if (activeSection !== 'clients' || clientsLoaded || !staffId) return
    setClientsLoading(true)
    supabase.from('bookings')
      .select('customer_id, status, starts_at, customer:customers(name,email)')
      .eq('business_id', BUSINESS_ID).eq('staff_id', staffId).neq('status', 'cancelled')
      .then(({ data }) => {
        const map = new Map<string, ClientEntry>()
        const now = new Date()
        for (const b of (data ?? []) as unknown as { customer_id: string; status: string; starts_at: string; customer: { name: string; email: string } | null }[]) {
          if (!b.customer_id) continue
          if (!map.has(b.customer_id)) map.set(b.customer_id, { customer_id: b.customer_id, name: b.customer?.name ?? '—', email: b.customer?.email ?? '', visits: 0, upcoming: 0 })
          const entry = map.get(b.customer_id)!
          if (b.status === 'completed') entry.visits++
          else if (new Date(b.starts_at) > now) entry.upcoming++
        }
        setClients(Array.from(map.values()).sort((a, b) => b.visits - a.visits))
        setClientsLoading(false)
        setClientsLoaded(true)
      })
  }, [activeSection, clientsLoaded, staffId])

  const refreshActivityLog = useCallback(async (id: string) => {
    const { data } = await supabase.from('booking_activity_log').select('id, actor_name, summary, reason, created_at').eq('booking_id', id).order('created_at', { ascending: false })
    if (data) setActivityLog(data as ActivityEntry[])
  }, [])

  function openDetail(a: Appt) {
    setSelected(a); setEditMode(false); setEditNotes(a.notes ?? ''); setEditResourceId(a.resource_id ?? null)
    setEditEquipmentResourceId(a.equipment_resource_id ?? null)
    setCancelOpen(false); setCancelReason('')
    const remaining = (a.service?.price ?? 0) - (a.discount_amount ?? 0) - (a.gift_voucher_amount ?? 0) - (a.deposit_charged ?? 0)
    setChargeAmount(remaining > 0 ? (remaining / 100).toFixed(2) : '')
    setChargeType('balance'); setChargeError(''); setChargeSuccess(false); setActivityLog([])
    refreshActivityLog(a.id)
  }

  function updateLocal(id: string, patch: Partial<Appt>) {
    const up = (p: Appt[]) => p.map(a => a.id === id ? { ...a, ...patch } : a)
    setTodayAppts(up); setUpcomingAppts(up); setSelected(p => p?.id === id ? { ...p, ...patch } : p)
  }

  async function handleCheckIn(id: string) {
    setActionLoading(true); const t = new Date().toISOString()
    await supabase.from('bookings').update({ checked_in_at: t }).eq('id', id)
    updateLocal(id, { checked_in_at: t }); await refreshActivityLog(id); setActionLoading(false)
  }
  async function handleComplete(id: string) {
    setActionLoading(true)
    await supabase.from('bookings').update({ status: 'completed' }).eq('id', id)
    updateLocal(id, { status: 'completed' }); await refreshActivityLog(id); setActionLoading(false)
  }
  async function handleCancelWithReason(id: string) {
    if (!cancelReason.trim()) return; setActionLoading(true)
    await supabase.from('bookings').update({ status: 'cancelled', cancellation_reason: cancelReason.trim() }).eq('id', id)
    setTodayAppts(p => p.filter(a => a.id !== id)); setUpcomingAppts(p => p.filter(a => a.id !== id))
    setSelected(null); setCancelOpen(false); setCancelReason(''); setActionLoading(false)
  }
  async function handleSaveEdit(id: string) {
    setEditSaving(true)
    const mr = resources.find(r => r.id === editResourceId) ?? null
    const me = equipmentResources.find(r => r.id === editEquipmentResourceId) ?? null
    await supabase.from('bookings').update({ notes: editNotes.trim() || null, resource_id: editResourceId, equipment_resource_id: editEquipmentResourceId }).eq('id', id)
    updateLocal(id, { notes: editNotes.trim() || null, resource_id: editResourceId, resource: mr ? { name: mr.name } : null, equipment_resource_id: editEquipmentResourceId, equipment_resource: me ? { name: me.name } : null })
    await refreshActivityLog(id); setEditMode(false); setEditSaving(false)
  }
  async function handleMarkAsPaid(id: string) {
    setCharging(true)
    await supabase.from('bookings').update({ payment_status: 'paid_in_full', balance_charged_at: new Date().toISOString() }).eq('id', id)
    updateLocal(id, { payment_status: 'paid_in_full' }); await refreshActivityLog(id); setCharging(false)
  }
  async function handleChargeBalance(id: string) {
    const amtP = Math.round(parseFloat(chargeAmount) * 100)
    if (!amtP || amtP <= 0) { setChargeError('Enter a valid amount'); return }
    setCharging(true); setChargeError(''); setChargeSuccess(false)
    const { data, error } = await supabase.functions.invoke('sumup-charge-balance', { body: { booking_id: id, amount: amtP, type: chargeType } })
    if (error || !data?.success) {
      setChargeError((data as { error?: string } | null)?.error ?? error?.message ?? 'Charge failed')
    } else {
      setChargeSuccess(true); updateLocal(id, { payment_status: 'paid_in_full' }); await refreshActivityLog(id)
    }
    setCharging(false)
  }
  async function handleAddBlock() {
    if (!staffId || !blockForm.startDate) return
    setBlockSaving(true)
    setBlockError('')
    const reason = blockForm.reason.trim() || null
    const endDate = blockForm.endDate || blockForm.startDate
    const rows: { staff_id: string; starts_at: string; ends_at: string; reason: string | null }[] = []
    const cursor = new Date(blockForm.startDate + 'T12:00:00') // noon to avoid DST edge cases
    const last = new Date(endDate + 'T12:00:00')
    while (cursor <= last) {
      const d = format(cursor, 'yyyy-MM-dd')
      const starts = new Date(`${d}T${blockForm.allDay ? '00:00' : blockForm.startTime}`)
      const ends   = new Date(`${d}T${blockForm.allDay ? '23:59' : blockForm.endTime}`)
      rows.push({ staff_id: staffId, starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason })
      cursor.setDate(cursor.getDate() + 1)
    }
    const { data, error } = await supabase.from('blocked_times').insert(rows).select()
    if (error) {
      setBlockError('Could not save — make sure you have permission to block time.')
    } else if (data) {
      setCalBlocked(p => [...p, ...(data as BlockedTime[])])
      setBlockOpen(false)
      setBlockForm({ startDate: '', endDate: '', allDay: false, startTime: '09:00', endTime: '17:00', reason: '' })
    }
    setBlockSaving(false)
  }
  async function handleDeleteBlock(id: string) {
    const { error } = await supabase.from('blocked_times').delete().eq('id', id)
    if (!error) setCalBlocked(p => p.filter(b => b.id !== id))
  }

  function handleGridClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('[data-block]')) return
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const relY = e.clientY - rect.top
    const rawHours = START_HOUR + relY / HOUR_HEIGHT
    const hour = Math.floor(rawHours)
    const mins = Math.round((rawHours % 1) * 60 / 15) * 15
    const time = `${String(hour).padStart(2, '0')}:${String(mins === 60 ? 0 : mins).padStart(2, '0')}`
    setCellPopover({ x: e.clientX, y: e.clientY, time })
  }

  async function handleCreateBooking() {
    if (!staffId || !nbForm.name || !nbForm.email || !nbForm.serviceId) { setNbError('Name, email and service are required'); return }
    const svc = calServices.find(s => s.id === nbForm.serviceId)
    if (!svc) return
    const [h, m] = nbTime.split(':').map(Number)
    const startsAt = new Date(calDay); startsAt.setHours(h, m, 0, 0)
    const endsAt = addMinutes(startsAt, svc.duration_minutes)
    setNbSaving(true); setNbError('')
    const { data: bookingId, error } = await supabase.rpc('create_booking', {
      p_business_id: BUSINESS_ID, p_user_id: null,
      p_name: nbForm.name.trim(), p_email: nbForm.email.trim(), p_phone: nbForm.phone.trim() || null,
      p_staff_id: staffId, p_service_id: nbForm.serviceId,
      p_starts_at: startsAt.toISOString(), p_ends_at: endsAt.toISOString(),
      p_notes: nbForm.notes.trim() || null,
    })
    if (error) {
      setNbError(error.message)
    } else {
      // Apply room / equipment overrides if staff selected them
      const overrides: Record<string, string | null> = {}
      if (nbForm.resourceId) overrides.resource_id = nbForm.resourceId
      if (nbForm.equipmentResourceId) overrides.equipment_resource_id = nbForm.equipmentResourceId
      if (Object.keys(overrides).length && bookingId) {
        await supabase.from('bookings').update(overrides).eq('id', bookingId as string)
      }
      setNbOpen(false)
      setNbForm({ name: '', email: '', phone: '', serviceId: '', resourceId: '', equipmentResourceId: '', notes: '' })
      loadCalWeek(calDay)
    }
    setNbSaving(false)
    void bookingId
  }

  if (loading) return <StaffLayout staffName="" activeSection={activeSection} onSection={setActiveSection}><FullPageSpinner /></StaffLayout>

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(calDay, { weekStartsOn: 1 }), i))
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR)
  const dayAppts = calWeekAppts.filter(a => isSameDay(parseISO(a.starts_at), calDay))
  const dayBlocked = calBlocked.filter(bt => {
    const s = parseISO(bt.starts_at), e = parseISO(bt.ends_at)
    return isSameDay(s, calDay) || isSameDay(e, calDay) || (s < startOfDay(calDay) && e > endOfDay(calDay))
  })
  const color = 'var(--color-primary)'
  const approvedReviews = reviews.filter(r => r.is_approved)
  const avgRating = approvedReviews.length ? (approvedReviews.reduce((s, r) => s + r.rating, 0) / approvedReviews.length).toFixed(1) : null

  return (
    <StaffLayout staffName={staffName} activeSection={activeSection} onSection={setActiveSection}>

      {/* ── SCHEDULE ── */}
      {activeSection === 'schedule' && (
        <>
          <div className="mb-5">
            <h1 className="text-xl font-bold text-gray-900">Good {greeting()}, {staffName.split(' ')[0]}</h1>
            <p className="text-sm text-gray-500">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Remaining Today', value: todayAppts.filter(a => a.status === 'confirmed' || a.status === 'pending').length, color: 'text-blue-600', bg: 'bg-blue-50', icon: CalendarClock },
              { label: 'Completed Today', value: todayAppts.filter(a => a.status === 'completed').length, color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2 },
              { label: 'Cancellations', value: weekCancellations, color: 'text-red-500', bg: 'bg-red-50', icon: XCircle },
              { label: 'Next Appt In', value: nextApptIn, color: 'text-purple-600', bg: 'bg-purple-50', icon: Clock },
            ].map(s => (
              <Card key={s.label} padding="md">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`p-1.5 rounded-lg ${s.bg}`}>
                    <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</p>
              </Card>
            ))}
          </div>

          {(() => {
            const active = todayAppts.filter(a => a.status === 'confirmed' || a.status === 'pending')
            const completed = todayAppts.filter(a => a.status === 'completed')
            return (
              <>
                <section className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarClock className="h-4 w-4 text-gray-400" />
                    <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Today</h2>
                    <span className="text-xs text-gray-400 ml-auto">{active.length} remaining</span>
                  </div>
                  {active.length === 0
                    ? <Card padding="md" className="text-center py-10"><p className="text-gray-400 text-sm">No remaining appointments today.</p></Card>
                    : <div className="space-y-2">{active.map(a => <ApptCard key={a.id} appt={a} onClick={() => openDetail(a)} />)}</div>
                  }
                </section>

                {upcomingAppts.length > 0 && (
                  <section className="mb-8">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Coming up</h2>
                    </div>
                    <div className="space-y-2">{upcomingAppts.map(a => <ApptCard key={a.id} appt={a} onClick={() => openDetail(a)} compact />)}</div>
                  </section>
                )}

                {completed.length > 0 && (
                  <section>
                    <button
                      onClick={() => setShowCompleted(v => !v)}
                      className="flex items-center gap-2 w-full mb-3 group"
                    >
                      <CheckCircle2 className="h-4 w-4 text-gray-300" />
                      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Completed Today</h2>
                      <span className="text-xs text-gray-400 ml-auto">{completed.length}</span>
                      <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${showCompleted ? 'rotate-90' : ''}`} />
                    </button>
                    {showCompleted && (
                      <div className="space-y-2 opacity-60">
                        {completed.map(a => <ApptCard key={a.id} appt={a} onClick={() => openDetail(a)} compact />)}
                      </div>
                    )}
                  </section>
                )}
              </>
            )
          })()}
        </>
      )}

      {/* ── CALENDAR ── */}
      {activeSection === 'calendar' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
            <Button size="sm" variant="secondary" onClick={() => { setBlockForm(f => ({ ...f, startDate: format(calDay, 'yyyy-MM-dd'), endDate: format(calDay, 'yyyy-MM-dd') })); setBlockOpen(true) }}>
              <Plus className="h-3.5 w-3.5" /> Block Time
            </Button>
          </div>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCalDay(d => subDays(d, 7))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-xs font-semibold text-gray-500">{format(weekDays[0], 'd MMM')} – {format(weekDays[6], 'd MMM yyyy')}</span>
            <button onClick={() => setCalDay(d => addDays(d, 7))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-4">
            {weekDays.map(d => {
              const hasAppts = calWeekAppts.some(a => isSameDay(parseISO(a.starts_at), d))
              const hasBlock = calBlocked.some(bt => isSameDay(parseISO(bt.starts_at), d))
              const sel = isSameDay(d, calDay)
              return (
                <button key={d.toISOString()} onClick={() => setCalDay(d)}
                  className={`flex flex-col items-center py-1.5 rounded-lg text-xs transition-colors ${sel ? 'text-white' : isToday(d) ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-500 hover:bg-gray-50'}`}
                  style={sel ? { backgroundColor: color } : {}}>
                  <span>{format(d, 'EEE')[0]}</span>
                  <span className="font-semibold">{format(d, 'd')}</span>
                  {(hasAppts || hasBlock) && <span className={`h-1 w-1 rounded-full mt-0.5 ${sel ? 'bg-white/70' : 'bg-(--color-primary)'}`} />}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">{format(calDay, 'EEEE d MMMM')}</p>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            {calLoading ? <div className="py-16 text-center text-sm text-gray-400">Loading…</div> : (
              <div className="relative overflow-y-auto cursor-pointer" style={{ height: HOUR_HEIGHT * (END_HOUR - START_HOUR) }} onClick={handleGridClick}>
                {hours.map(h => (
                  <div key={h} className="absolute w-full flex" style={{ top: (h - START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                    <span className="text-xs text-gray-400 w-12 text-right pr-2 pt-0.5 shrink-0">{h}:00</span>
                    <div className="flex-1 border-t border-gray-100" />
                  </div>
                ))}
                {dayBlocked.map(bt => {
                  const { top, height } = positionBlock(bt.starts_at, bt.ends_at)
                  return (
                    <div key={bt.id} data-block className="absolute rounded-md bg-red-50 border-l-4 border-red-400 px-2 py-1 group" style={{ top, height, left: '3.5rem', right: 4 }}>
                      <p className="text-xs font-semibold text-red-700 truncate">{format(parseISO(bt.starts_at), 'HH:mm')}–{format(parseISO(bt.ends_at), 'HH:mm')} Block Time{bt.reason ? `: ${bt.reason}` : ''}</p>
                      <button onClick={() => handleDeleteBlock(bt.id)} className="absolute top-1 right-1 hidden group-hover:block text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  )
                })}
                {dayAppts.map(a => {
                  const { top, height } = positionBlock(a.starts_at, a.ends_at)
                  const c = a.status === 'completed' ? '#6b7280' : color
                  const isPaid = a.payment_status === 'paid_in_full'
                  return (
                    <div key={a.id} onClick={() => { const full = [...todayAppts, ...upcomingAppts].find(x => x.id === a.id); if (full) openDetail(full) }}
                      data-block
                      className="absolute rounded-md px-2 py-1 cursor-pointer hover:brightness-95 transition-colors"
                      style={{ top, height, left: '3.5rem', right: 4, backgroundColor: `${c}22`, borderLeft: `3px solid ${c}` }}>
                      <p className="text-xs font-semibold truncate" style={{ color: c }}>{format(parseISO(a.starts_at), 'HH:mm')}–{format(parseISO(a.ends_at), 'HH:mm')} {a.service?.name}</p>
                      <p className="text-xs text-gray-600 truncate">{a.customer?.name}</p>
                      {isPaid && <CheckCircle2 className="h-3 w-3 text-green-600 absolute top-1 right-1" />}
                    </div>
                  )
                })}
                {dayAppts.length === 0 && dayBlocked.length === 0 && (
                  <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">No appointments</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REVIEWS ── */}
      {activeSection === 'reviews' && (
        <div>
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">My Reviews</h1>
            {avgRating && <p className="text-sm text-gray-500 mt-0.5">{avgRating} ★ average across {approvedReviews.length} published review{approvedReviews.length !== 1 ? 's' : ''}</p>}
          </div>
          {reviewsLoading ? <FullPageSpinner /> : reviews.length === 0 ? (
            <Card padding="md" className="text-center py-16"><p className="text-gray-400 text-sm">No reviews yet.</p></Card>
          ) : (
            <div className="space-y-3">
              {reviews.map(r => (
                <Card key={r.id} padding="md" className={!r.is_approved ? 'opacity-60' : ''}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold text-sm text-gray-900">{r.reviewer_name}</p>
                        <StarRating n={r.rating} />
                        {!r.is_approved && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending approval</span>}
                      </div>
                      {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}
                      <p className="text-xs text-gray-400 mt-1">{format(parseISO(r.created_at), 'd MMM yyyy')}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CLIENTS ── */}
      {activeSection === 'clients' && (
        <div>
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">My Clients</h1>
            <p className="text-sm text-gray-500 mt-0.5">{clients.length} client{clients.length !== 1 ? 's' : ''} seen</p>
          </div>
          {clientsLoading ? <FullPageSpinner /> : clients.length === 0 ? (
            <Card padding="md" className="text-center py-16"><p className="text-gray-400 text-sm">No clients yet.</p></Card>
          ) : (
            <div className="space-y-2">
              {clients.map(c => (
                <Card key={c.customer_id} padding="sm" className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-sm font-bold text-gray-500">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.email}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{c.visits}</p>
                      <p className="text-xs text-gray-400">visit{c.visits !== 1 ? 's' : ''}</p>
                    </div>
                    {c.upcoming > 0 && (
                      <div>
                        <p className="text-lg font-bold" style={{ color }}>{c.upcoming}</p>
                        <p className="text-xs text-gray-400">upcoming</p>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Booking detail modal ── */}
      <Modal open={!!selected} onClose={() => { setSelected(null); setEditMode(false) }} title={selected?.service?.name ?? 'Appointment'} size="sm">
        {selected && (
          <div className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Customer</dt><dd className="font-medium text-gray-900">{selected.customer?.name}</dd></div>
              {selected.customer?.phone && <div className="flex justify-between"><dt className="text-gray-500">Phone</dt><dd className="text-gray-700">{selected.customer.phone}</dd></div>}
              <div className="flex justify-between"><dt className="text-gray-500">Time</dt><dd className="font-medium" style={{ color }}>{format(parseISO(selected.starts_at), 'EEE d MMM, HH:mm')} – {format(parseISO(selected.ends_at), 'HH:mm')}</dd></div>
              {selected.resource && <div className="flex justify-between"><dt className="text-gray-500">Room</dt><dd className="text-gray-700">{selected.resource.name}</dd></div>}
              {selected.equipment_resource && <div className="flex justify-between"><dt className="text-gray-500">Equipment</dt><dd className="text-gray-700">{selected.equipment_resource.name}</dd></div>}
              {selected.notes && <div className="flex justify-between gap-4"><dt className="text-gray-500 shrink-0">Notes</dt><dd className="text-gray-700 text-right text-xs">{selected.notes}</dd></div>}
              <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd><Badge variant={statusBadgeVariant(selected.status as never)} className="capitalize">{selected.status}</Badge></dd></div>
              <div className="flex justify-between items-center">
                <dt className="text-gray-500">Payment</dt>
                <dd className="flex items-center gap-1.5">
                  {selected.payment_status === 'paid_in_full' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  <span className={`text-xs capitalize font-medium ${selected.payment_status === 'paid_in_full' ? 'text-green-700' : 'text-gray-600'}`}>{selected.payment_status.replaceAll('_', ' ')}</span>
                </dd>
              </div>
            </dl>
            {editMode ? (
              <div className="space-y-3">
                <Textarea label="Notes" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Add notes…" />
                {resources.length > 0 && (
                  <div><label className="text-sm font-medium text-gray-700 mb-1 block">Room</label>
                    <select value={editResourceId ?? ''} onChange={e => setEditResourceId(e.target.value || null)} className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)">
                      <option value="">No room assigned</option>
                      {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                )}
                {equipmentResources.length > 0 && (
                  <div><label className="text-sm font-medium text-gray-700 mb-1 block">Equipment</label>
                    <select value={editEquipmentResourceId ?? ''} onChange={e => setEditEquipmentResourceId(e.target.value || null)} className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)">
                      <option value="">No equipment</option>
                      {equipmentResources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditMode(false)} className="shrink-0">Cancel</Button>
                  <Button fullWidth size="sm" loading={editSaving} onClick={() => handleSaveEdit(selected.id)}>Save Changes</Button>
                </div>
              </div>
            ) : (
              <>
                {selected.payment_status !== 'paid_in_full' && (
                  <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Payment</p>
                    {selected.customer?.sumup_card_token && (
                      <>
                        <div className="flex gap-2">
                          <select value={chargeType} onChange={e => setChargeType(e.target.value as 'balance' | 'noshow')} className="h-9 flex-1 px-2 text-xs border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-(--color-primary)">
                            <option value="balance">Balance</option><option value="noshow">No-show fee</option>
                          </select>
                          <div className="relative w-24 shrink-0">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">£</span>
                            <input type="number" min="0" step="0.01" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} placeholder="0.00" className="w-full h-9 pl-5 pr-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)" />
                          </div>
                        </div>
                        <Button fullWidth size="sm" loading={charging} disabled={!chargeAmount} onClick={() => handleChargeBalance(selected.id)}>Charge Saved Card</Button>
                        {chargeError && <p className="text-xs text-red-600">{chargeError}</p>}
                        {chargeSuccess && <p className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Charged</p>}
                        <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div><div className="relative flex justify-center"><span className="text-xs text-gray-400 bg-white px-2">or</span></div></div>
                      </>
                    )}
                    <Button fullWidth size="sm" variant="secondary" loading={charging} onClick={() => handleMarkAsPaid(selected.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark as Paid (Cash / Other)
                    </Button>
                  </div>
                )}
                {activityLog.length > 0 && (
                  <div className="border border-gray-100 rounded-lg p-3 space-y-2 max-h-36 overflow-y-auto">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">History</p>
                    {activityLog.map(e => (
                      <div key={e.id} className="text-xs border-l-2 border-gray-200 pl-2">
                        <p className="text-gray-700">{e.summary}</p>
                        {e.reason && <p className="text-gray-400 italic">"{e.reason}"</p>}
                        <p className="text-gray-400">{e.actor_name} · {format(parseISO(e.created_at), 'd MMM HH:mm')}</p>
                      </div>
                    ))}
                  </div>
                )}
                {cancelOpen ? (
                  <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-red-800">Reason for cancellation (required)</p>
                    <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Customer requested…" rows={2} />
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setCancelOpen(false); setCancelReason('') }} className="shrink-0">Back</Button>
                      <Button fullWidth variant="danger" size="sm" loading={actionLoading} disabled={!cancelReason.trim()} onClick={() => handleCancelWithReason(selected.id)}>Confirm</Button>
                    </div>
                  </div>
                ) : (selected.status === 'confirmed' || selected.status === 'pending') && (
                  <div className="space-y-2">
                    {selected.checked_in_at ? (
                      <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <UserCheck className="h-4 w-4 shrink-0" /> Checked in at {format(parseISO(selected.checked_in_at), 'HH:mm')}
                      </div>
                    ) : (
                      <Button fullWidth size="sm" loading={actionLoading} onClick={() => handleCheckIn(selected.id)} style={{ backgroundColor: color }}>
                        <UserCheck className="h-4 w-4" /> Check In Customer
                      </Button>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditMode(true)} className="shrink-0"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      <Button fullWidth size="sm" variant="secondary" loading={actionLoading} onClick={() => handleComplete(selected.id)} className="text-green-700! border-green-200! hover:bg-green-50!">
                        <CheckCircle2 className="h-4 w-4" /> Complete
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}><XCircle className="h-4 w-4" /> Cancel</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Cell click popover */}
      {cellPopover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCellPopover(null)} />
          <div className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-44"
            style={{ top: cellPopover.y + 6, left: Math.min(cellPopover.x, window.innerWidth - 180) }}>
            <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-100 mb-1">
              {cellPopover.time} · {format(calDay, 'd MMM')}
            </p>
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => { setNbTime(cellPopover.time); setNbForm({ name: '', email: '', phone: '', serviceId: calServices[0]?.id ?? '', resourceId: '', equipmentResourceId: '', notes: '' }); setNbError(''); setNbOpen(true); setCellPopover(null) }}
            >
              <CalendarClock className="h-4 w-4 text-gray-400" /> New Booking
            </button>
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => { setBlockForm(f => ({ ...f, startDate: format(calDay, 'yyyy-MM-dd'), endDate: format(calDay, 'yyyy-MM-dd'), startTime: cellPopover.time })); setBlockError(''); setBlockOpen(true); setCellPopover(null) }}
            >
              <XCircle className="h-4 w-4 text-gray-400" /> Block Time
            </button>
          </div>
        </>
      )}

      {/* New Booking modal */}
      <Modal open={nbOpen} onClose={() => setNbOpen(false)} title={`New Booking · ${nbTime}`} size="sm">
        <div className="space-y-3">
          <Input label="Customer name" value={nbForm.name} onChange={e => setNbForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" required />
          <Input label="Email" type="email" value={nbForm.email} onChange={e => setNbForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" required />
          <Input label="Phone (optional)" value={nbForm.phone} onChange={e => setNbForm(f => ({ ...f, phone: e.target.value }))} placeholder="+44..." />
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Service</label>
            <select value={nbForm.serviceId} onChange={e => setNbForm(f => ({ ...f, serviceId: e.target.value }))} className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)">
              <option value="">Select a service…</option>
              {calServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {resources.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Room</label>
              <select value={nbForm.resourceId} onChange={e => setNbForm(f => ({ ...f, resourceId: e.target.value }))} className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)">
                <option value="">Auto-assign room</option>
                {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          {equipmentResources.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Equipment</label>
              <select value={nbForm.equipmentResourceId} onChange={e => setNbForm(f => ({ ...f, equipmentResourceId: e.target.value }))} className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)">
                <option value="">No equipment</option>
                {equipmentResources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <Textarea label="Notes (optional)" value={nbForm.notes} onChange={e => setNbForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any relevant notes…" />
          {nbError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{nbError}</p>}
          <Button fullWidth loading={nbSaving} onClick={handleCreateBooking}>Confirm Booking</Button>
        </div>
      </Modal>

      {/* Block Time modal */}
      <Modal open={blockOpen} onClose={() => { setBlockOpen(false); setBlockError('') }} title="Block Time" size="sm">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start date"
              type="date"
              value={blockForm.startDate}
              onChange={e => setBlockForm(f => ({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))}
            />
            <Input
              label="End date"
              type="date"
              min={blockForm.startDate}
              value={blockForm.endDate}
              onChange={e => setBlockForm(f => ({ ...f, endDate: e.target.value }))}
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={blockForm.allDay}
              onChange={e => setBlockForm(f => ({ ...f, allDay: e.target.checked }))}
              className="h-4 w-4 accent-(--color-primary)"
            />
            <span className="text-sm font-medium text-gray-700">All day</span>
          </label>

          {!blockForm.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" type="time" value={blockForm.startTime} onChange={e => setBlockForm(f => ({ ...f, startTime: e.target.value }))} />
              <Input label="Until" type="time" value={blockForm.endTime} onChange={e => setBlockForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
          )}

          <Input label="Reason (optional)" value={blockForm.reason} onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Holiday, training, lunch…" />
          {blockError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{blockError}</p>}
          <Button fullWidth loading={blockSaving} disabled={!blockForm.startDate} onClick={handleAddBlock}>
            Block Time
          </Button>
        </div>
      </Modal>
    </StaffLayout>
  )
}

function ApptCard({ appt: a, onClick, compact }: { appt: Appt; onClick: () => void; compact?: boolean }) {
  const startsAt = parseISO(a.starts_at)
  const isPaid = a.payment_status === 'paid_in_full'
  const dateLabel = isToday(startsAt) ? null : isTomorrow(startsAt) ? 'Tomorrow' : format(startsAt, 'EEE d MMM')
  return (
    <Card padding="sm" className="flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <div className="w-16 text-center shrink-0">
        {dateLabel && <p className="text-xs text-gray-400 mb-0.5">{dateLabel}</p>}
        <p className="font-bold text-sm" style={{ color: 'var(--color-primary)' }}>{format(startsAt, 'HH:mm')}</p>
        {!compact && <p className="text-xs text-gray-400">{format(parseISO(a.ends_at), 'HH:mm')}</p>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{a.customer?.name ?? 'Customer'}</p>
        <p className="text-xs text-gray-500 truncate">
          {a.service?.name}{!compact && a.service && ` · ${formatDuration(a.service.duration_minutes)}`}{a.resource && ` · ${a.resource.name}`}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isPaid && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        {a.checked_in_at && <span className="text-white rounded-lg p-1" style={{ backgroundColor: 'var(--color-primary)' }}><UserCheck className="h-3.5 w-3.5" /></span>}
        <Badge variant={statusBadgeVariant(a.status as never)} className="capitalize hidden sm:block">{a.status}</Badge>
        <span className="text-gray-300 text-xs">›</span>
      </div>
    </Card>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}
