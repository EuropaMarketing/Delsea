import { useEffect, useState } from 'react'
import { format, startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns'
import { CalendarClock, TrendingUp, XCircle, PoundSterling } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Booking } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

interface Stats {
  todayCount: number
  weekCount: number
  weekRevenue: number
  weekCancellations: number
}

export default function Dashboard() {
  const [todayBookings, setTodayBookings] = useState<(Booking & { service: { name: string; price: number }; staff: { name: string }; customer: { name: string } })[]>([])
  const [stats, setStats] = useState<Stats>({ todayCount: 0, weekCount: 0, weekRevenue: 0, weekCancellations: 0 })
  const [loading, setLoading] = useState(true)

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
          .neq('status', 'cancelled')
          .order('starts_at'),
        supabase
          .from('bookings')
          .select('status, service:services(price)')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', weekStart)
          .lte('starts_at', weekEnd),
      ])

      if (todayRes.data) setTodayBookings(todayRes.data as typeof todayBookings)
      if (weekRes.data) {
        const week = weekRes.data as unknown as Array<{ status: string; service: { price: number } | null }>
        setStats({
          todayCount: todayRes.data?.length ?? 0,
          weekCount: week.filter((b) => b.status !== 'cancelled').length,
          weekRevenue: week
            .filter((b) => b.status === 'confirmed' || b.status === 'completed')
            .reduce((sum, b) => sum + (b.service?.price ?? 0), 0),
          weekCancellations: week.filter((b) => b.status === 'cancelled').length,
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <FullPageSpinner />

  const statCards = [
    { label: "Today's Bookings", value: stats.todayCount, icon: CalendarClock, color: 'text-blue-600' },
    { label: 'This Week', value: stats.weekCount, icon: TrendingUp, color: 'text-green-600' },
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
            {todayBookings.map((b) => (
              <Card key={b.id} padding="sm" className="flex items-center gap-4">
                <div className="w-14 text-center flex-shrink-0">
                  <p className="font-bold text-sm" style={{ color: 'var(--color-primary)' }}>
                    {format(new Date(b.starts_at), 'HH:mm')}
                  </p>
                  <p className="text-xs text-gray-400">{format(new Date(b.ends_at), 'HH:mm')}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{b.service?.name}</p>
                  <p className="text-xs text-gray-500 truncate">{b.customer?.name} · {b.staff?.name}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-bold text-gray-900">
                    {b.service ? formatCurrency(b.service.price) : '—'}
                  </span>
                  <Badge variant={statusBadgeVariant(b.status)} className="capitalize">
                    {b.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
