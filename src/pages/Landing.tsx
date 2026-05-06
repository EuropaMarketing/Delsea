import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Lock, Info, CalendarX } from 'lucide-react'
import { format, getDay, startOfDay, endOfDay } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useBrandStore } from '@/store/brandStore'
import { generateTimeSlots } from '@/lib/slots'
import { Button } from '@/components/ui/Button'
import type { Availability, BlockedTime, Booking } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function Landing() {
  const { config } = useBrandStore()
  const [logoFailed, setLogoFailed] = useState(false)
  const [slotsToday, setSlotsToday] = useState<'loading' | 'available' | 'none'>('loading')

  // Compute open/closed from today's opening hours entry
  const todayName = new Date().toLocaleDateString('en-GB', { weekday: 'long' })
  const currentTime = format(new Date(), 'HH:mm')
  const todayHours = config.openingHours?.find((h) => h.day === todayName)
  const isOpen = !!(todayHours && !todayHours.closed && currentTime >= todayHours.open && currentTime < todayHours.close)
  const showStatus = !!config.openingHours?.length

  useEffect(() => {
    if (!config.openingHours?.length) return

    const todayN = new Date().toLocaleDateString('en-GB', { weekday: 'long' })
    const curT = format(new Date(), 'HH:mm')
    const todayH = config.openingHours.find((h) => h.day === todayN)
    const open = !!(todayH && !todayH.closed && curT >= todayH.open && curT < todayH.close)

    if (!open) { setSlotsToday('none'); return }

    async function checkSlots() {
      const today = new Date()
      const dow = getDay(today)
      const dayStart = startOfDay(today).toISOString()
      const dayEnd = endOfDay(today).toISOString()

      const [staffRes, availRes, bookRes, blockRes] = await Promise.all([
        supabase.from('staff').select('id').eq('business_id', BUSINESS_ID).neq('on_holiday', true),
        supabase.from('availability').select('*').eq('day_of_week', dow),
        supabase.from('bookings').select('*')
          .eq('business_id', BUSINESS_ID)
          .gte('starts_at', dayStart)
          .lte('starts_at', dayEnd)
          .neq('status', 'cancelled'),
        supabase.from('blocked_times').select('*')
          .lt('starts_at', dayEnd)
          .gt('ends_at', dayStart),
      ])

      const staffIds = new Set((staffRes.data ?? []).map((s) => s.id))
      const todayAvail = ((availRes.data ?? []) as Availability[]).filter((a) => staffIds.has(a.staff_id))

      if (!todayAvail.length) { setSlotsToday('none'); return }

      const slots = generateTimeSlots(
        today,
        todayAvail,
        30,
        (bookRes.data ?? []) as Booking[],
        (blockRes.data ?? []) as BlockedTime[],
      )
      setSlotsToday(slots.length > 0 ? 'available' : 'none')
    }

    checkSlots()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.openingHours])

  const showLogo = config.logo && config.logo !== '/logo.svg' && !logoFailed

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>
            {config.brandName}
          </span>
          <div className="flex items-center gap-4">
            <Link to="/about" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
              <Info className="h-3.5 w-3.5" />
              About
            </Link>
            <Link to="/admin/login" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              <Lock className="h-3.5 w-3.5" />
              Staff login
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center py-20">
        {showLogo ? (
          <img
            src={config.logo}
            alt={config.brandName}
            onError={() => setLogoFailed(true)}
            className="h-44 w-auto max-w-55 object-contain mb-10"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-sm"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <CalendarCheck className="h-8 w-8 text-white" />
          </div>
        )}

        <h1 className="text-4xl font-bold text-gray-900 mb-3">{config.brandName}</h1>
        <p className="text-gray-500 text-lg mb-6 max-w-sm">
          Book your appointment online in under a minute.
        </p>

        {/* Status badges */}
        {showStatus && (
          <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
            {/* Open / Closed */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
              isOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {/* Traffic light dot */}
              <span className="relative flex h-2.5 w-2.5">
                {isOpen && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOpen ? 'bg-green-500' : 'bg-red-500'}`} />
              </span>
              {isOpen ? 'Open Now' : `Closed${todayHours?.closed ? '' : ` · Opens ${todayHours?.open ?? ''}`}`}
            </div>

            {/* Today's availability — only shown when open and not still loading */}
            {isOpen && slotsToday !== 'loading' && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                slotsToday === 'available'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {slotsToday === 'available'
                  ? <CalendarCheck className="h-3.5 w-3.5" />
                  : <CalendarX className="h-3.5 w-3.5" />
                }
                {slotsToday === 'available' ? 'Appointments available today' : 'Fully booked today'}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/book">
            <Button size="lg" className="min-w-48">
              Book an Appointment
            </Button>
          </Link>
          <Link to="/my-bookings">
            <Button variant="secondary" size="lg" className="min-w-48">
              My Bookings
            </Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-gray-400 border-t border-gray-100">
        <p>© {new Date().getFullYear()} {config.brandName} · {config.businessEmail}</p>
      </footer>
    </div>
  )
}
