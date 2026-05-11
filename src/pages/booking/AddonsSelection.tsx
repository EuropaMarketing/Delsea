import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import type { AddonSelection } from '@/store/bookingStore'
import { formatCurrency, formatDuration } from '@/lib/currency'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'

export default function AddonsSelection() {
  const navigate = useNavigate()
  const { draft, selectedAddons, setAddons } = useBookingStore()

  const [available, setAvailable] = useState<AddonSelection[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set(selectedAddons.map((a) => a.id)))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!draft.serviceId) { navigate('/book'); return }
    supabase
      .rpc('get_available_addons', {
        p_service_id: draft.serviceId,
        p_staff_id: draft.staffId,
      })
      .then(({ data }) => {
        const list = (data ?? []) as AddonSelection[]
        if (list.length === 0) {
          navigate('/datetime', { replace: true })
          return
        }
        setAvailable(list)
        setLoading(false)
      })
  }, [draft.serviceId, draft.staffId, navigate])

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleContinue() {
    setAddons(available.filter((a) => chosen.has(a.id)))
    navigate('/datetime')
  }

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Extras</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enhance your appointment with an optional add-on treatment.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-6">
        {available.map((addon) => {
          const isSelected = chosen.has(addon.id)
          return (
            <Card
              key={addon.id}
              hover
              selected={isSelected}
              onClick={() => toggle(addon.id)}
              className="flex items-start gap-4"
            >
              <div
                className="mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                style={{
                  borderColor: isSelected ? 'var(--color-primary)' : '#d1d5db',
                  backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
                }}
              >
                {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{addon.name}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    +{formatDuration(addon.duration_minutes)}
                  </span>
                  <span className="text-xs font-bold text-gray-900">+{formatCurrency(addon.price)}</span>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => navigate('/staff')}>
          Back
        </Button>
        <Button size="lg" onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}
