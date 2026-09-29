import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Download, Gift, CheckCircle2, CreditCard, History, UserCheck, ClipboardList, Mail, PenTool, StickyNote, Save, Cake, Phone as PhoneIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadFormAlertSet, checkBookingForm, type BookingFormStatus } from '@/lib/formAlerts'
import { AdminFormFiller } from '@/components/FormFiller'
import { formatCurrency } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Input'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Booking, BookingStatus, Resource } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string
const PAGE_SIZE = 20

type ExtBooking = Omit<Booking, 'staff' | 'service' | 'customer'> & {
  service: { name: string; price: number }
  staff: { name: string } | null
  customer: { name: string; email: string; phone: string | null; date_of_birth: string | null; internal_notes: string | null; sumup_card_token: string | null }
  resource: { name: string } | null
  payment_status: string
  deposit_charged: number
  checked_in_at: string | null
}

function bookingPrice(b: { price_override?: number | null; service?: { price: number } | null }): number {
  return b.price_override ?? b.service?.price ?? 0
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

export default function AdminBookings() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState<ExtBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all')
  const [selectedBooking, setSelectedBooking] = useState<ExtBooking | null>(null)
  const [updating, setUpdating] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [resources, setResources] = useState<Resource[]>([])
  const [assigningResource, setAssigningResource] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherApplying, setVoucherApplying] = useState(false)
  const [voucherRemoving, setVoucherRemoving] = useState(false)
  const [voucherError, setVoucherError] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeType, setChargeType] = useState<'balance' | 'noshow'>('balance')
  const [charging, setCharging] = useState(false)
  const [chargeError, setChargeError] = useState('')
  const [chargeSuccess, setChargeSuccess] = useState(false)
  const [cancelReasonOpen, setCancelReasonOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [activityLogOpen, setActivityLogOpen] = useState(false)
  const [formAlerts, setFormAlerts] = useState<Set<string>>(new Set())
  const [selectedBookingForm, setSelectedBookingForm] = useState<BookingFormStatus | null>(null)
  const [fillFormTarget, setFillFormTarget] = useState<{ id: string; title: string } | null>(null)
  // Staff-only notes — separate from the customer's own booking notes, never shown to the customer
  const [bookingNotesDraft, setBookingNotesDraft] = useState('')
  const [bookingNotesSaving, setBookingNotesSaving] = useState(false)

  useEffect(() => {
    setPage(0)
    setBookings([])
    fetchBookings(0, true)
  }, [statusFilter])

  useEffect(() => {
    supabase
      .from('resources')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .eq('is_active', true)
      .eq('resource_type', 'room')
      .order('name')
      .then(({ data }) => { if (data) setResources(data as Resource[]) })
  }, [])

  async function fetchBookings(pageNum: number, reset = false) {
    setLoading(true)
    let query = supabase
      .from('bookings')
      .select('*, service:services(name,price), staff:staff(name), customer:customers(name,email,phone,date_of_birth,internal_notes,sumup_card_token), resource:resources!resource_id(name)')
      .eq('business_id', BUSINESS_ID)
      .order('starts_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)

    const { data, error } = await query
    if (error) {
      setFetchError(`Failed to load bookings: ${error.message}`)
    } else {
      setFetchError(null)
      const incoming = (data ?? []) as ExtBooking[]
      setBookings((prev) => (reset ? incoming : [...prev, ...incoming]))
      setHasMore(incoming.length === PAGE_SIZE)
      loadFormAlertSet(BUSINESS_ID, incoming as Array<{ id: string; service_id: string; customer_id: string; created_at: string }>)
        .then(newAlerts => setFormAlerts(prev => reset ? newAlerts : new Set([...prev, ...newAlerts])))
    }
    setLoading(false)
  }

  async function updateStatus(bookingId: string, status: BookingStatus) {
    setUpdating(true)
    await supabase.from('bookings').update({ status }).eq('id', bookingId)
    setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status } : b)))
    if (selectedBooking?.id === bookingId) setSelectedBooking((b) => b ? { ...b, status } : b)
    await refreshActivityLog(bookingId)
    setUpdating(false)
  }

  async function handleCheckIn(bookingId: string) {
    const checkedInAt = new Date().toISOString()
    await supabase.from('bookings').update({ checked_in_at: checkedInAt }).eq('id', bookingId)
    setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, checked_in_at: checkedInAt } : b)))
    setSelectedBooking((b) => (b ? { ...b, checked_in_at: checkedInAt } : b))
  }

  async function handleUnmarkCheckIn(bookingId: string) {
    await supabase.from('bookings').update({ checked_in_at: null }).eq('id', bookingId)
    setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, checked_in_at: null } : b)))
    setSelectedBooking((b) => (b ? { ...b, checked_in_at: null } : b))
    await refreshActivityLog(bookingId)
  }


  async function handleCancelWithReason(bookingId: string) {
    if (!cancelReason.trim()) return
    setUpdating(true)
    await supabase.from('bookings').update({ status: 'cancelled', cancellation_reason: cancelReason.trim() }).eq('id', bookingId)
    setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' } : b)))
    setSelectedBooking((b) => (b ? { ...b, status: 'cancelled' } : b))
    setCancelReasonOpen(false)
    setCancelReason('')
    await refreshActivityLog(bookingId)
    setUpdating(false)
  }

  async function assignResource(bookingId: string, resourceId: string | null) {
    setAssigningResource(true)
    await supabase.from('bookings').update({ resource_id: resourceId }).eq('id', bookingId)
    const matchedResource = resources.find((r) => r.id === resourceId) ?? null
    const resourceObj = matchedResource ? { name: matchedResource.name } : null
    setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, resource_id: resourceId, resource: resourceObj } : b))
    if (selectedBooking?.id === bookingId) setSelectedBooking((b) => b ? { ...b, resource_id: resourceId, resource: resourceObj } : b)
    await refreshActivityLog(bookingId)
    setAssigningResource(false)
  }

  async function applyVoucher(bookingId: string) {
    if (!voucherCode.trim()) return
    setVoucherApplying(true)
    setVoucherError('')
    const { data, error } = await supabase.rpc('apply_gift_voucher_to_booking', {
      p_booking_id: bookingId,
      p_code: voucherCode.trim(),
      p_business_id: BUSINESS_ID,
    })
    if (error) {
      setVoucherError(error.message)
    } else {
      const result = data as { voucher_amount: number }
      setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, gift_voucher_amount: result.voucher_amount } : b))
      setSelectedBooking((b) => b ? { ...b, gift_voucher_amount: result.voucher_amount } : b)
      setVoucherCode('')
      await refreshActivityLog(bookingId)
    }
    setVoucherApplying(false)
  }

  async function removeVoucher(bookingId: string) {
    setVoucherRemoving(true)
    await supabase.rpc('remove_gift_voucher_from_booking', { p_booking_id: bookingId })
    setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, gift_voucher_amount: 0, gift_voucher_id: null } : b))
    setSelectedBooking((b) => b ? { ...b, gift_voucher_amount: 0, gift_voucher_id: null } : b)
    await refreshActivityLog(bookingId)
    setVoucherRemoving(false)
  }

  async function refreshActivityLog(bookingId: string) {
    const { data } = await supabase
      .from('booking_activity_log')
      .select('id, actor_type, actor_name, action, summary, reason, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
    if (data) setActivityLog(data as ActivityLogEntry[])
  }

  function openBooking(b: ExtBooking) {
    setSelectedBooking(b)
    setSelectedBookingForm(null)
    setBookingNotesDraft(b.internal_notes ?? '')
    const remaining = bookingPrice(b) - (b.discount_amount ?? 0) - (b.gift_voucher_amount ?? 0) - (b.deposit_charged ?? 0)
    setChargeAmount(remaining > 0 ? (remaining / 100).toFixed(2) : '')
    setChargeType('balance')
    setChargeError('')
    setChargeSuccess(false)
    setCancelReasonOpen(false)
    setCancelReason('')
    setActivityLog([])
    setActivityLogOpen(false)
    refreshActivityLog(b.id)
    checkBookingForm(b.service_id, b.customer_id, b.id, b.created_at).then(setSelectedBookingForm)
  }

  function sendFormReminder(form: { id: string; title: string }) {
    if (!selectedBooking?.customer?.email) return
    const link = `${window.location.origin}/forms/${form.id}?bookingId=${selectedBooking.id}`
    const subject = `Please complete: ${form.title}`
    const body = `Hi ${selectedBooking.customer?.name ?? ''},\n\nBefore your appointment on ${format(parseISO(selectedBooking.starts_at), 'EEEE d MMMM')} at ${format(parseISO(selectedBooking.starts_at), 'HH:mm')}, please complete the following form:\n\n${form.title}\n${link}\n\nThanks!`
    window.location.href = `mailto:${selectedBooking.customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  async function handleSaveBookingNotes() {
    if (!selectedBooking) return
    setBookingNotesSaving(true)
    const value = bookingNotesDraft.trim() || null
    const { error } = await supabase.from('bookings').update({ internal_notes: value }).eq('id', selectedBooking.id)
    if (!error) {
      setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, internal_notes: value } : b))
      setSelectedBooking(prev => prev ? { ...prev, internal_notes: value } : null)
    }
    setBookingNotesSaving(false)
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
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, payment_status: 'paid_in_full' } : b)))
      setSelectedBooking((b) => (b ? { ...b, payment_status: 'paid_in_full' } : b))
      await refreshActivityLog(bookingId)
    }
    setCharging(false)
  }

  function exportCSV() {
    const header = ['ID', 'Date', 'Time', 'Customer', 'Email', 'Service', 'Staff', 'Status', 'Price']
    const rows = bookings.map((b) => [
      b.id.slice(0, 8),
      format(parseISO(b.starts_at), 'yyyy-MM-dd'),
      format(parseISO(b.starts_at), 'HH:mm'),
      b.customer?.name,
      b.customer?.email,
      b.service?.name,
      b.staff?.name ?? 'N/A',
      b.status,
      b.service ? (bookingPrice(b) / 100).toFixed(2) : '0.00',
    ])
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'bookings.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const statuses: Array<BookingStatus | 'all'> = ['all', 'confirmed', 'pending', 'completed', 'cancelled']

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Bookings</h1>
        <Button variant="secondary" size="sm" onClick={exportCSV}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`flex-shrink-0 px-3 py-1.5 text-sm font-medium rounded-full border transition-colors capitalize ${
              statusFilter === s
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {/* Mobile cards — hidden on desktop */}
      <div className="sm:hidden bg-white border border-gray-200 brand-card overflow-hidden divide-y divide-gray-100">
        {loading && bookings.length === 0 ? (
          <div className="py-12 flex justify-center"><FullPageSpinner /></div>
        ) : fetchError ? (
          <div className="p-4 text-center"><p className="text-red-500 text-sm">{fetchError}</p></div>
        ) : bookings.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No bookings found.</div>
        ) : bookings.map((b) => (
          <button key={b.id} onClick={() => openBooking(b)} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{b.customer?.name}</p>
                <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                  {formAlerts.has(b.id) && <ClipboardList className="h-3 w-3 text-amber-500 shrink-0" />}
                  {b.service?.name} · {b.staff?.name ?? 'Any'}
                </p>
              </div>
              <Badge variant={statusBadgeVariant(b.status)} className="capitalize shrink-0">{b.status}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{format(parseISO(b.starts_at), 'dd/MM/yyyy HH:mm')}</p>
              <p className="text-sm font-bold text-gray-900">
                {b.service ? formatCurrency(bookingPrice(b) - (b.discount_amount ?? 0) - (b.gift_voucher_amount ?? 0)) : '—'}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop table — hidden on mobile */}
      <div className="hidden sm:block bg-white border border-gray-200 brand-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Date & Time', 'Customer', 'Service', 'Staff', 'Status', 'Price', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && bookings.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center"><FullPageSpinner /></td></tr>
              ) : fetchError ? (
                <tr><td colSpan={7} className="py-12 text-center">
                  <p className="text-red-500 text-sm mb-2">{fetchError}</p>
                  <p className="text-gray-400 text-xs">Try signing out and signing back in to refresh your session.</p>
                </td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400 text-sm">No bookings found.</td></tr>
              ) : bookings.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-medium text-gray-900">{format(parseISO(b.starts_at), 'dd/MM/yyyy')}</p>
                    <p className="text-xs text-gray-500">{format(parseISO(b.starts_at), 'HH:mm')}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 truncate max-w-[140px]">{b.customer?.name}</p>
                    <p className="text-xs text-gray-500 truncate max-w-[140px]">{b.customer?.email}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <p className="font-medium text-gray-900 truncate flex items-center gap-1.5">
                      {formAlerts.has(b.id) && <ClipboardList className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      {b.service?.name}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b.staff?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadgeVariant(b.status)} className="capitalize">
                      {b.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                    {b.service ? formatCurrency(bookingPrice(b) - (b.discount_amount ?? 0) - (b.gift_voucher_amount ?? 0)) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openBooking(b)}
                      className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="p-4 text-center border-t border-gray-100">
            <Button
              variant="ghost"
              size="sm"
              loading={loading}
              onClick={() => { const next = page + 1; setPage(next); fetchBookings(next) }}
            >
              Load More
            </Button>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <Modal
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        title="Booking Detail"
        size="xl"
      >
        {selectedBooking && (
          <div className="flex flex-col lg:flex-row gap-5">
          <div className="flex-1 min-w-0 space-y-4">
            {selectedBookingForm?.needsForm && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <ClipboardList className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800">Health form not completed</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Customer must complete <span className="font-medium">{selectedBookingForm.formTitle}</span> before this session can take place.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {selectedBookingForm.missingForms.map(f => (
                      <div key={f.id} className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-amber-800 font-medium">{f.title}:</span>
                        <button
                          onClick={() => sendFormReminder(f)}
                          disabled={!selectedBooking.customer?.email}
                          title={!selectedBooking.customer?.email ? 'No email on file for this customer' : 'Opens your email app with a pre-filled reminder'}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Mail className="h-3 w-3" /> Send Reminder
                        </button>
                        <button
                          onClick={() => setFillFormTarget(f)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors"
                        >
                          <PenTool className="h-3 w-3" /> Fill Out Now
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Reference', value: selectedBooking.id.slice(0, 8).toUpperCase() },
                { label: 'Status', value: <Badge variant={statusBadgeVariant(selectedBooking.status)} className="capitalize">{selectedBooking.status}</Badge> },
                { label: 'Service', value: selectedBooking.service?.name },
                { label: 'Staff', value: selectedBooking.staff?.name ?? '—' },
                { label: 'Date', value: format(parseISO(selectedBooking.starts_at), 'EEE d MMM yyyy') },
                { label: 'Time', value: `${format(parseISO(selectedBooking.starts_at), 'HH:mm')} – ${format(parseISO(selectedBooking.ends_at), 'HH:mm')}` },
                { label: 'Price', value: selectedBooking.service ? formatCurrency(bookingPrice(selectedBooking) - (selectedBooking.discount_amount ?? 0) - (selectedBooking.gift_voucher_amount ?? 0)) : '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
            {selectedBooking.notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Notes</p>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{selectedBooking.notes}</p>
              </div>
            )}

            {/* Staff-only notes for this appointment — never shown to the customer */}
            <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5" /> Staff Notes
              </p>
              <Textarea
                value={bookingNotesDraft}
                onChange={e => setBookingNotesDraft(e.target.value)}
                placeholder="Only visible to staff — e.g. run-of-show reminders for this appointment…"
                rows={2}
                className="bg-white"
              />
              {bookingNotesDraft !== (selectedBooking.internal_notes ?? '') && (
                <div className="flex justify-end">
                  <Button size="sm" loading={bookingNotesSaving} onClick={handleSaveBookingNotes}>
                    <Save className="h-3.5 w-3.5" /> Save Note
                  </Button>
                </div>
              )}
            </div>

            {resources.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Resource</p>
                <select
                  value={selectedBooking.resource_id ?? ''}
                  disabled={assigningResource}
                  onChange={(e) => assignResource(selectedBooking.id, e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-50"
                >
                  <option value="">No resource assigned</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}
            {/* Gift voucher */}
            <div className="border border-gray-100 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5" /> Gift Voucher
              </p>
              {(selectedBooking.gift_voucher_amount ?? 0) > 0 ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-green-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-medium">Applied: −{formatCurrency(selectedBooking.gift_voucher_amount ?? 0)}</span>
                  </div>
                  <button
                    onClick={() => removeVoucher(selectedBooking.id)}
                    disabled={voucherRemoving}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {voucherRemoving ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={voucherCode}
                    onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setVoucherError('') }}
                    placeholder="VOUCHER CODE"
                    className="flex-1 h-9 px-3 text-sm font-mono border border-gray-200 rounded-lg outline-none focus:ring-(--color-primary) focus:ring-2 uppercase"
                  />
                  <Button size="sm" loading={voucherApplying} onClick={() => applyVoucher(selectedBooking.id)} disabled={!voucherCode.trim()}>
                    Apply
                  </Button>
                </div>
              )}
              {voucherError && <p className="text-xs text-red-600">{voucherError}</p>}
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
                        onChange={(e) => setChargeType(e.target.value as 'balance' | 'noshow')}
                        className="h-9 flex-1 px-2 text-xs border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-(--color-primary)"
                      >
                        <option value="balance">Balance</option>
                        <option value="noshow">No-show fee</option>
                      </select>
                      <div className="relative w-28 shrink-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">£</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={chargeAmount}
                          onChange={(e) => setChargeAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full h-9 pl-5 pr-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                        />
                      </div>
                      <Button size="sm" loading={charging} onClick={() => handleChargeBalance(selectedBooking.id)} disabled={!chargeAmount}>
                        Charge Card
                      </Button>
                    </div>
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
                <p className="text-xs font-semibold text-red-800">Reason for cancellation (required)</p>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer requested, double-booked, staff unavailable…"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setCancelReasonOpen(false); setCancelReason('') }} className="shrink-0">
                    Back
                  </Button>
                  <Button fullWidth variant="danger" size="sm" loading={updating} disabled={!cancelReason.trim()} onClick={() => handleCancelWithReason(selectedBooking.id)}>
                    Confirm Cancellation
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
                      <button onClick={() => handleUnmarkCheckIn(selectedBooking.id)} className="text-xs text-gray-400 hover:text-red-600 transition-colors">
                        Undo
                      </button>
                    </div>
                  ) : (
                    <Button fullWidth size="sm" onClick={() => handleCheckIn(selectedBooking.id)} style={{ backgroundColor: 'var(--color-primary)' }}>
                      <UserCheck className="h-4 w-4" />
                      Check In Customer
                    </Button>
                  )
                )}
                <div className="flex gap-2 flex-wrap">
                {(['confirmed', 'completed'] as BookingStatus[]).map((s) => (
                  <Button
                    key={s}
                    variant={s === 'completed' ? 'secondary' : 'primary'}
                    size="sm"
                    loading={updating}
                    disabled={selectedBooking.status === s}
                    onClick={() => updateStatus(selectedBooking.id, s)}
                    className="capitalize"
                  >
                    Mark {s}
                  </Button>
                ))}
                {selectedBooking.status !== 'cancelled' && (
                  <Button variant="danger" size="sm" onClick={() => setCancelReasonOpen(true)}>
                    Mark cancelled
                  </Button>
                )}
                </div>
              </div>
            )}
          </div>

          {/* ── Client sidebar ── */}
          <div className="lg:w-64 shrink-0 lg:border-l lg:border-gray-100 lg:pl-5 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                  {selectedBooking.customer?.name?.charAt(0).toUpperCase() ?? '?'}
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/admin/clients?edit=${selectedBooking.customer_id}`)}
                  className="font-semibold text-gray-900 text-sm truncate hover:text-(--color-primary) hover:underline text-left"
                >
                  {selectedBooking.customer?.name}
                </button>
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
                {selectedBooking.customer?.date_of_birth && (
                  <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Cake className="h-3 w-3 shrink-0" />{format(parseISO(selectedBooking.customer.date_of_birth), 'd MMMM')}
                  </p>
                )}
              </div>
            </div>

            {selectedBooking.customer?.internal_notes && (
              <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-2.5">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                  <StickyNote className="h-3 w-3" /> Client Notes
                </p>
                <p className="text-xs text-amber-900 whitespace-pre-wrap">{selectedBooking.customer.internal_notes}</p>
              </div>
            )}
          </div>
          </div>
        )}
      </Modal>

      {/* Activity log */}
      <Modal open={activityLogOpen} onClose={() => setActivityLogOpen(false)} title="Activity Log" size="sm">
        <ul className="space-y-3">
          {activityLog.map((entry) => (
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

      {fillFormTarget && selectedBooking && (
        <AdminFormFiller
          open={!!fillFormTarget}
          onClose={() => setFillFormTarget(null)}
          formId={fillFormTarget.id}
          formTitle={fillFormTarget.title}
          businessId={BUSINESS_ID}
          customerId={selectedBooking.customer_id}
          customerName={selectedBooking.customer?.name ?? 'this customer'}
          bookingId={selectedBooking.id}
          onSaved={() => {
            setFillFormTarget(null)
            checkBookingForm(selectedBooking.service_id, selectedBooking.customer_id, selectedBooking.id, selectedBooking.created_at).then(setSelectedBookingForm)
          }}
        />
      )}
    </div>
  )
}
