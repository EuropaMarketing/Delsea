import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { LogIn } from 'lucide-react'
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
    name: draft.customerName || user?.user_metadata?.full_name || '',
    email: draft.customerEmail || user?.email || '',
    phone: draft.customerPhone || '',
    notes: draft.notes || '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showLogin, setShowLogin] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginSent, setLoginSent] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)

  const service = services.find((s) => s.id === draft.serviceId)
  const staffMember = staff.find((s) => s.id === draft.staffId)

  if (!draft.serviceId || !draft.date || !draft.timeSlot) {
    navigate('/')
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

  async function handleMagicLink() {
    if (!loginEmail) return
    setLoginLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: loginEmail,
      options: { shouldCreateUser: true },
    })
    if (!error) setLoginSent(true)
    setLoginLoading(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Your Details</h1>
        <p className="text-sm text-gray-500 mt-1">
          Almost there — just a few more details.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {!user && (
            <Card padding="sm" className="bg-gray-50 border-gray-100">
              {showLogin ? (
                loginSent ? (
                  <p className="text-sm text-gray-600">
                    Check your email for a magic link to sign in. You can also continue as a guest below.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="flex-1 h-9 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                    <Button size="sm" loading={loginLoading} onClick={handleMagicLink}>
                      Send Link
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowLogin(false)}>
                      Cancel
                    </Button>
                  </div>
                )
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Sign in to manage bookings easily.
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setShowLogin(true)}>
                    <LogIn className="h-3.5 w-3.5" />
                    Sign in
                  </Button>
                </div>
              )}
            </Card>
          )}

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
                <span className="text-[var(--color-primary)]">{draft.timeSlot}</span>
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
