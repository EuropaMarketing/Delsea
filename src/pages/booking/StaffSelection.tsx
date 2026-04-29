import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Staff } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function StaffSelection() {
  const navigate = useNavigate()
  const { draft, setStaff, setStaffList, staff } = useBookingStore()

  const [loading, setLoading] = useState(!staff.length)
  const [selected, setSelected] = useState<string | null>(draft.staffId)

  useEffect(() => {
    if (staff.length) { setLoading(false); return }
    async function load() {
      const { data } = await supabase
        .from('staff')
        .select('*')
        .eq('business_id', BUSINESS_ID)
        .order('name')
      if (data) setStaffList(data as Staff[])
      setLoading(false)
    }
    load()
  }, [setStaffList, staff.length])

  if (!draft.serviceId) {
    navigate('/')
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
              {member.bio && (
                <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{member.bio}</p>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back
        </Button>
        <Button size="lg" onClick={handleNext}>
          Continue
        </Button>
      </div>
    </div>
  )
}
