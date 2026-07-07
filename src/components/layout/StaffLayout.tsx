import { useEffect, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useBrandStore } from '@/store/brandStore'
import { CheckInToasts, type CheckInAlert } from '@/components/ui/CheckInToast'

export function StaffLayout({ children, staffName }: { children: React.ReactNode; staffName: string }) {
  const navigate = useNavigate()
  const { setSession, staffId } = useAuthStore()
  const { config } = useBrandStore()
  const [checkInAlerts, setCheckInAlerts] = useState<CheckInAlert[]>([])

  const dismissAlert = useCallback((id: string) => {
    setCheckInAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  useEffect(() => {
    if (!staffId) return
    const channel = supabase
      .channel('staff-check-ins')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `staff_id=eq.${staffId}` },
        async (payload) => {
          const oldRow = payload.old as Record<string, unknown>
          const newRow = payload.new as Record<string, unknown>
          if (!newRow.checked_in_at || oldRow.checked_in_at) return

          const { data } = await supabase
            .from('bookings')
            .select('id, starts_at, customer:customers(name), service:services(name), resource:resources!resource_id(name)')
            .eq('id', newRow.id as string)
            .single()

          if (!data) return
          const b = data as unknown as {
            id: string; starts_at: string
            customer: { name: string } | null; service: { name: string } | null; resource: { name: string } | null
          }
          setCheckInAlerts((prev) => [...prev, {
            id: b.id,
            customerName: b.customer?.name ?? 'Customer',
            serviceName: b.service?.name ?? 'appointment',
            staffName,
            startsAt: b.starts_at,
            roomName: b.resource?.name ?? null,
          }])
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [staffId, staffName])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <CheckInToasts alerts={checkInAlerts} onDismiss={dismissAlert} />
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div>
            <span className="font-semibold text-sm" style={{ color: 'var(--color-primary)' }}>
              {config.brandName}
            </span>
            <span className="text-xs text-gray-400 ml-2">· {staffName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
