import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { format, parseISO, isBefore, addHours } from 'date-fns'
import { CalendarClock, AlertTriangle, LogIn, CalendarRange, Phone, Ticket, Star, CheckCircle2, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useBookingStore } from '@/store/bookingStore'
import { useBrandStore } from '@/store/brandStore'
import { formatCurrency } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, PasswordInput } from '@/components/ui/Input'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import type { Service } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type MyMembership = {
  id: string
  tokens_remaining: number
  purchased_at: string
  expires_at: string | null
  plan: { name: string; description: string | null; token_count: number } | null
}

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
  const { services, setServices, setReschedule } = useBookingStore()
  const { config } = useBrandStore()
  const navigate = useNavigate()
  const { state: locationState } = useLocation()
  const justRescheduled = (locationState as { rescheduled?: boolean } | null)?.rescheduled ?? false

  const [tab, setTab] = useState<'bookings' | 'memberships'>('bookings')
  const [bookings, setBookings] = useState<MyBooking[]>([])
  const [memberships, setMemberships] = useState<MyMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [rpcError, setRpcError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState<string | null>(null)
  const [reviewTarget, setReviewTarget] = useState<MyBooking | null>(null)
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewerName, setReviewerName] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [showGooglePrompt, setShowGooglePrompt] = useState(false)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    const currentUser = user
    async function load() {
      // Ensure any guest bookings (made before account creation) are linked to this auth user.
      // This must complete before fetching bookings to avoid a race with the auth listener.
      if (currentUser.email) {
        await supabase.rpc('link_customer_to_user', {
          p_user_id: currentUser.id,
          p_email: currentUser.email,
        })
      }
      // Fetch customer IDs for this user first, so we can filter memberships to
      // only this user's own — admins would otherwise see all memberships via RLS.
      const { data: customerRows } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('business_id', BUSINESS_ID)
      const customerIds = (customerRows ?? []).map((c) => c.id)

      const [bRes, mRes] = await Promise.all([
        supabase.rpc('get_my_bookings', { p_business_id: BUSINESS_ID }),
        customerIds.length
          ? supabase
              .from('customer_memberships')
              .select('id, tokens_remaining, purchased_at, expires_at, plan:membership_plans(name, description, token_count)')
              .in('customer_id', customerIds)
              .order('purchased_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ])

      if (bRes.error) {
        setRpcError(`${bRes.error.message} (code: ${bRes.error.code})`)
      } else if (bRes.data) {
        type Row = MyBooking & { service_name: string; service_price: number; staff_name: string | null }
        const mapped = (bRes.data as Row[]).map((b) => ({
          ...b,
          service: { name: b.service_name, price: b.service_price },
          staff: b.staff_name ? { name: b.staff_name } : null,
        }))
        setBookings(mapped)

        // Check which past bookings have already been reviewed
        const ids = mapped.map((b) => b.id)
        if (ids.length) {
          const { data: reviewed } = await supabase
            .from('staff_reviews')
            .select('booking_id')
            .in('booking_id', ids)
          if (reviewed) {
            setReviewedIds(new Set(reviewed.filter((r) => r.booking_id).map((r) => r.booking_id as string)))
          }
        }
      }
      if (mRes.data) setMemberships(mRes.data as unknown as MyMembership[])
      setLoading(false)
    }
    load()
  }, [user])

  async function handleCancel(bookingId: string) {
    setCancelling(bookingId)
    await supabase.rpc('cancel_booking', { p_booking_id: bookingId })
    // Refund membership token if one was used (safe to call — returns false if none was used)
    await supabase.rpc('refund_token_for_booking', { p_booking_id: bookingId })
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled' } : b)),
    )
    setCancelling(null)
    setCancelTarget(null)
  }

  function openReview(booking: MyBooking) {
    setReviewTarget(booking)
    setReviewRating(5)
    setReviewComment('')
    setReviewError('')
    setReviewerName(user?.user_metadata?.full_name ?? '')
  }

  async function handleSubmitReview() {
    if (!reviewTarget || !reviewerName.trim()) { setReviewError('Please enter your name'); return }
    setReviewSubmitting(true)
    setReviewError('')
    const { error } = await supabase.from('staff_reviews').insert({
      business_id: BUSINESS_ID,
      booking_id: reviewTarget.id,
      staff_id: reviewTarget.staff_id,
      reviewer_name: reviewerName.trim(),
      rating: reviewRating,
      comment: reviewComment.trim() || null,
      is_approved: true,
    })
    if (error) {
      setReviewError(error.message.includes('unique') ? 'You have already reviewed this booking.' : error.message)
    } else {
      setReviewedIds((prev) => new Set([...prev, reviewTarget.id]))
      setReviewTarget(null)
      if (reviewRating === 5 && config.googleReviewUrl) setShowGooglePrompt(true)
    }
    setReviewSubmitting(false)
  }

  async function handleReschedule(booking: MyBooking) {
    setRescheduling(booking.id)
    // Ensure services are loaded in the store so DateTimePicker can generate slots
    if (!services.length) {
      const { data } = await supabase
        .from('services')
        .select('*')
        .eq('business_id', BUSINESS_ID)
        .eq('is_active', true)
      if (data) setServices(data as Service[])
    }
    setReschedule(booking.id, booking.starts_at, booking.service_id, booking.staff_id)
    setRescheduling(null)
    navigate('/datetime')
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
    const now = new Date()
    const startsAt = parseISO(booking.starts_at)
    const isUpcoming = isBefore(now, startsAt)
    const canActOnline =
      booking.status === 'confirmed' &&
      isUpcoming &&
      isBefore(addHours(now, 24), startsAt)
    const tooCloseToChange =
      booking.status === 'confirmed' &&
      isUpcoming &&
      !isBefore(addHours(now, 24), startsAt)
    const isThisRescheduling = rescheduling === booking.id
    const isReviewable = !isUpcoming && booking.status !== 'cancelled'
    const alreadyReviewed = reviewedIds.has(booking.id)

    return (
      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900">{booking.service?.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {booking.staff?.name ?? (booking.staff_id === null ? 'Self-service' : 'Any team member')}
            </p>
          </div>
          <Badge variant={statusBadgeVariant(booking.status)} className="capitalize shrink-0">
            {booking.status}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 text-gray-600">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span>{format(startsAt, 'EEE d MMM yyyy, HH:mm')}</span>
          </div>
          <span className="font-bold text-gray-900">
            {booking.service ? formatCurrency(booking.service.price) : '—'}
          </span>
        </div>
        {canActOnline && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={isThisRescheduling}
              onClick={() => handleReschedule(booking)}
            >
              <CalendarRange className="h-3.5 w-3.5" />
              Reschedule
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setCancelTarget(booking.id)}
            >
              Cancel
            </Button>
          </div>
        )}
        {tooCloseToChange && (
          <div className="flex items-start gap-2 text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <Phone className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
            <span>
              Within 24 hours of your appointment — to reschedule or cancel, please contact us at{' '}
              <a href={`mailto:${config.businessEmail}`} className="font-medium text-amber-700 hover:underline">
                {config.businessEmail}
              </a>
            </span>
          </div>
        )}
        {isReviewable && (
          alreadyReviewed ? (
            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Review submitted — thank you!
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => openReview(booking)} className="self-start">
              <Star className="h-3.5 w-3.5" />
              Leave a Review
            </Button>
          )
        )}
      </Card>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your bookings and memberships.</p>
        </div>
        <Link to="/book">
          <Button size="sm">New Booking</Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['bookings', 'memberships'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
              tab === t
                ? 'border-(--color-primary) text-(--color-primary)'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'memberships' && <Ticket className="h-3.5 w-3.5" />}
            {t === 'bookings' ? 'My Bookings' : `Memberships${memberships.length ? ` (${memberships.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Bookings tab */}
      {tab === 'bookings' && (
        <>
          {justRescheduled && (
            <div className="mb-5 flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3.5">
              <CalendarRange className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-800">Booking rescheduled</p>
                <p className="text-xs text-green-600 mt-0.5">Your appointment has been moved to the new time.</p>
              </div>
            </div>
          )}

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
        </>
      )}

      {/* Memberships tab */}
      {tab === 'memberships' && (
        <div>
          {memberships.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Ticket className="h-10 w-10 text-gray-300 mb-3" />
              <p className="font-medium text-gray-500">No memberships yet.</p>
              <Link to="/memberships" className="mt-4">
                <Button>Browse Plans</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {memberships.map((m) => {
                const total = m.plan?.token_count ?? 0
                const remaining = m.tokens_remaining
                const pct = total > 0 ? Math.round((remaining / total) * 100) : 0
                return (
                  <Card key={m.id} padding="md" className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{m.plan?.name ?? 'Membership'}</p>
                        {m.plan?.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{m.plan.description}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`text-2xl font-extrabold ${remaining === 0 ? 'text-gray-300' : ''}`}
                          style={remaining > 0 ? { color: 'var(--color-primary)' } : undefined}
                        >
                          {remaining}
                        </span>
                        <p className="text-xs text-gray-400">of {total} sessions left</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: 'var(--color-primary)' }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Purchased {format(parseISO(m.purchased_at), 'd MMM yyyy')}</span>
                      {m.expires_at ? (
                        <span>Expires {format(parseISO(m.expires_at), 'd MMM yyyy')}</span>
                      ) : (
                        <span>No expiry</span>
                      )}
                    </div>

                    {remaining === 0 && (
                      <Link to="/memberships">
                        <Button variant="secondary" size="sm" fullWidth>Buy More Sessions</Button>
                      </Link>
                    )}
                  </Card>
                )
              })}
              <div className="pt-2 text-center">
                <Link to="/memberships" className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
                  Browse membership plans →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review modal */}
      <Modal
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        title="Leave a Review"
        size="sm"
      >
        {reviewTarget && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm">
              <p className="font-medium text-gray-900">{reviewTarget.service.name}</p>
              {reviewTarget.staff && (
                <p className="text-xs text-gray-500 mt-0.5">with {reviewTarget.staff.name}</p>
              )}
            </div>

            {/* Star rating */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Your rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setReviewRating(n)}
                    className="p-0.5 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-8 w-8 transition-colors ${
                        n <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-gray-200 hover:text-amber-200'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Your name</label>
              <input
                type="text"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
              />
            </div>

            {/* Comment */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Comment <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Tell us about your experience…"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 bg-white rounded-lg outline-none resize-none focus:ring-2 focus:ring-(--color-primary)"
              />
            </div>

            {reviewError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {reviewError}
              </p>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setReviewTarget(null)}>Cancel</Button>
              <Button fullWidth loading={reviewSubmitting} onClick={handleSubmitReview}>
                Submit Review
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
