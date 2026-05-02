import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, isBefore, addHours } from 'date-fns'
import { CalendarClock, AlertTriangle, LogIn } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, PasswordInput } from '@/components/ui/Input'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type MyBooking = {
  id: string
  customer_id: string
  staff_id: string | null
  service_id: string
  starts_at: string
  ends_at: string
  status: string
  notes: string | null
  created_at: string
  service: { name: string; price: number }
  staff: { name: string } | null
}

function SignInPrompt() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')
  const [resetSent, setResetSent] = useState(false)

  async function handleSignIn() {
    if (!email || !password) { setError('Please enter your email and password'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError('Incorrect email or password.')
    setLoading(false)
  }

  async function handleForgotPassword() {
    if (!email) { setError('Enter your email address above first'); return }
    setLoading(true)
    setError('')
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetSent(true)
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <LogIn className="h-5 w-5 text-gray-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign in to view your bookings</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-xs">
        Use the email and password you set up when you booked.
      </p>

      {resetSent ? (
        <div className="w-full max-w-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
          Password reset link sent — check your inbox.
        </div>
      ) : (
        <div className="w-full max-w-sm space-y-3 text-left">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
            placeholder="your@email.com"
          />
          {mode === 'signin' && (
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              placeholder="••••••••"
            />
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {mode === 'signin' ? (
            <>
              <Button fullWidth loading={loading} onClick={handleSignIn}>Sign In</Button>
              <button
                onClick={() => { setMode('forgot'); setError('') }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 text-center"
              >
                Forgot password?
              </button>
            </>
          ) : (
            <>
              <Button fullWidth loading={loading} onClick={handleForgotPassword}>Send Reset Link</Button>
              <button
                onClick={() => { setMode('signin'); setError('') }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 text-center"
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      )}

      <Link to="/book" className="mt-6 text-sm text-gray-400 hover:text-gray-600">
        Make a new booking →
      </Link>
    </div>
  )
}

export default function MyBookings() {
  const { user } = useAuthStore()

  const [bookings, setBookings] = useState<MyBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [rpcError, setRpcError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    async function load() {
      const { data, error } = await supabase.rpc('get_my_bookings', { p_business_id: BUSINESS_ID })
      if (error) {
        setRpcError(`${error.message} (code: ${error.code})`)
      } else if (data) {
        type Row = MyBooking & { service_name: string; service_price: number; staff_name: string | null }
        setBookings(
          (data as Row[]).map((b) => ({
            ...b,
            service: { name: b.service_name, price: b.service_price },
            staff: b.staff_name ? { name: b.staff_name } : null,
          }))
        )
      }
      setLoading(false)
    }
    load()
  }, [user])

  async function handleCancel(bookingId: string) {
    setCancelling(bookingId)
    await supabase.rpc('cancel_booking', { p_booking_id: bookingId })
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' } : b)),
    )
    setCancelling(null)
    setCancelTarget(null)
  }

  const upcoming = bookings.filter(
    (b) => b.status !== 'cancelled' && isBefore(new Date(), parseISO(b.starts_at)),
  )
  const past = bookings.filter(
    (b) => b.status === 'cancelled' || !isBefore(new Date(), parseISO(b.starts_at)),
  )

  if (loading) return <FullPageSpinner />
  if (!user) return <SignInPrompt />

  function BookingCard({ booking }: { booking: typeof bookings[0] }) {
    const canCancel =
      booking.status === 'confirmed' &&
      isBefore(addHours(new Date(), 24), parseISO(booking.starts_at))

    return (
      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900">{booking.service?.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {booking.staff?.name ?? 'Any team member'}
            </p>
          </div>
          <Badge variant={statusBadgeVariant(booking.status)} className="capitalize shrink-0">
            {booking.status}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 text-gray-600">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span>{format(parseISO(booking.starts_at), 'EEE d MMM yyyy, HH:mm')}</span>
          </div>
          <span className="font-bold text-gray-900">
            {booking.service ? formatCurrency(booking.service.price) : '—'}
          </span>
        </div>
        {canCancel && (
          <Button
            variant="danger"
            size="sm"
            className="self-start"
            onClick={() => setCancelTarget(booking.id)}
          >
            Cancel Booking
          </Button>
        )}
      </Card>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Bookings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your upcoming and past appointments.</p>
        </div>
        <Link to="/book">
          <Button size="sm">New Booking</Button>
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CalendarClock className="h-10 w-10 text-gray-300 mb-3" />
          <p className="font-medium text-gray-500">No bookings yet.</p>
          {rpcError && (
            <p className="mt-3 text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-sm text-left">
              Debug: {rpcError}
            </p>
          )}
          <Link to="/book" className="mt-4">
            <Button>Book Now</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Upcoming ({upcoming.length})
              </h2>
              <div className="space-y-3">
                {upcoming.map((b) => <BookingCard key={b.id} booking={b} />)}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Past & Cancelled ({past.length})
              </h2>
              <div className="space-y-3 opacity-70">
                {past.map((b) => <BookingCard key={b.id} booking={b} />)}
              </div>
            </section>
          )}
        </div>
      )}

      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel Booking"
        size="sm"
      >
        <div className="flex flex-col items-center text-center gap-4">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm text-gray-600">
            Are you sure you want to cancel this booking? This cannot be undone.
          </p>
          <div className="flex gap-3 w-full">
            <Button variant="secondary" fullWidth onClick={() => setCancelTarget(null)}>
              Keep It
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={!!cancelling}
              onClick={() => cancelTarget && handleCancel(cancelTarget)}
            >
              Cancel Booking
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
