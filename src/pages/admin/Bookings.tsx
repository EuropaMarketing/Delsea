import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Download, Gift, CheckCircle2, CreditCard, History } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Input'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Booking, BookingStatus, Resource } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string
const PAGE_SIZE = 20

type ExtBooking = Booking & {
  service: { name: string; price: number }
  staff: { name: string } | null
  customer: { name: string; email: string; sumup_card_token: string | null }
  resource: { name: string } | null
  payment_status: string
  deposit_charged: number
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
  const [bookings, setBookings] = useState<ExtBooking[]>([])
  const [loading, setLoading] = useState(true)
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
      .order('name')
      .then(({ data }) => { if (data) setResources(data as Resource[]) })
  }, [])

  async function fetchBookings(pageNum: number, reset = false) {
    setLoading(true)
    let query = supabase
      .from('bookings')
      .select('*, service:services(name,price), staff:staff(name), customer:customers(name,email,sumup_card_token), resource:resources(name)')
      .eq('business_id', BUSINESS_ID)
      .order('starts_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)

    const { data } = await query
    if (data) {
      setBookings((prev) => (reset ? data : [...prev, ...data]) as ExtBooking[])
      setHasMore(data.length === PAGE_SIZE)
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
    const remaining = (b.service?.price ?? 0) - (b.discount_amount ?? 0) - (b.gift_voucher_amount ?? 0) - (b.deposit_charged ?? 0)
    setChargeAmount(remaining > 0 ? (remaining / 100).toFixed(2) : '')
    setChargeType('balance')
    setChargeError('')
    setChargeSuccess(false)
    setCancelReasonOpen(false)
    setCancelReason('')
    setActivityLog([])
    setActivityLogOpen(false)
    refreshActivityLog(b.id)
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
      b.service ? (b.service.price / 100).toFixed(2) : '0.00',
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

      {/* Table */}
      <div className="bg-white border border-gray-200 brand-card overflow-hidden">
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
                  <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[160px]">
                    {b.service?.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b.staff?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadgeVariant(b.status)} className="capitalize">
                      {b.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                    {b.service ? formatCurrency(b.service.price - (b.discount_amount ?? 0) - (b.gift_voucher_amount ?? 0)) : '—'}
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
        size="md"
      >
        {selectedBooking && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Reference', value: selectedBooking.id.slice(0, 8).toUpperCase() },
                { label: 'Status', value: <Badge variant={statusBadgeVariant(selectedBooking.status)} className="capitalize">{selectedBooking.status}</Badge> },
                { label: 'Customer', value: selectedBooking.customer?.name },
                { label: 'Email', value: selectedBooking.customer?.email },
                { label: 'Service', value: selectedBooking.service?.name },
                { label: 'Staff', value: selectedBooking.staff?.name ?? '—' },
                { label: 'Date', value: format(parseISO(selectedBooking.starts_at), 'EEE d MMM yyyy') },
                { label: 'Time', value: `${format(parseISO(selectedBooking.starts_at), 'HH:mm')} – ${format(parseISO(selectedBooking.ends_at), 'HH:mm')}` },
                { label: 'Price', value: selectedBooking.service ? formatCurrency(selectedBooking.service.price - (selectedBooking.discount_amount ?? 0) - (selectedBooking.gift_voucher_amount ?? 0)) : '—' },
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
              <div className="flex gap-2 pt-2 border-t border-gray-100 flex-wrap">
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
            )}
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
    </div>
  )
}
