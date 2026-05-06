import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { CheckCircle2, Calendar, CalendarClock, User, Clock, PoundSterling } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PasswordInput } from '@/components/ui/Input'
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
  isNewUser: boolean
}

function CreateAccountForm({ email }: { email: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  async function handleCreate() {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase.auth.signUp({ email, password })
    if (err) {
      if (err.message.toLowerCase().includes('already')) {
        setError('An account with this email already exists. Sign in from My Bookings.')
      } else {
        setError('Something went wrong. You can set up your account later from My Bookings.')
      }
    } else {
      // Link the guest customer record to this auth user so bookings are visible immediately.
      if (data.user) {
        await supabase.rpc('link_customer_to_user', {
          p_user_id: data.user.id,
          p_email: email,
        })
      }
      // If Supabase requires email confirmation, data.session will be null.
      setNeedsConfirmation(!data.session)
      setDone(true)
    }
    setLoading(false)
  }

  if (done) {
    return needsConfirmation ? (
      <div className="w-full max-w-sm flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3.5 text-left">
        <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Check your email</p>
          <p className="text-xs text-blue-600 mt-0.5">We've sent a confirmation link to {email}. Once confirmed, sign in from My Bookings to manage your appointments.</p>
        </div>
      </div>
    ) : (
      <div className="w-full max-w-sm flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3.5 text-left">
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-green-800">Account created!</p>
          <p className="text-xs text-green-600 mt-0.5">You're now signed in. Visit My Bookings to manage your appointments.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm border border-gray-200 rounded-xl p-4 text-left bg-gray-50">
      <p className="text-sm font-semibold text-gray-800 mb-0.5">Create your account</p>
      <p className="text-xs text-gray-500 mb-3">
        Set a password for <span className="font-medium">{email}</span> to manage your bookings.
      </p>
      <div className="space-y-2">
        <PasswordInput
          placeholder="Choose a password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError('') }}
        />
        <PasswordInput
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      <Button fullWidth loading={loading} onClick={handleCreate} className="mt-3">
        Create Account
      </Button>
    </div>
  )
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

      <div className="mt-5 px-6 py-3 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Booking reference</p>
        <p className="font-mono font-bold text-2xl text-gray-900">{s.bookingRef}</p>
      </div>

      {/* Account creation for new customers */}
      {s.isNewUser && (
        <div className="mt-5 w-full max-w-sm">
          <CreateAccountForm email={s.customerEmail} />
        </div>
      )}

      <Card padding="md" className="mt-6 w-full max-w-sm text-left">
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
            <div>
              <p className="text-xs text-gray-400">Date & time</p>
              <p className="font-semibold text-gray-900 text-sm">{format(startsAt, 'EEEE d MMMM yyyy')}</p>
              <p className="text-sm text-gray-700">{format(startsAt, 'HH:mm')} – {format(endsAt, 'HH:mm')}</p>
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
