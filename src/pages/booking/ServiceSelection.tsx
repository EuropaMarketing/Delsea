import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Clock, Tag, Heart, RotateCcw, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { useFavourites } from '@/hooks/useFavourites'
import { usePreviousBookings } from '@/hooks/usePreviousBookings'
import { formatCurrency, formatDuration } from '@/lib/currency'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Service } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function ServiceSelection() {
  const navigate = useNavigate()
  const { draft, setService, setStaff, setServices, services } = useBookingStore()
  const { favourites, toggle, isFavourite } = useFavourites()
  const previousBookings = usePreviousBookings()

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

  const favouriteServices = services.filter((s) => isFavourite(s.id))

  function handleSelect(service: Service) {
    setSelected(service.id)
    setService(service.id)
  }

  function handleQuickBook(service: Service) {
    setService(service.id)
    navigate('/staff')
  }

  function handleBookAgain(serviceId: string, staffId: string | null) {
    setService(serviceId)
    if (staffId) setStaff(staffId)
    navigate('/datetime')
  }

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Choose a Service</h1>
        <p className="text-sm text-gray-500 mt-1">Select what you'd like to book today.</p>
      </div>

      {/* Favourites quick-access row */}
      {favouriteServices.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-1.5 mb-3">
            <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Favourites</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {favouriteServices.map((service) => (
              <button
                key={service.id}
                onClick={() => handleQuickBook(service)}
                className="shrink-0 w-44 text-left bg-white border-2 rounded-xl p-3 transition-all hover:shadow-md"
                style={{ borderColor: 'var(--color-primary)' }}
              >
                <div className="flex items-start justify-between gap-1 mb-2">
                  <p className="font-semibold text-sm text-gray-900 leading-tight line-clamp-2">{service.name}</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(service.id) }}
                    className="shrink-0 p-0.5 -mt-0.5 -mr-0.5"
                    aria-label="Remove from favourites"
                  >
                    <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-auto">
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    {formatDuration(service.duration_minutes)}
                  </span>
                  <span className="text-xs font-bold text-gray-900">{formatCurrency(service.price)}</span>
                </div>
                <p className="text-xs mt-2 font-medium" style={{ color: 'var(--color-primary)' }}>
                  Quick book →
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Previously booked quick-access row */}
      {previousBookings.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-1.5 mb-3">
            <RotateCcw className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Book Again</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {previousBookings.map((prev, i) => (
              <button
                key={i}
                onClick={() => handleBookAgain(prev.serviceId, prev.staffId)}
                className="shrink-0 w-44 text-left bg-white border border-gray-200 rounded-xl p-3 transition-all hover:shadow-md hover:border-gray-300"
              >
                <p className="font-semibold text-sm text-gray-900 leading-tight line-clamp-2 mb-1">{prev.serviceName}</p>
                {prev.staffName && (
                  <div className="flex items-center gap-1 mb-2">
                    <User className="h-3 w-3 text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-400 truncate">{prev.staffName}</span>
                  </div>
                )}
                <div className="flex items-center justify-between mt-1">
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    {formatDuration(prev.service.duration_minutes)}
                  </span>
                  <span className="text-xs font-bold text-gray-900">{formatCurrency(prev.service.price)}</span>
                </div>
                <p className="text-xs mt-2 font-medium text-gray-400">Book again →</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services…"
          className="w-full h-10 pl-9 pr-3 text-sm border border-gray-200 bg-white outline-none transition-colors rounded-(--border-radius-sm) focus:ring-2 focus:ring-(--color-primary) focus:border-(--color-primary) placeholder:text-gray-400"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-6 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 px-4 py-1.5 text-sm font-medium rounded-full border transition-colors ${
              activeCategory === cat
                ? 'bg-(--color-primary) text-white border-(--color-primary)'
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
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(service.id) }}
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                    aria-label={isFavourite(service.id) ? 'Remove from favourites' : 'Add to favourites'}
                  >
                    <Heart
                      className={`h-4 w-4 transition-colors ${
                        isFavourite(service.id)
                          ? 'fill-red-500 text-red-500'
                          : 'text-gray-300 hover:text-red-400'
                      }`}
                    />
                  </button>
                  <Badge variant="brand">
                    <Tag className="h-3 w-3 mr-1" />
                    {service.category}
                  </Badge>
                </div>
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
        <Button size="lg" disabled={!selected} onClick={() => navigate('/staff')}>
          Continue
        </Button>
      </div>
    </div>
  )
}
