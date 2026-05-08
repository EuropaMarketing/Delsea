import { useEffect, useState } from 'react'
import { format, startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns'
import { CalendarClock, XCircle, PoundSterling, CheckCircle2, X, Loader2, CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Booking, BookingStatus } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

interface Stats {
  todayCount: number
  todayCompleted: number
  weekCount: number
  weekRevenue: number
  weekCancellations: number
}

export default function Dashboard() {
  type TodayBooking = Booking & { service: { name: string; price: number }; staff: { name: string } | null; customer: { name: string } | null; discount_amount: number; gift_voucher_amount: number }
  const [todayBookings, setTodayBookings] = useState<TodayBooking[]>([])
  const [stats, setStats] = useState<Stats>({ todayCount: 0, todayCompleted: 0, weekCount: 0, weekRevenue: 0, weekCancellations: 0 })
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const now = new Date()
      const todayStart = startOfDay(now).toISOString()
      const todayEnd = endOfDay(now).toISOString()
      const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString()

      const [todayRes, weekRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('*, service:services(name,price), staff:staff(name), customer:customers(name)')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', todayStart)
          .lte('starts_at', todayEnd)
          .in('status', ['confirmed', 'pending', 'completed'])
          .order('starts_at'),
        supabase
          .from('bookings')
          .select('status, discount_amount, gift_voucher_amount, service:services(price)')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', weekStart)
          .lte('starts_at', weekEnd),
      ])

      if (todayRes.data) {
        const all = todayRes.data as typeof todayBookings
        setTodayBookings(all.filter((b) => b.status === 'confirmed' || b.status === 'pending'))
        const todayCompleted = all.filter((b) => b.status === 'completed').length
        if (weekRes.data) {
          const week = weekRes.data as unknown as Array<{ status: string; discount_amount: number; gift_voucher_amount: number; service: { price: number } | null }>
          setStats({
            todayCount: all.filter((b) => b.status !== 'cancelled').length - todayCompleted,
            todayCompleted,
            weekCount: week.filter((b) => b.status !== 'cancelled').length,
            weekRevenue: week
              .filter((b) => b.status === 'confirmed' || b.status === 'completed')
              .reduce((sum, b) => sum + (b.service?.price ?? 0) - (b.discount_amount ?? 0) - (b.gift_voucher_amount ?? 0), 0),
            weekCancellations: week.filter((b) => b.status === 'cancelled').length,
          })
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  async function updateStatus(bookingId: string, status: BookingStatus) {
    if (status === 'cancelled' && !confirm('Cancel this booking?')) return
    setUpdating(bookingId)
    await supabase.from('bookings').update({ status }).eq('id', bookingId)
    setTodayBookings((prev) => prev.filter((b) => b.id !== bookingId))
    if (status === 'cancelled') {
      setStats((prev) => ({ ...prev, todayCount: prev.todayCount - 1, weekCancellations: prev.weekCancellations + 1 }))
    } else if (status === 'completed') {
      setStats((prev) => ({ ...prev, todayCount: prev.todayCount - 1, todayCompleted: prev.todayCompleted + 1 }))
    }
    setUpdating(null)
  }

  if (loading) return <FullPageSpinner />

  const statCards = [
    { label: 'Remaining Today', value: stats.todayCount, icon: CalendarClock, color: 'text-blue-600' },
    { label: 'Completed Today', value: stats.todayCompleted, icon: CheckCheck, color: 'text-green-600' },
    { label: 'Week Revenue', value: formatCurrency(stats.weekRevenue), icon: PoundSterling, color: 'text-purple-600' },
    { label: 'Cancellations', value: stats.weekCancellations, icon: XCircle, color: 'text-red-500' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((s) => (
          <Card key={s.label} padding="md">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-gray-50 ${s.color}`}>
                <s.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="font-bold text-gray-900">{s.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Today's bookings */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Today's Schedule
        </h2>
        {todayBookings.length === 0 ? (
          <Card padding="md" className="text-center py-10">
            <p className="text-gray-400 text-sm">No bookings today.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {todayBookings.map((b) => {
              const isUpdating = updating === b.id
              const isActionable = b.status === 'confirmed' || b.status === 'pending'
              return (
                <Card key={b.id} padding="sm" className="flex items-center gap-4">
                  <div className="w-14 text-center shrink-0">
                    <p className="font-bold text-sm" style={{ color: 'var(--color-primary)' }}>
                      {format(new Date(b.starts_at), 'HH:mm')}
                    </p>
                    <p className="text-xs text-gray-400">{format(new Date(b.ends_at), 'HH:mm')}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{b.service?.name}</p>
                    <p className="text-xs text-gray-500 truncate">{b.customer?.name ?? 'Unknown'} · {b.staff?.name ?? 'Any'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-gray-900 hidden sm:block">
                      {b.service ? formatCurrency(b.service.price - (b.discount_amount ?? 0) - (b.gift_voucher_amount ?? 0)) : '—'}
                    </span>
                    <Badge variant={statusBadgeVariant(b.status)} className="capitalize">
                      {b.status}
                    </Badge>
                    {isActionable && (
                      <>
                        <button
                          onClick={() => updateStatus(b.id, 'completed')}
                          disabled={isUpdating}
                          title="Mark as completed"
                          className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 transition-colors disabled:opacity-50"
                        >
                          {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => updateStatus(b.id, 'cancelled')}
                          disabled={isUpdating}
                          title="Cancel booking"
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-colors disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
