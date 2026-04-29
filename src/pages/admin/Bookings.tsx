import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Booking, BookingStatus } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string
const PAGE_SIZE = 20

type ExtBooking = Booking & {
  service: { name: string; price: number }
  staff: { name: string } | null
  customer: { name: string; email: string }
}

export default function AdminBookings() {
  const [bookings, setBookings] = useState<ExtBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all')
  const [selectedBooking, setSelectedBooking] = useState<ExtBooking | null>(null)
  const [updating, setUpdating] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    setPage(0)
    setBookings([])
    fetchBookings(0, true)
  }, [statusFilter])

  async function fetchBookings(pageNum: number, reset = false) {
    setLoading(true)
    let query = supabase
      .from('bookings')
      .select('*, service:services(name,price), staff:staff(name), customer:customers(name,email)')
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
    setUpdating(false)
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
                    {b.service ? formatCurrency(b.service.price) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedBooking(b)}
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
                { label: 'Price', value: selectedBooking.service ? formatCurrency(selectedBooking.service.price) : '—' },
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
            <div className="flex gap-2 pt-2 border-t border-gray-100 flex-wrap">
              {(['confirmed', 'completed', 'cancelled'] as BookingStatus[]).map((s) => (
                <Button
                  key={s}
                  variant={s === 'cancelled' ? 'danger' : s === 'completed' ? 'secondary' : 'primary'}
                  size="sm"
                  loading={updating}
                  disabled={selectedBooking.status === s}
                  onClick={() => updateStatus(selectedBooking.id, s)}
                  className="capitalize"
                >
                  Mark {s}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
