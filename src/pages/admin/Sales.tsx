import { useEffect, useMemo, useState } from 'react'
import {
  format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear, differenceInCalendarDays,
} from 'date-fns'
import { Download, TrendingUp, Ticket, Gift, CreditCard } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type SalesBooking = {
  id: string
  starts_at: string
  price_override: number | null
  discount_amount: number | null
  gift_voucher_amount: number | null
  deposit_charged: number | null
  payment_status: string | null
  service: { name: string; category: string; price: number } | null
  staff: { name: string } | null
  customer: { name: string } | null
}

type VoucherSale = {
  id: string
  code: string
  initial_value: number
  created_at: string
  issued_to: string | null
}

type MembershipSale = {
  id: string
  purchased_at: string
  plan: { name: string; price: number } | null
}

function bookingRevenue(b: SalesBooking): number {
  return (b.price_override ?? b.service?.price ?? 0) - (b.discount_amount ?? 0) - (b.gift_voucher_amount ?? 0)
}

type Preset = 'today' | 'week' | 'month' | 'year' | 'custom'

export default function AdminSales() {
  const [preset, setPreset] = useState<Preset>('month')
  const [rangeStart, setRangeStart] = useState(() => startOfMonth(new Date()))
  const [rangeEnd, setRangeEnd] = useState(() => endOfMonth(new Date()))
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<SalesBooking[]>([])
  const [vouchers, setVouchers] = useState<VoucherSale[]>([])
  const [membershipSales, setMembershipSales] = useState<MembershipSale[]>([])

  function applyPreset(p: Preset) {
    const now = new Date()
    setPreset(p)
    if (p === 'today') { setRangeStart(startOfDay(now)); setRangeEnd(endOfDay(now)) }
    else if (p === 'week') { setRangeStart(startOfWeek(now, { weekStartsOn: 1 })); setRangeEnd(endOfWeek(now, { weekStartsOn: 1 })) }
    else if (p === 'month') { setRangeStart(startOfMonth(now)); setRangeEnd(endOfMonth(now)) }
    else if (p === 'year') { setRangeStart(startOfYear(now)); setRangeEnd(endOfYear(now)) }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const startISO = rangeStart.toISOString()
      const endISO = rangeEnd.toISOString()
      const [bkRes, voucherRes, memRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, starts_at, price_override, discount_amount, gift_voucher_amount, deposit_charged, payment_status, service:services(name,category,price), staff:staff(name), customer:customers(name)')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', startISO)
          .lte('starts_at', endISO)
          .in('status', ['confirmed', 'completed']),
        supabase
          .from('gift_vouchers')
          .select('id, code, initial_value, created_at, issued_to')
          .eq('business_id', BUSINESS_ID)
          .gte('created_at', startISO)
          .lte('created_at', endISO),
        supabase
          .from('customer_memberships')
          .select('id, purchased_at, plan:membership_plans(name, price, business_id)')
          .gte('purchased_at', startISO)
          .lte('purchased_at', endISO),
      ])
      setBookings((bkRes.data ?? []) as unknown as SalesBooking[])
      setVouchers((voucherRes.data ?? []) as VoucherSale[])
      const memberships = ((memRes.data ?? []) as unknown as (MembershipSale & { plan: (MembershipSale['plan'] & { business_id: string }) | null })[])
        .filter(m => m.plan?.business_id === BUSINESS_ID)
      setMembershipSales(memberships)
      setLoading(false)
    }
    load()
  }, [rangeStart, rangeEnd])

  const bookingRevenueTotal = useMemo(() => bookings.reduce((s, b) => s + bookingRevenue(b), 0), [bookings])
  const voucherRevenueTotal = useMemo(() => vouchers.reduce((s, v) => s + v.initial_value, 0), [vouchers])
  const membershipRevenueTotal = useMemo(() => membershipSales.reduce((s, m) => s + (m.plan?.price ?? 0), 0), [membershipSales])
  const totalSales = bookingRevenueTotal + voucherRevenueTotal + membershipRevenueTotal
  const avgBookingValue = bookings.length ? Math.round(bookingRevenueTotal / bookings.length) : 0

  const depositsCollected = useMemo(() => bookings.reduce((s, b) => s + (b.deposit_charged ?? 0), 0), [bookings])
  const outstandingBalance = useMemo(() => bookings.reduce((s, b) => {
    if (b.payment_status === 'paid_in_full') return s
    return s + Math.max(0, bookingRevenue(b) - (b.deposit_charged ?? 0))
  }, 0), [bookings])

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of bookings) {
      const cat = b.service?.category || 'Uncategorised'
      map.set(cat, (map.get(cat) ?? 0) + bookingRevenue(b))
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [bookings])

  const byStaff = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of bookings) {
      const name = b.staff?.name ?? 'Unassigned'
      map.set(name, (map.get(name) ?? 0) + bookingRevenue(b))
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [bookings])

  const bucketByMonth = differenceInCalendarDays(rangeEnd, rangeStart) > 62
  const byPeriod = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of bookings) {
      const key = format(parseISO(b.starts_at), bucketByMonth ? 'yyyy-MM' : 'yyyy-MM-dd')
      map.set(key, (map.get(key) ?? 0) + bookingRevenue(b))
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [bookings, bucketByMonth])
  const maxPeriodValue = Math.max(1, ...byPeriod.map(([, v]) => v))

  function exportCSV() {
    const header = ['Date', 'Type', 'Description', 'Customer', 'Amount']
    const bookingRows = bookings.map(b => [
      format(parseISO(b.starts_at), 'yyyy-MM-dd HH:mm'),
      'Booking',
      b.service?.name ?? '',
      b.customer?.name ?? '',
      (bookingRevenue(b) / 100).toFixed(2),
    ])
    const voucherRows = vouchers.map(v => [
      format(parseISO(v.created_at), 'yyyy-MM-dd HH:mm'),
      'Gift Voucher',
      v.code,
      v.issued_to ?? '',
      (v.initial_value / 100).toFixed(2),
    ])
    const membershipRows = membershipSales.map(m => [
      format(parseISO(m.purchased_at), 'yyyy-MM-dd HH:mm'),
      'Membership',
      m.plan?.name ?? '',
      '',
      ((m.plan?.price ?? 0) / 100).toFixed(2),
    ])
    const rows = [...bookingRows, ...voucherRows, ...membershipRows].sort((a, b) => a[0].localeCompare(b[0]))
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-report-${format(rangeStart, 'yyyy-MM-dd')}-to-${format(rangeEnd, 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const presets: { value: Preset; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'year', label: 'This Year' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Sales Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(rangeStart, 'd MMM yyyy')} – {format(rangeEnd, 'd MMM yyyy')}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={exportCSV}>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Date range controls */}
      <Card padding="sm" className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          {presets.map(p => (
            <button
              key={p.value}
              onClick={() => applyPreset(p.value)}
              className={cn('px-3 py-1.5 text-sm font-medium rounded-md transition-colors', preset === p.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-1">
          <input
            type="date"
            value={format(rangeStart, 'yyyy-MM-dd')}
            onChange={e => { if (e.target.value) { setPreset('custom'); setRangeStart(startOfDay(new Date(e.target.value + 'T12:00:00'))) } }}
            className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={format(rangeEnd, 'yyyy-MM-dd')}
            onChange={e => { if (e.target.value) { setPreset('custom'); setRangeEnd(endOfDay(new Date(e.target.value + 'T12:00:00'))) } }}
            className="h-9 px-2.5 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
        </div>
      </Card>

      {loading ? (
        <FullPageSpinner />
      ) : (
        <div className="space-y-5">
          {/* Headline stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card padding="md" className="text-center">
              <p className="text-xs text-gray-400 mb-1">Total Sales</p>
              <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(totalSales)}</p>
            </Card>
            <Card padding="md" className="text-center">
              <p className="text-xs text-gray-400 mb-1">Bookings</p>
              <p className="text-2xl font-extrabold text-gray-900">{bookings.length}</p>
            </Card>
            <Card padding="md" className="text-center">
              <p className="text-xs text-gray-400 mb-1">Avg. Booking Value</p>
              <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(avgBookingValue)}</p>
            </Card>
            <Card padding="md" className="text-center">
              <p className="text-xs text-gray-400 mb-1">Outstanding Balance</p>
              <p className={cn('text-2xl font-extrabold', outstandingBalance > 0 ? 'text-amber-600' : 'text-gray-900')}>{formatCurrency(outstandingBalance)}</p>
            </Card>
          </div>

          {/* Revenue source breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card padding="md" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-(--color-primary)/10 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 text-(--color-primary)" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Booking Revenue</p>
                <p className="text-base font-bold text-gray-900 truncate">{formatCurrency(bookingRevenueTotal)}</p>
              </div>
            </Card>
            <Card padding="md" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                <Gift className="h-4 w-4 text-purple-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Gift Vouchers Sold ({vouchers.length})</p>
                <p className="text-base font-bold text-gray-900 truncate">{formatCurrency(voucherRevenueTotal)}</p>
              </div>
            </Card>
            <Card padding="md" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <Ticket className="h-4 w-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Memberships Sold ({membershipSales.length})</p>
                <p className="text-base font-bold text-gray-900 truncate">{formatCurrency(membershipRevenueTotal)}</p>
              </div>
            </Card>
            <Card padding="md" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <CreditCard className="h-4 w-4 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Deposits Collected</p>
                <p className="text-base font-bold text-gray-900 truncate">{formatCurrency(depositsCollected)}</p>
              </div>
            </Card>
          </div>

          {/* Revenue over time */}
          <Card padding="md">
            <h2 className="font-semibold text-gray-900 mb-4">Booking Revenue Over Time</h2>
            {byPeriod.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No bookings in this range.</p>
            ) : (
              <div className="flex items-end gap-1.5 h-40 overflow-x-auto pb-1">
                {byPeriod.map(([key, value]) => (
                  <div key={key} className="flex flex-col items-center gap-1.5 shrink-0" style={{ width: byPeriod.length > 20 ? 20 : 40 }}>
                    <div className="w-full flex items-end h-32" title={formatCurrency(value)}>
                      <div
                        className="w-full rounded-t bg-(--color-primary) hover:opacity-80 transition-opacity"
                        style={{ height: `${Math.max(2, (value / maxPeriodValue) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                      {format(parseISO(bucketByMonth ? `${key}-01` : key), bucketByMonth ? 'MMM yy' : 'd MMM')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Breakdown tables */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card padding="md">
              <h2 className="font-semibold text-gray-900 mb-3">By Service Category</h2>
              {byCategory.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No data.</p>
              ) : (
                <div className="space-y-2">
                  {byCategory.map(([cat, value]) => (
                    <div key={cat} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{cat}</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card padding="md">
              <h2 className="font-semibold text-gray-900 mb-3">By Staff Member</h2>
              {byStaff.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No data.</p>
              ) : (
                <div className="space-y-2">
                  {byStaff.map(([name, value]) => (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{name}</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
