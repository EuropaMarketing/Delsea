import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, addMinutes, parseISO } from 'date-fns'
import { ArrowRight, CalendarRange } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function RescheduleConfirm() {
  const navigate = useNavigate()
  const { draft, services, rescheduleBookingId, rescheduleOriginalTime, clearReschedule } = useBookingStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmed = useRef(false)

  const service = services.find((s) => s.id === draft.serviceId)

  if (!rescheduleBookingId || !draft.date || !draft.timeSlot) {
    if (!confirmed.current) navigate('/my-bookings', { replace: true })
    return null
  }

  const [slotH, slotM] = draft.timeSlot.split(':').map(Number)
  const newStartsAt = new Date(draft.date)
  newStartsAt.setHours(slotH, slotM, 0, 0)
  const newEndsAt = addMinutes(newStartsAt, service?.duration_minutes ?? 60)

  async function handleConfirm() {
    confirmed.current = true
    setLoading(true)
    setError(null)
    const { error: err } = await supabase
      .from('bookings')
      .update({ starts_at: newStartsAt.toISOString(), ends_at: newEndsAt.toISOString() })
      .eq('id', rescheduleBookingId)
    if (err) {
      setError('Something went wrong — please try again.')
      setLoading(false)
      return
    }
    clearReschedule()
    navigate('/my-bookings', { state: { rescheduled: true } })
  }

  return (
    <div className="flex flex-col items-center py-10 px-4 text-center">
      <div
        className="h-16 w-16 rounded-full flex items-center justify-center mb-5"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, white)' }}
      >
        <CalendarRange className="h-8 w-8" style={{ color: 'var(--color-primary)' }} />
      </div>

      <h1 className="text-2xl font-bold text-gray-900">Confirm Reschedule</h1>
      <p className="text-sm text-gray-500 mt-2 max-w-sm">
        You're moving your {service?.name ?? 'appointment'} to the new time below.
      </p>

      <Card padding="md" className="mt-6 w-full max-w-sm text-left">
        {/* Old time */}
        {rescheduleOriginalTime && (
          <div className="mb-4 pb-4 border-b border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Current appointment</p>
            <p className="font-medium text-gray-500 line-through text-sm">
              {format(parseISO(rescheduleOriginalTime), 'EEE d MMM yyyy')}
            </p>
            <p className="text-gray-500 line-through text-sm">
              {format(parseISO(rescheduleOriginalTime), 'HH:mm')}
            </p>
          </div>
        )}

        {/* Arrow */}
        <div className="flex items-center gap-2 mb-4">
          <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'var(--color-primary)' }} />
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>
            New appointment
          </p>
        </div>

        {/* New time */}
        <p className="font-bold text-gray-900">
          {format(newStartsAt, 'EEEE d MMMM yyyy')}
        </p>
        <p className="text-gray-700 text-sm mt-0.5">
          {format(newStartsAt, 'HH:mm')} – {format(newEndsAt, 'HH:mm')}
        </p>
      </Card>

      {error && (
        <p className="mt-4 text-sm text-red-500">{error}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-6 w-full max-w-sm">
        <Button variant="secondary" fullWidth onClick={() => navigate('/datetime')}>
          Change time
        </Button>
        <Button fullWidth loading={loading} onClick={handleConfirm}>
          Confirm Reschedule
        </Button>
      </div>
    </div>
  )
}
