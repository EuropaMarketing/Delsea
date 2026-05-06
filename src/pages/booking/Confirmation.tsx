import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, addMinutes } from 'date-fns'
import { ShieldCheck, Ticket } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency, formatDuration, calculateDeposit } from '@/lib/currency'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function Confirmation() {
  const navigate = useNavigate()
  const { draft, services, staff, reset, useToken, tokenMembershipId, tokenPlanName } = useBookingStore()
  const { user } = useAuthStore()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmed = useRef(false)

  const service = services.find((s) => s.id === draft.serviceId)
  const staffMember = staff.find((s) => s.id === draft.staffId)

  if (!draft.serviceId || !draft.date || !draft.timeSlot || !draft.customerEmail) {
    if (!confirmed.current) navigate('/book')
    return null
  }

  const [slotH, slotM] = draft.timeSlot.split(':').map(Number)
  const startsAt = new Date(draft.date)
  startsAt.setHours(slotH, slotM, 0, 0)
  const endsAt = addMinutes(startsAt, service?.duration_minutes ?? 60)

  const depositAmount = service ? calculateDeposit(service) : 0
  const hasDeposit = depositAmount > 0
  const balanceDue = (service?.price ?? 0) - depositAmount

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    try {
      let resolvedStaffId = draft.staffId
      if (!resolvedStaffId && !service?.is_self_service && staff.length) resolvedStaffId = staff[0].id

      const { data: bookingId, error: bErr } = await supabase
        .rpc('create_booking', {
          p_business_id: BUSINESS_ID,
          p_user_id: user?.id ?? null,
          p_name: draft.customerName,
          p_email: draft.customerEmail,
          p_phone: draft.customerPhone || null,
          p_staff_id: resolvedStaffId ?? null,
          p_service_id: draft.serviceId,
          p_starts_at: startsAt.toISOString(),
          p_ends_at: endsAt.toISOString(),
          p_notes: draft.notes || null,
        })

      if (bErr) throw bErr

      // Redeem membership token if selected
      if (useToken && tokenMembershipId) {
        await supabase.rpc('redeem_token', {
          p_booking_id: bookingId as string,
          p_membership_id: tokenMembershipId,
        })
      }

      const ref = (bookingId as string).slice(0, 8).toUpperCase()
      const customerEmail = draft.customerEmail
      const wasGuest = !user
      confirmed.current = true
      reset()
      navigate('/booking-confirmed', {
        replace: true,
        state: {
          bookingRef: ref,
          serviceName: service?.name ?? '',
          serviceDuration: service?.duration_minutes ?? 0,
          servicePrice: service?.price ?? 0,
          staffName: staffMember?.name ?? null,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          customerEmail,
          isNewUser: wasGuest,
          depositAmount,
        },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? 'Something went wrong. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
        <p className="text-sm text-gray-500 mt-1">Review your booking before confirming.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Left — order summary */}
        <div className="space-y-4">
          {/* Service & appointment */}
          <Card padding="md">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Appointment</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Service</dt>
                <dd className="font-semibold text-gray-900">{service?.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Duration</dt>
                <dd className="text-gray-700">{service ? formatDuration(service.duration_minutes) : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Date</dt>
                <dd className="font-medium text-gray-900">{format(startsAt, 'EEEE d MMMM yyyy')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Time</dt>
                <dd className="font-medium" style={{ color: 'var(--color-primary)' }}>
                  {format(startsAt, 'HH:mm')} – {format(endsAt, 'HH:mm')}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Team member</dt>
                <dd className="text-gray-700">
                  {service?.is_self_service ? 'Self-service' : staffMember?.name ?? 'Any available'}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Customer */}
          <Card padding="md">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Your Details</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Name</dt>
                <dd className="font-medium text-gray-900">{draft.customerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Email</dt>
                <dd className="text-gray-700">{draft.customerEmail}</dd>
              </div>
              {draft.customerPhone && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="text-gray-700">{draft.customerPhone}</dd>
                </div>
              )}
              {draft.notes && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0">Notes</dt>
                  <dd className="text-gray-700 text-right">{draft.notes}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>

        {/* Right — payment summary */}
        <div>
          <Card padding="md" className="border-2 lg:sticky lg:top-24" style={{ borderColor: 'var(--color-primary)' }}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Payment Summary</h2>

            {useToken ? (
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total</span>
                  <span className="font-semibold text-gray-900 line-through">{formatCurrency(service?.price ?? 0)}</span>
                </div>
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                  <Ticket className="h-4 w-4 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Paid via membership</p>
                    <p className="text-xs text-green-600">{tokenPlanName} · 1 session redeemed</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(service?.price ?? 0)}</span>
                </div>
                {hasDeposit ? (
                  <div className="border-t border-gray-100 pt-2 mt-2 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Deposit due today</span>
                      <span className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>
                        {formatCurrency(depositAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Balance at appointment</span>
                      <span className="text-gray-500">{formatCurrency(balanceDue)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-gray-100 pt-2 mt-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Due at appointment</span>
                      <span className="text-gray-500">{formatCurrency(service?.price ?? 0)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button fullWidth size="lg" loading={loading} onClick={handleConfirm}>
              {useToken ? 'Confirm Booking' : hasDeposit ? `Confirm & Pay ${formatCurrency(depositAmount)} Deposit` : 'Confirm Booking'}
            </Button>

            <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-gray-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{useToken ? 'Membership session · no payment needed' : `Secure booking${hasDeposit ? ' · Payment coming soon' : ''}`}</span>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Button variant="secondary" onClick={() => navigate('/details')}>
          Back
        </Button>
      </div>
    </div>
  )
}
