import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, addMinutes } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency, formatDuration } from '@/lib/currency'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function Confirmation() {
  const navigate = useNavigate()
  const { draft, services, staff, reset } = useBookingStore()
  const { user } = useAuthStore()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const service = services.find((s) => s.id === draft.serviceId)
  const staffMember = staff.find((s) => s.id === draft.staffId)

  if (!draft.serviceId || !draft.date || !draft.timeSlot || !draft.customerEmail) {
    navigate('/book')
    return null
  }

  const [slotH, slotM] = draft.timeSlot.split(':').map(Number)
  const startsAt = new Date(draft.date)
  startsAt.setHours(slotH, slotM, 0, 0)
  const endsAt = addMinutes(startsAt, service?.duration_minutes ?? 60)

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    try {
      // Find or create customer via SECURITY DEFINER function (bypasses RLS for returning guests)
      const { data: customerId, error: cErr } = await supabase
        .rpc('find_or_create_customer', {
          p_business_id: BUSINESS_ID,
          p_user_id: user?.id ?? null,
          p_name: draft.customerName,
          p_email: draft.customerEmail,
          p_phone: draft.customerPhone || null,
        })

      if (cErr) throw cErr

      // Resolve staff: if no preference, pick first available
      let resolvedStaffId = draft.staffId
      if (!resolvedStaffId && staff.length) {
        resolvedStaffId = staff[0].id
      }

      const { data: booking, error: bErr } = await supabase
        .from('bookings')
        .insert({
          business_id: BUSINESS_ID,
          customer_id: customerId,
          staff_id: resolvedStaffId,
          service_id: draft.serviceId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: 'confirmed',
          notes: draft.notes || null,
        })
        .select('id')
        .single()

      if (bErr) throw bErr

      const ref = booking.id.slice(0, 8).toUpperCase()
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
          customerEmail: draft.customerEmail,
        },
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Confirm Booking</h1>
        <p className="text-sm text-gray-500 mt-1">Please review your details before confirming.</p>
      </div>

      <Card padding="md" className="max-w-lg">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Service</dt>
            <dd className="font-semibold text-gray-900 mt-1 text-base">{service?.name}</dd>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Duration</dt>
              <dd className="font-medium text-gray-900 mt-1">{service ? formatDuration(service.duration_minutes) : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Price</dt>
              <dd className="font-bold text-gray-900 mt-1 text-base">{service ? formatCurrency(service.price) : '—'}</dd>
            </div>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Team Member</dt>
            <dd className="font-medium text-gray-900 mt-1">{staffMember?.name ?? 'Any available'}</dd>
          </div>
          <div className="pt-4 border-t border-gray-100">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Date & Time</dt>
            <dd className="font-semibold text-gray-900 mt-1">
              {format(startsAt, 'EEEE, d MMMM yyyy')} at{' '}
              <span style={{ color: 'var(--color-primary)' }}>{format(startsAt, 'HH:mm')}</span>
              {' '}– {format(endsAt, 'HH:mm')}
            </dd>
          </div>
          <div className="pt-4 border-t border-gray-100">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Customer</dt>
            <dd className="mt-1 space-y-0.5">
              <p className="font-medium text-gray-900">{draft.customerName}</p>
              <p className="text-gray-500">{draft.customerEmail}</p>
              {draft.customerPhone && <p className="text-gray-500">{draft.customerPhone}</p>}
            </dd>
          </div>
          {draft.notes && (
            <div className="pt-4 border-t border-gray-100">
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Notes</dt>
              <dd className="text-gray-600 mt-1">{draft.notes}</dd>
            </div>
          )}
        </dl>
      </Card>

      {error && (
        <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="secondary" onClick={() => navigate('/details')}>
          Back
        </Button>
        <Button size="lg" loading={loading} onClick={handleConfirm}>
          Confirm Booking
        </Button>
      </div>
    </div>
  )
}
