import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addMinutes, format, startOfDay, endOfDay } from 'date-fns'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { generateTimeSlots } from '@/lib/slots'
import { formatCurrency, formatDuration } from '@/lib/currency'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Availability, BlockedTime, Booking, Service } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function LinkedService() {
  const navigate = useNavigate()
  const { draft, services, selectedAddons, linkedService, setLinkedService } = useBookingStore()

  const service = services.find((s) => s.id === draft.serviceId)

  const [candidates, setCandidates] = useState<Service[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(true)
  const [selectedServiceId, setSelectedServiceId] = useState(linkedService?.serviceId ?? '')
  const [position, setPosition] = useState<'before' | 'after'>(linkedService?.position ?? 'after')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<{ startsAt: Date; endsAt: Date } | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!draft.serviceId) { navigate('/book'); return }
    supabase
      .from('services')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .eq('is_active', true)
      .eq('is_group_session', false)
      .neq('id', draft.serviceId)
      .order('name')
      .then(({ data }) => {
        setCandidates((data ?? []) as Service[])
        setLoadingCandidates(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.serviceId])

  if (!draft.serviceId || !draft.date || !draft.timeSlot) {
    navigate('/book')
    return null
  }

  const addonExtraDuration = selectedAddons.reduce((s, a) => s + a.duration_minutes, 0)
  const effectiveDuration = (draft.variantDuration ?? service?.duration_minutes ?? 60) + addonExtraDuration
  const [slotH, slotM] = draft.timeSlot.split(':').map(Number)
  const anchorStart = new Date(draft.date)
  anchorStart.setHours(slotH, slotM, 0, 0)
  const anchorEnd = addMinutes(anchorStart, effectiveDuration)

  const selectedCandidate = candidates.find((c) => c.id === selectedServiceId)

  async function checkAvailability(svc: Service, pos: 'before' | 'after') {
    setChecking(true)
    setChecked(false)
    setAvailable(null)

    const day = anchorStart
    const dayStart = startOfDay(day).toISOString()
    const dayEnd = endOfDay(day).toISOString()

    const [availRes, bookRes, blockRes] = await Promise.all([
      supabase.from('availability').select('*'),
      supabase.from('bookings').select('*').eq('business_id', BUSINESS_ID)
        .gte('starts_at', dayStart).lte('starts_at', dayEnd).neq('status', 'cancelled'),
      supabase.from('blocked_times').select('*').lt('starts_at', dayEnd).gt('ends_at', dayStart),
    ])

    const availability = (availRes.data ?? []) as Availability[]
    const bookings = (bookRes.data ?? []) as Booking[]
    const blockedTimes = (blockRes.data ?? []) as BlockedTime[]

    const candidateStart = pos === 'after' ? anchorEnd : addMinutes(anchorStart, -svc.duration_minutes)
    const candidateEnd = addMinutes(candidateStart, svc.duration_minutes)
    const candidateLabel = format(candidateStart, 'HH:mm')

    const slots = generateTimeSlots(day, availability, svc.duration_minutes, bookings, blockedTimes, svc.pre_buffer_minutes, svc.post_buffer_minutes)

    setChecking(false)
    setChecked(true)
    if (slots.includes(candidateLabel)) {
      setAvailable({ startsAt: candidateStart, endsAt: candidateEnd })
    } else {
      setAvailable(null)
    }
  }

  function selectService(svc: Service) {
    setSelectedServiceId(svc.id)
    checkAvailability(svc, position)
  }

  function selectPosition(pos: 'before' | 'after') {
    setPosition(pos)
    if (selectedCandidate) checkAvailability(selectedCandidate, pos)
  }

  function handleAdd() {
    if (!selectedCandidate || !available) return
    setLinkedService({
      serviceId: selectedCandidate.id,
      serviceName: selectedCandidate.name,
      price: selectedCandidate.price,
      durationMinutes: selectedCandidate.duration_minutes,
      position,
      startsAt: available.startsAt.toISOString(),
      endsAt: available.endsAt.toISOString(),
    })
    navigate('/details')
  }

  function handleSkip() {
    setLinkedService(null)
    navigate('/details')
  }

  const canAdd = !!selectedCandidate && !!available && !checking

  if (loadingCandidates) return <FullPageSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Another Treatment?</h1>
        <p className="text-sm text-gray-500 mt-1">
          Book a follow-on treatment immediately before or after your {service?.name.toLowerCase()}, if there's a free slot. Totally optional.
        </p>
      </div>

      {candidates.length === 0 ? (
        <Card padding="md" className="text-center py-10 text-gray-400 text-sm">No other treatments available to add.</Card>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {candidates.map((c) => {
              const isSelected = selectedServiceId === c.id
              return (
                <Card key={c.id} hover selected={isSelected} onClick={() => selectService(c)} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDuration(c.duration_minutes)}</p>
                  </div>
                  <span className="text-sm font-bold text-gray-900 shrink-0">{formatCurrency(c.price)}</span>
                </Card>
              )
            })}
          </div>

          {selectedCandidate && (
            <Card padding="md" className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">When?</p>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm w-fit">
                  <button type="button" onClick={() => selectPosition('before')}
                    className={`px-4 py-2 font-medium transition-colors ${position === 'before' ? 'bg-(--color-primary) text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                    Before my {service?.name.toLowerCase()}
                  </button>
                  <button type="button" onClick={() => selectPosition('after')}
                    className={`px-4 py-2 font-medium transition-colors ${position === 'after' ? 'bg-(--color-primary) text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                    After my {service?.name.toLowerCase()}
                  </button>
                </div>
              </div>

              {checking ? (
                <p className="text-sm text-gray-400 flex items-center gap-2"><Clock className="h-4 w-4 animate-pulse" /> Checking availability…</p>
              ) : checked && available ? (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">Available: {format(available.startsAt, 'HH:mm')}–{format(available.endsAt, 'HH:mm')}</p>
                </div>
              ) : checked ? (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">Not available at that time — try the other option, or skip.</p>
                </div>
              ) : null}
            </Card>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="secondary" onClick={() => navigate('/datetime')}>Back</Button>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleSkip}>Skip</Button>
          <Button size="lg" disabled={!canAdd} onClick={handleAdd}>Add & Continue</Button>
        </div>
      </div>
    </div>
  )
}
