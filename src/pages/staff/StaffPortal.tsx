import { useCallback, useEffect, useState } from 'react'
import { format, startOfDay, endOfDay, addDays, isToday, isTomorrow, parseISO } from 'date-fns'
import {
  CalendarClock, Clock, UserCheck, CheckCircle2, XCircle, Pencil, CreditCard,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatDuration } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { StaffLayout } from '@/components/layout/StaffLayout'
import type { Resource } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type Appt = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  notes: string | null
  resource_id: string | null
  checked_in_at: string | null
  payment_status: string
  deposit_charged: number
  discount_amount: number
  gift_voucher_amount: number
  customer: { name: string; phone: string | null; email: string; sumup_card_token: string | null } | null
  service: { name: string; duration_minutes: number; price: number } | null
  resource: { name: string } | null
}

type ActivityEntry = {
  id: string
  actor_name: string
  summary: string
  reason: string | null
  created_at: string
}

export default function StaffPortal() {
  const { staffId } = useAuthStore()
  const [staffName, setStaffName] = useState('')
  const [todayAppts, setTodayAppts] = useState<Appt[]>([])
  const [upcomingAppts, setUpcomingAppts] = useState<Appt[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)

  // Booking detail modal
  const [selected, setSelected] = useState<Appt | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editResourceId, setEditResourceId] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  // Cancel with reason
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  // Charge balance
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeType, setChargeType] = useState<'balance' | 'noshow'>('balance')
  const [charging, setCharging] = useState(false)
  const [chargeError, setChargeError] = useState('')
  const [chargeSuccess, setChargeSuccess] = useState(false)

  // Activity log
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([])

  useEffect(() => {
    if (!staffId) return
    async function load() {
      const [staffRes, apptRes, resRes] = await Promise.all([
        supabase.from('staff').select('name').eq('id', staffId).single(),
        supabase
          .from('bookings')
          .select('id, starts_at, ends_at, status, notes, resource_id, checked_in_at, payment_status, deposit_charged, discount_amount, gift_voucher_amount, customer:customers(name,phone,email,sumup_card_token), service:services(name,duration_minutes,price), resource:resources(name)')
          .eq('business_id', BUSINESS_ID)
          .eq('staff_id', staffId)
          .neq('status', 'cancelled')
          .gte('starts_at', startOfDay(new Date()).toISOString())
          .lte('starts_at', endOfDay(addDays(new Date(), 6)).toISOString())
          .order('starts_at'),
        supabase.from('resources').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).eq('resource_type', 'room').order('name'),
      ])
      if (staffRes.data) setStaffName(staffRes.data.name)
      const all = (apptRes.data ?? []) as unknown as Appt[]
      setTodayAppts(all.filter(a => isToday(parseISO(a.starts_at))))
      setUpcomingAppts(all.filter(a => !isToday(parseISO(a.starts_at))))
      if (resRes.data) setResources(resRes.data as Resource[])
      setLoading(false)
    }
    load()
  }, [staffId])

  const refreshActivityLog = useCallback(async (bookingId: string) => {
    const { data } = await supabase
      .from('booking_activity_log')
      .select('id, actor_name, summary, reason, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
    if (data) setActivityLog(data as ActivityEntry[])
  }, [])

  function openDetail(a: Appt) {
    setSelected(a)
    setEditMode(false)
    setEditNotes(a.notes ?? '')
    setEditResourceId(a.resource_id ?? null)
    setCancelOpen(false)
    setCancelReason('')
    const remaining = (a.service?.price ?? 0) - (a.discount_amount ?? 0) - (a.gift_voucher_amount ?? 0) - (a.deposit_charged ?? 0)
    setChargeAmount(remaining > 0 ? (remaining / 100).toFixed(2) : '')
    setChargeType('balance')
    setChargeError('')
    setChargeSuccess(false)
    setActivityLog([])
    refreshActivityLog(a.id)
  }

  function updateLocal(id: string, patch: Partial<Appt>) {
    const update = (prev: Appt[]) => prev.map(a => a.id === id ? { ...a, ...patch } : a)
    setTodayAppts(update)
    setUpcomingAppts(update)
    setSelected(prev => prev?.id === id ? { ...prev, ...patch } : prev)
  }

  async function handleCheckIn(id: string) {
    setActionLoading(true)
    const checkedInAt = new Date().toISOString()
    await supabase.from('bookings').update({ checked_in_at: checkedInAt }).eq('id', id)
    updateLocal(id, { checked_in_at: checkedInAt })
    await refreshActivityLog(id)
    setActionLoading(false)
  }

  async function handleComplete(id: string) {
    setActionLoading(true)
    await supabase.from('bookings').update({ status: 'completed' }).eq('id', id)
    updateLocal(id, { status: 'completed' })
    await refreshActivityLog(id)
    setActionLoading(false)
  }

  async function handleCancelWithReason(id: string) {
    if (!cancelReason.trim()) return
    setActionLoading(true)
    await supabase.from('bookings').update({ status: 'cancelled', cancellation_reason: cancelReason.trim() }).eq('id', id)
    setTodayAppts(p => p.filter(a => a.id !== id))
    setUpcomingAppts(p => p.filter(a => a.id !== id))
    setSelected(null)
    setCancelOpen(false)
    setCancelReason('')
    setActionLoading(false)
  }

  async function handleSaveEdit(id: string) {
    setEditSaving(true)
    const matchedResource = resources.find(r => r.id === editResourceId) ?? null
    await supabase.from('bookings').update({ notes: editNotes.trim() || null, resource_id: editResourceId }).eq('id', id)
    updateLocal(id, { notes: editNotes.trim() || null, resource_id: editResourceId, resource: matchedResource ? { name: matchedResource.name } : null })
    await refreshActivityLog(id)
    setEditMode(false)
    setEditSaving(false)
  }

  async function handleChargeBalance(id: string) {
    const amountPence = Math.round(parseFloat(chargeAmount) * 100)
    if (!amountPence || amountPence <= 0) { setChargeError('Enter a valid amount'); return }
    setCharging(true)
    setChargeError('')
    setChargeSuccess(false)
    const { data, error } = await supabase.functions.invoke('sumup-charge-balance', {
      body: { booking_id: id, amount: amountPence, type: chargeType },
    })
    if (error || !data?.success) {
      setChargeError((data as { error?: string } | null)?.error ?? error?.message ?? 'Charge failed')
    } else {
      setChargeSuccess(true)
      updateLocal(id, { payment_status: 'paid_in_full' })
      await refreshActivityLog(id)
    }
    setCharging(false)
  }

  async function handleMarkAsPaid(id: string) {
    setCharging(true)
    await supabase.from('bookings').update({ payment_status: 'paid_in_full', balance_charged_at: new Date().toISOString() }).eq('id', id)
    updateLocal(id, { payment_status: 'paid_in_full' })
    await refreshActivityLog(id)
    setCharging(false)
  }

  if (loading) return <StaffLayout staffName=""><FullPageSpinner /></StaffLayout>

  return (
    <StaffLayout staffName={staffName}>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Good {greeting()}, {staffName.split(' ')[0]}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
      </div>

      {/* Today */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Today</h2>
          <span className="text-xs text-gray-400 ml-auto">{todayAppts.length} appointment{todayAppts.length !== 1 ? 's' : ''}</span>
        </div>
        {todayAppts.length === 0 ? (
          <Card padding="md" className="text-center py-10">
            <p className="text-gray-400 text-sm">No appointments today — enjoy your day!</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {todayAppts.map(a => (
              <ApptCard key={a.id} appt={a} onClick={() => openDetail(a)} />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming */}
      {upcomingAppts.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Coming up</h2>
          </div>
          <div className="space-y-2">
            {upcomingAppts.map(a => (
              <ApptCard key={a.id} appt={a} onClick={() => openDetail(a)} compact />
            ))}
          </div>
        </section>
      )}

      {/* Booking detail modal */}
      <Modal open={!!selected} onClose={() => { setSelected(null); setEditMode(false) }} title={selected?.service?.name ?? 'Appointment'} size="sm">
        {selected && (
          <div className="space-y-4">
            {/* Info */}
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Customer</dt>
                <dd className="font-medium text-gray-900">{selected.customer?.name}</dd>
              </div>
              {selected.customer?.phone && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="text-gray-700">{selected.customer.phone}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Time</dt>
                <dd className="font-medium" style={{ color: 'var(--color-primary)' }}>
                  {format(parseISO(selected.starts_at), 'EEE d MMM, HH:mm')} – {format(parseISO(selected.ends_at), 'HH:mm')}
                </dd>
              </div>
              {selected.resource && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Room</dt>
                  <dd className="text-gray-700">{selected.resource.name}</dd>
                </div>
              )}
              {selected.notes && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0">Notes</dt>
                  <dd className="text-gray-700 text-right text-xs">{selected.notes}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Status</dt>
                <dd><Badge variant={statusBadgeVariant(selected.status as never)} className="capitalize">{selected.status}</Badge></dd>
              </div>
            </dl>

            {/* Edit mode */}
            {editMode ? (
              <div className="space-y-3">
                <Textarea label="Notes" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Add notes…" />
                {resources.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Room</label>
                    <select
                      value={editResourceId ?? ''}
                      onChange={e => setEditResourceId(e.target.value || null)}
                      className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                    >
                      <option value="">No room assigned</option>
                      {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
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
                {/* Payment — show for any appointment that isn't fully paid */}
                {selected.payment_status !== 'paid_in_full' && (
                  <div className="border border-gray-100 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5" /> Payment
                      <span className="ml-auto font-normal capitalize text-gray-400">{selected.payment_status.replaceAll('_', ' ')}</span>
                    </p>

                    {/* Charge saved card */}
                    {selected.customer?.sumup_card_token && (
                      <>
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
                              type="number" min="0" step="0.01" value={chargeAmount}
                              onChange={e => setChargeAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full h-9 pl-5 pr-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                            />
                          </div>
                        </div>
                        <Button fullWidth size="sm" loading={charging} disabled={!chargeAmount} onClick={() => handleChargeBalance(selected.id)}>
                          Charge Saved Card
                        </Button>
                        {chargeError && <p className="text-xs text-red-600">{chargeError}</p>}
                        {chargeSuccess && <p className="text-xs text-green-700 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Charged successfully</p>}
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
                          <div className="relative flex justify-center"><span className="text-xs text-gray-400 bg-white px-2">or</span></div>
                        </div>
                      </>
                    )}

                    {/* Mark as paid (cash / in-person card reader / other) */}
                    <Button fullWidth size="sm" variant="secondary" loading={charging} onClick={() => handleMarkAsPaid(selected.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mark as Paid (Cash / Other)
                    </Button>
                  </div>
                )}

                {/* Activity log */}
                {activityLog.length > 0 && (
                  <div className="border border-gray-100 rounded-lg p-3 space-y-2 max-h-36 overflow-y-auto">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">History</p>
                    {activityLog.map(entry => (
                      <div key={entry.id} className="text-xs border-l-2 border-gray-200 pl-2">
                        <p className="text-gray-700">{entry.summary}</p>
                        {entry.reason && <p className="text-gray-400 italic">"{entry.reason}"</p>}
                        <p className="text-gray-400">{entry.actor_name} · {format(parseISO(entry.created_at), 'd MMM HH:mm')}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                {cancelOpen ? (
                  <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-red-800">Reason for cancellation (required)</p>
                    <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Customer requested…" rows={2} />
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setCancelOpen(false); setCancelReason('') }} className="shrink-0">Back</Button>
                      <Button fullWidth variant="danger" size="sm" loading={actionLoading} disabled={!cancelReason.trim()} onClick={() => handleCancelWithReason(selected.id)}>
                        Confirm Cancellation
                      </Button>
                    </div>
                  </div>
                ) : (selected.status === 'confirmed' || selected.status === 'pending') && (
                  <div className="space-y-2">
                    {/* Check-in */}
                    {selected.checked_in_at ? (
                      <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <UserCheck className="h-4 w-4 shrink-0" />
                        Checked in at {format(parseISO(selected.checked_in_at), 'HH:mm')}
                      </div>
                    ) : (
                      <Button fullWidth size="sm" loading={actionLoading} onClick={() => handleCheckIn(selected.id)} style={{ backgroundColor: 'var(--color-primary)' }}>
                        <UserCheck className="h-4 w-4" /> Check In Customer
                      </Button>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditMode(true)} className="shrink-0">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button fullWidth size="sm" variant="secondary" loading={actionLoading} onClick={() => handleComplete(selected.id)} className="text-green-700! border-green-200! hover:bg-green-50!">
                        <CheckCircle2 className="h-4 w-4" /> Complete
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>
                        <XCircle className="h-4 w-4" /> Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </StaffLayout>
  )
}

function ApptCard({ appt: a, onClick, compact }: { appt: Appt; onClick: () => void; compact?: boolean }) {
  const startsAt = parseISO(a.starts_at)
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
          {a.service?.name}
          {!compact && a.service && ` · ${formatDuration(a.service.duration_minutes)}`}
          {a.resource && ` · ${a.resource.name}`}
        </p>
        {a.customer?.phone && !compact && <p className="text-xs text-gray-400">{a.customer.phone}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {a.checked_in_at && (
          <span className="text-white rounded-lg p-1.5" style={{ backgroundColor: 'var(--color-primary)' }}>
            <UserCheck className="h-4 w-4" />
          </span>
        )}
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
