import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { CheckCircle2, Mail, UserCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency, formatDuration } from '@/lib/currency'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function CustomerDetails() {
  const navigate = useNavigate()
  const { draft, setCustomer, services, staff } = useBookingStore()
  const { user } = useAuthStore()

  const [form, setForm] = useState({
    name: draft.customerName || '',
    email: draft.customerEmail || '',
    phone: draft.customerPhone || '',
    notes: draft.notes || '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Sign-in flow for returning customers
  const [signInEmail, setSignInEmail] = useState('')
  const [signInSent, setSignInSent] = useState(false)
  const [signInLoading, setSignInLoading] = useState(false)
  const [signInError, setSignInError] = useState('')

  const service = services.find((s) => s.id === draft.serviceId)
  const staffMember = staff.find((s) => s.id === draft.staffId)

  // Pre-fill form when user signs in
  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        email: user.email ?? f.email,
        name: user.user_metadata?.full_name ?? f.name,
      }))
      // Also try to fetch their customer record for phone
      supabase
        .from('customers')
        .select('name, phone')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setForm((f) => ({
            ...f,
            name: data.name ?? f.name,
            phone: data.phone ?? f.phone,
          }))
        })
    }
  }, [user])

  if (!draft.serviceId || !draft.date || !draft.timeSlot) {
    navigate('/book')
    return null
  }

  const [slotH, slotM] = draft.timeSlot.split(':').map(Number)
  const startsAt = new Date(draft.date)
  startsAt.setHours(slotH, slotM, 0, 0)

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.email.trim()) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email'
    return e
  }

  function handleChange(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((e) => { const n = { ...e }; delete n[field]; return n })
  }

  function handleNext() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setCustomer({
      customerName: form.name,
      customerEmail: form.email,
      customerPhone: form.phone,
      notes: form.notes,
    })
    navigate('/confirm')
  }

  async function handleSignIn() {
    if (!signInEmail.trim()) { setSignInError('Enter your email'); return }
    setSignInLoading(true)
    setSignInError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: signInEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/my-bookings`,
      },
    })
    if (error) {
      // No account found — treat as new customer
      setSignInError("No account found with that email. Fill in your details below.")
      setSignInEmail('')
    } else {
      setSignInSent(true)
    }
    setSignInLoading(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Your Details</h1>
        <p className="text-sm text-gray-500 mt-1">Almost there — just a few more details.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">

          {/* Auth section */}
          {user ? (
            <Card padding="sm" className="flex items-center gap-3 border-green-100 bg-green-50">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-800">Signed in as {user.email}</p>
                <p className="text-xs text-green-600">Your details have been pre-filled.</p>
              </div>
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-xs text-green-700 hover:text-green-900 underline shrink-0"
              >
                Sign out
              </button>
            </Card>
          ) : (
            <Card padding="md" className="border-gray-100 bg-gray-50">
              <div className="flex items-start gap-3 mb-3">
                <UserCircle2 className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Already booked with us?</p>
                  <p className="text-xs text-gray-500 mt-0.5">Sign in to pre-fill your details and view your booking history.</p>
                </div>
              </div>
              {signInSent ? (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>Magic link sent to <strong>{signInEmail}</strong> — check your inbox.</span>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={signInEmail}
                      onChange={(e) => { setSignInEmail(e.target.value); setSignInError('') }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                      placeholder="your@email.com"
                      className="flex-1 h-9 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                    />
                    <Button size="sm" loading={signInLoading} onClick={handleSignIn}>
                      Sign in
                    </Button>
                  </div>
                  {signInError && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                      {signInError}
                    </p>
                  )}
                </>
              )}
              <p className="text-xs text-gray-400 mt-3">
                New customer? Fill in your details below — we'll create your account automatically after booking.
              </p>
            </Card>
          )}

          {/* Details form */}
          <Input
            label="Full Name"
            required
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Jane Smith"
            error={errors.name}
          />
          <Input
            label="Email Address"
            type="email"
            required
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="jane@example.com"
            error={errors.email}
            readOnly={!!user}
          />
          <Input
            label="Phone Number"
            type="tel"
            value={form.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="+44 7700 900000"
          />
          <Textarea
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Any special requests or information…"
          />
        </div>

        {/* Booking summary */}
        <Card padding="md" className="h-fit">
          <h3 className="font-semibold text-gray-900 mb-4">Booking Summary</h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Service</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{service?.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Duration</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{service ? formatDuration(service.duration_minutes) : '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Team Member</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{staffMember?.name ?? 'Any available'}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Date & Time</dt>
              <dd className="font-medium text-gray-900 mt-0.5">
                {format(startsAt, 'EEE d MMM yyyy')}
                <br />
                <span style={{ color: 'var(--color-primary)' }}>{draft.timeSlot}</span>
              </dd>
            </div>
            <div className="pt-3 border-t border-gray-100">
              <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">Total</dt>
              <dd className="font-bold text-xl text-gray-900 mt-0.5">
                {service ? formatCurrency(service.price) : '—'}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="secondary" onClick={() => navigate('/datetime')}>
          Back
        </Button>
        <Button size="lg" onClick={handleNext}>
          Review Booking
        </Button>
      </div>
    </div>
  )
}
