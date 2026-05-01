import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Service, Staff } from '@/types'

export interface PreviousBooking {
  serviceId: string
  staffId: string | null
  serviceName: string
  staffName: string | null
  service: Service
}

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export function usePreviousBookings() {
  const { user } = useAuthStore()
  const [previous, setPrevious] = useState<PreviousBooking[]>([])

  useEffect(() => {
    if (!user) { setPrevious([]); return }

    async function load() {
      // find customer record for this user
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user!.id)
        .eq('business_id', BUSINESS_ID)
        .maybeSingle()

      if (!customer) return

      // fetch past/completed bookings, most recent first
      const { data } = await supabase
        .from('bookings')
        .select('service_id, staff_id, service:services(*), staff:staff(id,name)')
        .eq('customer_id', customer.id)
        .eq('business_id', BUSINESS_ID)
        .neq('status', 'cancelled')
        .order('starts_at', { ascending: false })
        .limit(20)

      if (!data) return

      // deduplicate by service+staff combo, keep order (most recent first)
      const seen = new Set<string>()
      const deduped: PreviousBooking[] = []
      for (const b of data) {
        const key = `${b.service_id}:${b.staff_id ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        if (!b.service) continue
        deduped.push({
          serviceId: b.service_id,
          staffId: b.staff_id ?? null,
          serviceName: (b.service as unknown as Service).name,
          staffName: b.staff ? (b.staff as unknown as Pick<Staff, 'name'>).name : null,
          service: b.service as unknown as Service,
        })
      }
      setPrevious(deduped.slice(0, 5))
    }

    load()
  }, [user])

  return previous
}
