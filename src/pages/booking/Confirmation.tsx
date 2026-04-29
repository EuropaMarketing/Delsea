import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, addMinutes } from 'date-fns'
import { CheckCircle2, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency, formatDuration } from '@/lib/currency'
import { buildICSLink } from '@/lib/slots'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import brand from '@/config/brand'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function Confirmation() {
  const navigate = useNavigate()
  const { draft, services, staff, reset } = useBookingStore()
  const { user } = useAuthStore()

  const [loading, setLoading] = useState(false)
  const [bookingRef, setBookingRef] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const service = services.find((s) => s.id === draft.serviceId)
  const staffMember = staff.find((s) => s.id === draft.staffId)

  if (!draft.serviceId || !draft.date || !draft.timeSlot || !draft.customerEmail) {
    navigate('/')
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
      // Upsert customer
      const { data: customer, error: cErr } = await supabase
        .from('customers')
        .upsert(
          {
            business_id: BUSINESS_ID,
            user_id: user?.id ?? null,
            name: draft.customerName,
            email: draft.customerEmail,
            phone: draft.customerPhone || null,
          },
          { onConflict: 'business_id,email', ignoreDuplicates: false },
        )
        .select('id')
        .single()

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
          customer_id: customer.id,
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

      setBookingRef(booking.id.slice(0, 8).toUpperCase())
      reset()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (bookingRef) {
    const icsUrl = buildICSLink(
      `${service?.name} at ${brand.brandName}`,
      startsAt.toISOString(),
      endsAt.toISOString(),
      brand.brandName,
      `Booking reference: ${bookingRef}`,
    )

    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div
          className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, white)' }}
        >
          <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--color-primary)' }} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h1>
        <p className="text-gray-500 mt-2 text-sm max-w-sm">
          We've got you in. A confirmation email will be sent to {draft.customerEmail}.
        </p>
        <div className="mt-4 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">Booking reference</p>
          <p className="font-mono font-bold text-lg text-gray-900">{bookingRef}</p>
        </div>

        <Card padding="md" className="mt-6 w-full max-w-sm text-left">
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Service</dt>
              <dd className="font-medium">{service?.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Date</dt>
              <dd className="font-medium">{format(startsAt, 'EEE d MMM yyyy')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Time</dt>
              <dd className="font-medium">{format(startsAt, 'HH:mm')}</dd>
            </div>
            {staffMember && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Team Member</dt>
                <dd className="font-medium">{staffMember.name}</dd>
              </div>
            )}
          </dl>
        </Card>

        <div className="flex gap-3 mt-6 flex-wrap justify-center">
          <a href={icsUrl} download="booking.ics">
            <Button variant="secondary">
              <Calendar className="h-4 w-4" />
              Add to Calendar
            </Button>
          </a>
          <Button onClick={() => navigate('/my-bookings')}>
            View My Bookings
          </Button>
        </div>
      </div>
    )
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
