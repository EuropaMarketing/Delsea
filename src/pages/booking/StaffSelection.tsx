import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Staff } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type StaffRating = { avg: number; count: number }

export default function StaffSelection() {
  const navigate = useNavigate()
  const { draft, setStaff, setStaffList, staff, services } = useBookingStore()

  const selectedService = services.find((s) => s.id === draft.serviceId)

  const [loading, setLoading] = useState(!staff.length)
  const [selected, setSelected] = useState<string | null>(draft.staffId)
  const [ratings, setRatings] = useState<Record<string, StaffRating>>({})

  function computeRatings(rows: { staff_id: string | null; rating: number }[]) {
    const map: Record<string, { total: number; count: number }> = {}
    for (const r of rows) {
      if (!r.staff_id) continue
      if (!map[r.staff_id]) map[r.staff_id] = { total: 0, count: 0 }
      map[r.staff_id].total += r.rating
      map[r.staff_id].count++
    }
    const result: Record<string, StaffRating> = {}
    for (const [id, { total, count }] of Object.entries(map)) {
      result[id] = { avg: Math.round((total / count) * 10) / 10, count }
    }
    setRatings(result)
  }

  useEffect(() => {
    async function load() {
      const reviewsPromise = supabase
        .from('staff_reviews')
        .select('staff_id, rating')
        .eq('business_id', BUSINESS_ID)
        .eq('is_approved', true)
        .not('staff_id', 'is', null)

      if (staff.length) {
        const { data } = await reviewsPromise
        if (data) computeRatings(data)
        setLoading(false)
        return
      }

      const [staffRes, reviewsRes] = await Promise.all([
        supabase.from('staff').select('*').eq('business_id', BUSINESS_ID).order('name'),
        reviewsPromise,
      ])
      // Filter out on_holiday staff client-side — handles both false and null correctly
      if (staffRes.data) setStaffList((staffRes.data as Staff[]).filter((s) => !s.on_holiday))
      if (reviewsRes.data) computeRatings(reviewsRes.data)
      setLoading(false)
    }
    load()
  }, [setStaffList, staff.length])

  if (!draft.serviceId) {
    navigate('/book')
    return null
  }

  if (selectedService?.is_self_service) {
    navigate('/datetime', { replace: true })
    return null
  }

  function handleSelect(staffId: string | null) {
    setSelected(staffId)
    setStaff(staffId)
  }

  function handleNext() {
    navigate('/datetime')
  }

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Choose a Team Member</h1>
        <p className="text-sm text-gray-500 mt-1">
          Select a specific person or let us find the next available slot.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* No preference card */}
        <Card
          hover
          selected={selected === null}
          onClick={() => handleSelect(null)}
          className="flex items-center gap-4"
        >
          <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Users className="h-6 w-6 text-gray-400" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">No Preference</p>
            <p className="text-xs text-gray-500 mt-0.5">
              First available team member
            </p>
          </div>
        </Card>

        {staff.map((member) => (
          <Card
            key={member.id}
            hover
            selected={selected === member.id}
            onClick={() => handleSelect(member.id)}
            className="flex items-center gap-4"
          >
            <Avatar src={member.avatar_url} name={member.name} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{member.name}</p>
              <Badge variant="default" className="mt-1 capitalize">{member.role}</Badge>
              {ratings[member.id] && (
                <div className="flex items-center gap-1 mt-1.5">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-semibold text-gray-800">{ratings[member.id].avg}</span>
                  <span className="text-xs text-gray-400">({ratings[member.id].count})</span>
                </div>
              )}
              {member.bio && (
                <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{member.bio}</p>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="secondary" onClick={() => navigate('/book')}>
          Back
        </Button>
        <Button size="lg" onClick={handleNext}>
          Continue
        </Button>
      </div>
    </div>
  )
}
