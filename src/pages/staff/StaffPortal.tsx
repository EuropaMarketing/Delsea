import { useEffect, useState } from 'react'
import { format, startOfDay, endOfDay, addDays, isBefore, isToday, isTomorrow } from 'date-fns'
import { CalendarClock, UserCheck, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatDuration } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { StaffLayout } from '@/components/layout/StaffLayout'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type Appt = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  checked_in_at: string | null
  customer: { name: string; phone: string | null } | null
  service: { name: string; duration_minutes: number } | null
  resource: { name: string } | null
}

export default function StaffPortal() {
  const { staffId } = useAuthStore()
  const [staffName, setStaffName] = useState('')
  const [todayAppts, setTodayAppts] = useState<Appt[]>([])
  const [upcomingAppts, setUpcomingAppts] = useState<Appt[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staffId) return
    async function load() {
      const [staffRes, apptRes] = await Promise.all([
        supabase.from('staff').select('name').eq('id', staffId).single(),
        supabase
          .from('bookings')
          .select('id, starts_at, ends_at, status, checked_in_at, customer:customers(name,phone), service:services(name,duration_minutes), resource:resources(name)')
          .eq('business_id', BUSINESS_ID)
          .eq('staff_id', staffId)
          .neq('status', 'cancelled')
          .gte('starts_at', startOfDay(new Date()).toISOString())
          .lte('starts_at', endOfDay(addDays(new Date(), 6)).toISOString())
          .order('starts_at'),
      ])
      if (staffRes.data) setStaffName(staffRes.data.name)
      const all = (apptRes.data ?? []) as unknown as Appt[]
      const todayEnd = endOfDay(new Date())
      setTodayAppts(all.filter(a => !isBefore(todayEnd, new Date(a.starts_at)) && isToday(new Date(a.starts_at))))
      setUpcomingAppts(all.filter(a => !isToday(new Date(a.starts_at))))
      setLoading(false)
    }
    load()
  }, [staffId])

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
            {todayAppts.map(a => <ApptCard key={a.id} appt={a} />)}
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
            {upcomingAppts.map(a => <ApptCard key={a.id} appt={a} compact />)}
          </div>
        </section>
      )}
    </StaffLayout>
  )
}

function ApptCard({ appt: a, compact }: { appt: Appt; compact?: boolean }) {
  const startsAt = new Date(a.starts_at)
  const dateLabel = isToday(startsAt) ? null : isTomorrow(startsAt) ? 'Tomorrow' : format(startsAt, 'EEE d MMM')

  return (
    <Card padding="sm" className="flex items-center gap-4">
      <div className="w-16 text-center shrink-0">
        {dateLabel && <p className="text-xs text-gray-400 mb-0.5">{dateLabel}</p>}
        <p className="font-bold text-sm" style={{ color: 'var(--color-primary)' }}>
          {format(startsAt, 'HH:mm')}
        </p>
        {!compact && <p className="text-xs text-gray-400">{format(new Date(a.ends_at), 'HH:mm')}</p>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{a.customer?.name ?? 'Customer'}</p>
        <p className="text-xs text-gray-500 truncate">
          {a.service?.name}
          {!compact && a.service && ` · ${formatDuration(a.service.duration_minutes)}`}
          {a.resource && ` · ${a.resource.name}`}
        </p>
        {a.customer?.phone && !compact && (
          <p className="text-xs text-gray-400">{a.customer.phone}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {a.checked_in_at && (
          <span title="Checked in" className="text-white rounded-lg p-1.5" style={{ backgroundColor: 'var(--color-primary)' }}>
            <UserCheck className="h-4 w-4" />
          </span>
        )}
        <Badge variant={statusBadgeVariant(a.status as never)} className="capitalize hidden sm:block">
          {a.status}
        </Badge>
      </div>
    </Card>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
