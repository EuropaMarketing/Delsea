import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Clock, Tag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { formatCurrency, formatDuration } from '@/lib/currency'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Service } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function ServiceSelection() {
  const navigate = useNavigate()
  const { draft, setService, setServices, services } = useBookingStore()

  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [selected, setSelected] = useState<string | null>(draft.serviceId)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('services')
        .select('*')
        .eq('business_id', BUSINESS_ID)
        .eq('is_active', true)
        .order('category')
        .order('name')
      if (data) setServices(data as Service[])
      setLoading(false)
    }
    load()
  }, [setServices])

  const categories = ['All', ...Array.from(new Set(services.map((s) => s.category)))]

  const filtered = services.filter((s) => {
    const matchCat = activeCategory === 'All' || s.category === activeCategory
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  function handleSelect(service: Service) {
    setSelected(service.id)
    setService(service.id)
  }

  function handleNext() {
    if (!selected) return
    navigate('/staff')
  }

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Choose a Service</h1>
        <p className="text-sm text-gray-500 mt-1">Select what you'd like to book today.</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services…"
          className="w-full h-10 pl-9 pr-3 text-sm border border-gray-200 bg-white outline-none transition-colors [border-radius:var(--border-radius-sm)] focus:ring-2 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] placeholder:text-gray-400"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-6 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-4 py-1.5 text-sm font-medium rounded-full border transition-colors ${
              activeCategory === cat
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Service grid */}
      {filtered.length === 0 ? (
        <p className="text-center text-gray-500 py-16">No services found.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((service) => (
            <Card
              key={service.id}
              hover
              selected={selected === service.id}
              onClick={() => handleSelect(service)}
              className="flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{service.name}</h3>
                  {service.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{service.description}</p>
                  )}
                </div>
                <Badge variant="brand">
                  <Tag className="h-3 w-3 mr-1" />
                  {service.category}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(service.duration_minutes)}
                </div>
                <span className="font-bold text-gray-900">{formatCurrency(service.price)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button size="lg" disabled={!selected} onClick={handleNext}>
          Continue
        </Button>
      </div>
    </div>
  )
}
