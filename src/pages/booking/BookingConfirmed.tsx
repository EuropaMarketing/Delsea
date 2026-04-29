import { useLocation, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { CheckCircle2, Calendar, CalendarClock, User, Clock, PoundSterling } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { buildICSLink } from '@/lib/slots'
import { formatCurrency, formatDuration } from '@/lib/currency'
import brand from '@/config/brand'

interface ConfirmedState {
  bookingRef: string
  serviceName: string
  serviceDuration: number
  servicePrice: number
  staffName: string | null
  startsAt: string
  endsAt: string
  customerEmail: string
}

export default function BookingConfirmed() {
  const { state } = useLocation()
  const navigate = useNavigate()

  if (!state?.bookingRef) {
    navigate('/book', { replace: true })
    return null
  }

  const s = state as ConfirmedState
  const startsAt = new Date(s.startsAt)
  const endsAt = new Date(s.endsAt)

  const icsUrl = buildICSLink(
    `${s.serviceName} at ${brand.brandName}`,
    s.startsAt,
    s.endsAt,
    brand.brandName,
    `Booking reference: ${s.bookingRef}`,
  )

  return (
    <div className="flex flex-col items-center py-10 px-4 text-center">
      {/* Success icon */}
      <div
        className="h-20 w-20 rounded-full flex items-center justify-center mb-5"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, white)' }}
      >
        <CheckCircle2 className="h-10 w-10" style={{ color: 'var(--color-primary)' }} />
      </div>

      <h1 className="text-3xl font-bold text-gray-900">You're booked in!</h1>
      <p className="text-gray-500 mt-2 text-sm max-w-sm">
        A confirmation has been sent to <span className="font-medium text-gray-700">{s.customerEmail}</span>.
      </p>

      {/* Reference */}
      <div className="mt-5 px-6 py-3 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Booking reference</p>
        <p className="font-mono font-bold text-2xl text-gray-900">{s.bookingRef}</p>
      </div>

      {/* Details card */}
      <Card padding="md" className="mt-6 w-full max-w-sm text-left">
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
            <div>
              <p className="text-xs text-gray-400">Date & time</p>
              <p className="font-semibold text-gray-900 text-sm">
                {format(startsAt, 'EEEE d MMMM yyyy')}
              </p>
              <p className="text-sm text-gray-700">
                {format(startsAt, 'HH:mm')} – {format(endsAt, 'HH:mm')}
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Clock className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
            <div>
              <p className="text-xs text-gray-400">Service</p>
              <p className="font-semibold text-gray-900 text-sm">{s.serviceName}</p>
              <p className="text-xs text-gray-500">{formatDuration(s.serviceDuration)}</p>
            </div>
          </li>
          {s.staffName && (
            <li className="flex items-start gap-3">
              <User className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
              <div>
                <p className="text-xs text-gray-400">Team member</p>
                <p className="font-semibold text-gray-900 text-sm">{s.staffName}</p>
              </div>
            </li>
          )}
          <li className="flex items-start gap-3">
            <PoundSterling className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
            <div>
              <p className="text-xs text-gray-400">Price</p>
              <p className="font-semibold text-gray-900 text-sm">{formatCurrency(s.servicePrice)}</p>
            </div>
          </li>
        </ul>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 mt-7 w-full max-w-sm">
        <a href={icsUrl} download="booking.ics" className="flex-1">
          <Button variant="secondary" fullWidth>
            <Calendar className="h-4 w-4" />
            Add to Calendar
          </Button>
        </a>
        <Link to="/my-bookings" className="flex-1">
          <Button fullWidth>View My Bookings</Button>
        </Link>
      </div>

      <Link to="/book" className="mt-5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        Make another booking
      </Link>
    </div>
  )
}
