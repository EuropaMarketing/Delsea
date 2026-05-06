import { useEffect, useState } from 'react'
import { Clock, MapPin, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBrandStore } from '@/store/brandStore'
import { FullPageSpinner } from '@/components/ui/Spinner'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

interface Photo { id: string; url: string; caption: string | null }
interface Review {
  id: string
  staff_id: string | null
  reviewer_name: string
  rating: number
  comment: string | null
  created_at: string
  staff: { name: string; avatar_url: string | null } | null
}

function StarRow({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  return (
    <div className="flex">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`${cls} ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
      ))}
    </div>
  )
}

export default function About() {
  const { config } = useBrandStore()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [pRes, rRes] = await Promise.all([
        supabase
          .from('portfolio_photos')
          .select('id, url, caption')
          .eq('business_id', BUSINESS_ID)
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('staff_reviews')
          .select('id, staff_id, reviewer_name, rating, comment, created_at, staff:staff_id(name, avatar_url)')
          .eq('business_id', BUSINESS_ID)
          .eq('is_approved', true)
          .order('created_at', { ascending: false }),
      ])
      if (pRes.data) setPhotos(pRes.data as Photo[])
      if (rRes.data) setReviews(rRes.data as unknown as Review[])
      setLoading(false)
    }
    load()
  }, [])

  const approvedReviews = reviews
  const avgRating = approvedReviews.length
    ? approvedReviews.reduce((s, r) => s + r.rating, 0) / approvedReviews.length
    : null

  // Group by staff for the "per-staff" summary
  const staffMap = new Map<string, { name: string; avg: number; count: number }>()
  approvedReviews.forEach((r) => {
    if (!r.staff_id || !r.staff) return
    const existing = staffMap.get(r.staff_id)
    if (existing) {
      staffMap.set(r.staff_id, { name: r.staff.name, avg: existing.avg + r.rating, count: existing.count + 1 })
    } else {
      staffMap.set(r.staff_id, { name: r.staff.name, avg: r.rating, count: 1 })
    }
  })
  const staffRatings = [...staffMap.entries()].map(([id, v]) => ({ id, name: v.name, avg: v.avg / v.count, count: v.count }))

  const openingHours = config.openingHours ?? []
  const todayName = new Date().toLocaleDateString('en-GB', { weekday: 'long' })

  const hasContent = config.aboutText || photos.length > 0 || approvedReviews.length > 0 || openingHours.length > 0 || config.address || config.mapEmbedUrl

  if (loading) return <FullPageSpinner />

  if (!hasContent) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-sm">No information available yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-14">
      {/* About */}
      {config.aboutText && (
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">About Us</h2>
          <p className="text-gray-600 leading-relaxed whitespace-pre-line max-w-2xl">{config.aboutText}</p>
        </section>
      )}

      {/* Gallery */}
      {photos.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Gallery</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {photos.map((photo) => (
              <button
                key={photo.id}
                onClick={() => setLightbox(photo.url)}
                className="aspect-square bg-gray-100 rounded-xl overflow-hidden hover:opacity-90 transition-opacity"
              >
                <img src={photo.url} alt={photo.caption ?? ''} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Reviews */}
      {approvedReviews.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-900">Reviews</h2>
            {avgRating !== null && (
              <div className="flex items-center gap-2">
                <StarRow rating={Math.round(avgRating)} size="md" />
                <span className="text-sm font-semibold text-gray-700">{avgRating.toFixed(1)}</span>
                <span className="text-sm text-gray-400">
                  ({approvedReviews.length} review{approvedReviews.length !== 1 ? 's' : ''})
                </span>
              </div>
            )}
          </div>

          {/* Per-staff average ratings */}
          {staffRatings.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-6">
              {staffRatings.map((s) => (
                <div key={s.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-1.5">
                  <span className="text-sm font-medium text-gray-800">{s.name}</span>
                  <StarRow rating={Math.round(s.avg)} />
                  <span className="text-xs text-gray-400">{s.avg.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {approvedReviews.map((review) => (
              <div key={review.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{review.reviewer_name}</p>
                    {review.staff && (
                      <p className="text-xs text-gray-400 mt-0.5">Review for {review.staff.name}</p>
                    )}
                  </div>
                  <StarRow rating={review.rating} />
                </div>
                {review.comment && (
                  <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Hours + Location */}
      {(openingHours.length > 0 || config.address || config.mapEmbedUrl) && (
        <div className="grid gap-10 sm:grid-cols-2">
          {openingHours.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-gray-400" />
                <h2 className="text-xl font-bold text-gray-900">Opening Hours</h2>
              </div>
              <div className="space-y-1">
                {openingHours.map((entry) => {
                  const isToday = entry.day === todayName
                  return (
                    <div
                      key={entry.day}
                      className={`flex justify-between text-sm px-3 py-2 rounded-lg font-medium ${
                        isToday
                          ? 'text-white'
                          : 'text-gray-700'
                      }`}
                      style={isToday ? { backgroundColor: 'var(--color-primary)' } : undefined}
                    >
                      <span>{entry.day}</span>
                      <span className={isToday ? 'font-semibold' : entry.closed ? 'text-gray-400' : ''}>
                        {entry.closed ? 'Closed' : `${entry.open} – ${entry.close}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {(config.address || config.mapEmbedUrl) && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-gray-400" />
                <h2 className="text-xl font-bold text-gray-900">Find Us</h2>
              </div>
              {config.address && (
                <p className="text-sm text-gray-600 whitespace-pre-line mb-4">{config.address}</p>
              )}
              {config.mapEmbedUrl && (
                <iframe
                  src={config.mapEmbedUrl}
                  width="100%"
                  height="260"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="rounded-xl"
                  title="Location map"
                />
              )}
            </section>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-h-[90vh] max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
