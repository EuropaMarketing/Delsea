import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, isBefore, addHours } from 'date-fns'
import { CalendarClock, AlertTriangle, LogIn, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import type { Booking } from '@/types'

function SignInPrompt() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSend() {
    if (!email) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    if (!error) setSent(true)
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <LogIn className="h-5 w-5 text-gray-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign in to view your bookings</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-xs">
        We'll send a magic link to your email — no password needed.
      </p>
      {sent ? (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-3 rounded-lg">
          <Mail className="h-4 w-4 shrink-0" />
          Check your inbox for the sign-in link.
        </div>
      ) : (
        <div className="flex gap-2 w-full max-w-sm">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="your@email.com"
            className="flex-1 h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
          />
          <Button loading={loading} onClick={handleSend}>Send Link</Button>
        </div>
      )}
      <Link to="/" className="mt-6 text-sm text-gray-400 hover:text-gray-600">
        Book without an account →
      </Link>
    </div>
  )
}

export default function MyBookings() {
  const { user } = useAuthStore()

  const [bookings, setBookings] = useState<(Booking & { service: { name: string; price: number }; staff: { name: string } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    async function load() {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user!.id)
        .single()

      if (customer) {
        const { data: bData } = await supabase
          .from('bookings')
          .select('*, service:services(name,price), staff:staff(name)')
          .eq('customer_id', customer.id)
          .order('starts_at', { ascending: false })
        if (bData) setBookings(bData as typeof bookings)
      }
      setLoading(false)
    }
    load()
  }, [user, navigate])

  async function handleCancel(bookingId: string) {
    setCancelling(bookingId)
    await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId)
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
        <Link to="/">
          <Button size="sm">New Booking</Button>
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CalendarClock className="h-10 w-10 text-gray-300 mb-3" />
          <p className="font-medium text-gray-500">No bookings yet.</p>
          <Link to="/" className="mt-4">
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
