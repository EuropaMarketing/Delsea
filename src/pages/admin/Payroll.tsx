import { useEffect, useState, useMemo } from 'react'
import { format, parseISO, startOfMonth, addMonths, subMonths, startOfDay, endOfDay, setDate, getDate } from 'date-fns'

// Pay period: 26th of previous month → 25th of current "label" month
function getPayPeriod(month: Date) {
  const periodStart = startOfDay(setDate(subMonths(startOfMonth(month), 1), 26))
  const periodEnd   = endOfDay(setDate(startOfMonth(month), 25))
  return { periodStart, periodEnd }
}

function currentPayPeriodMonth() {
  const today = new Date()
  // On or after the 26th we've rolled into the next period
  return getDate(today) >= 26 ? startOfMonth(addMonths(today, 1)) : startOfMonth(today)
}
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Staff } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string
const VAT_DIVISOR = 1.2

type CompletedBooking = {
  id: string
  starts_at: string
  ends_at: string
  service: { name: string; price: number; duration_minutes: number; commission_type: string | null; commission_rate: number | null } | null
  staff_id: string | null
  discount_amount: number
  gift_voucher_amount: number
}

type StaffSummary = Staff & {
  bookings: CompletedBooking[]
  totalValue: number
  totalExclVAT: number
  staffPayment: number
  expanded: boolean
}

function bookingTotal(b: CompletedBooking) {
  return (b.service?.price ?? 0) - (b.discount_amount ?? 0) - (b.gift_voucher_amount ?? 0)
}

function calcStaffPayment(b: CompletedBooking, member: Staff): number {
  const type = (b.service?.commission_type ?? member.commission_type) as Staff['commission_type']
  const rate = b.service?.commission_rate ?? member.commission_rate
  const total = bookingTotal(b)
  const exclVAT = Math.round(total / VAT_DIVISOR)
  if (type === 'hourly') {
    const durationHrs = (b.service?.duration_minutes ?? 60) / 60
    return Math.round(durationHrs * rate * 100)
  }
  return Math.round(exclVAT * (rate / 100))
}

export default function AdminPayroll() {
  const [month, setMonth] = useState(() => currentPayPeriodMonth())
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [bookings, setBookings] = useState<CompletedBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase
      .from('staff')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .order('name')
      .then(({ data }) => { if (data) setStaffList(data as Staff[]) })
  }, [])

  useEffect(() => {
    setLoading(true)
    const { periodStart, periodEnd } = getPayPeriod(month)
    supabase
      .from('bookings')
      .select('id, staff_id, starts_at, ends_at, discount_amount, gift_voucher_amount, service:services(name, price, duration_minutes, commission_type, commission_rate)')
      .eq('business_id', BUSINESS_ID)
      .eq('status', 'completed')
      .gte('starts_at', periodStart.toISOString())
      .lte('starts_at', periodEnd.toISOString())
      .order('starts_at')
      .then(({ data }) => {
        if (data) setBookings(data as unknown as CompletedBooking[])
        setLoading(false)
      })
  }, [month])

  const summaries = useMemo<StaffSummary[]>(() => {
    return staffList.map((s) => {
      const bks = bookings.filter((b) => b.staff_id === s.id)
      const totalValue = bks.reduce((sum, b) => sum + bookingTotal(b), 0)
      const totalExclVAT = Math.round(totalValue / VAT_DIVISOR)
      const staffPayment = bks.reduce((sum, b) => sum + calcStaffPayment(b, s), 0)
      return { ...s, bookings: bks, totalValue, totalExclVAT, staffPayment, expanded: expandedIds.has(s.id) }
    })
  }, [staffList, bookings, expandedIds])

  const grandTotal    = useMemo(() => summaries.reduce((s, m) => s + m.totalValue,   0), [summaries])
  const grandExclVAT  = useMemo(() => summaries.reduce((s, m) => s + m.totalExclVAT, 0), [summaries])
  const grandPayment  = useMemo(() => summaries.reduce((s, m) => s + m.staffPayment, 0), [summaries])
  const grandCount    = useMemo(() => summaries.reduce((s, m) => s + m.bookings.length, 0), [summaries])

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const isCurrentPeriod = month.getTime() === currentPayPeriodMonth().getTime()

  return (
    <div>
      {/* Header + month navigation */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Payroll</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900 text-center min-w-48">
            {(() => {
              const { periodStart, periodEnd } = getPayPeriod(month)
              return `${format(periodStart, 'd MMM')} – ${format(periodEnd, 'd MMM yyyy')}`
            })()}
          </span>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            disabled={isCurrentPeriod}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Monthly totals bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card padding="md" className="text-center">
          <p className="text-xs text-gray-400 mb-1">Appointments</p>
          <p className="text-2xl font-extrabold text-gray-900">{grandCount}</p>
        </Card>
        <Card padding="md" className="text-center">
          <p className="text-xs text-gray-400 mb-1">Total Revenue</p>
          <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(grandTotal)}</p>
        </Card>
        <Card padding="md" className="text-center">
          <p className="text-xs text-gray-400 mb-1">Total Excl VAT</p>
          <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(grandExclVAT)}</p>
        </Card>
        <Card padding="md" className="text-center">
          <p className="text-xs text-gray-400 mb-1">Total Staff Payment</p>
          <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(grandPayment)}</p>
        </Card>
      </div>

      {loading ? (
        <FullPageSpinner />
      ) : summaries.length === 0 ? (
        <Card padding="md" className="text-center py-12 text-gray-400">
          No staff found.
        </Card>
      ) : (
        <div className="space-y-3">
          {summaries.map((s) => (
            <Card key={s.id} padding="none" className="overflow-hidden">
              {/* Staff summary row */}
              <button
                className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                onClick={() => s.bookings.length > 0 && toggleExpand(s.id)}
              >
                <Avatar src={s.avatar_url} name={s.name} size="md" />

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-400 capitalize">{s.role}</p>
                </div>

                <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-gray-400">Appts</p>
                    <p className="text-lg font-bold text-gray-900">{s.bookings.length}</p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-xs text-gray-400">Revenue</p>
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(s.totalValue)}</p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-xs text-gray-400">Excl VAT</p>
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(s.totalExclVAT)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Staff Payment</p>
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(s.staffPayment)}</p>
                  </div>
                  {s.bookings.length > 0 && (
                    <span className="text-gray-400">
                      {expandedIds.has(s.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  )}
                </div>
              </button>

              {/* Expandable booking list */}
              {expandedIds.has(s.id) && s.bookings.length > 0 && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Date & Time</th>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Service</th>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Total</th>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Excl VAT</th>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
                          Staff ({s.commission_type === 'hourly' ? '£/hr' : `${s.commission_rate}%`})
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {s.bookings.map((b) => {
                        const total = bookingTotal(b)
                        const exclVAT = Math.round(total / VAT_DIVISOR)
                        const payment = calcStaffPayment(b, s)
                        return (
                          <tr key={b.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                              {format(parseISO(b.starts_at), 'EEE d MMM, HH:mm')}
                            </td>
                            <td className="px-4 py-2.5 text-gray-900 font-medium">
                              {b.service?.name ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-gray-900 text-right">{formatCurrency(total)}</td>
                            <td className="px-4 py-2.5 text-gray-600 text-right">{formatCurrency(exclVAT)}</td>
                            <td className="px-4 py-2.5 text-green-700 font-semibold text-right">{formatCurrency(payment)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide" colSpan={2}>
                          {s.bookings.length} appointment{s.bookings.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-gray-900 text-right">{formatCurrency(s.totalValue)}</td>
                        <td className="px-4 py-2.5 font-bold text-gray-600 text-right">{formatCurrency(s.totalExclVAT)}</td>
                        <td className="px-4 py-2.5 font-bold text-green-700 text-right">{formatCurrency(s.staffPayment)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {expandedIds.has(s.id) && s.bookings.length === 0 && (
                <div className="border-t border-gray-100 px-4 py-3 text-sm text-gray-400">
                  No completed appointments this month.
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
