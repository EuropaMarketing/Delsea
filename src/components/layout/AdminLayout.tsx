import React, { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, List, Scissors, Users, Settings,
  LogOut, Menu, X, Ticket, UserRound, Banknote, Images, Star, Tag, DoorOpen, Gift, PartyPopper, ClipboardList,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useBrandStore } from '@/store/brandStore'
import { cn } from '@/lib/cn'
import { CheckInToasts, type CheckInAlert } from '@/components/ui/CheckInToast'

const navItems = [
  { label: 'Dashboard',  icon: LayoutDashboard, path: '/admin' },
  { label: 'Calendar',   icon: Calendar,         path: '/admin/calendar' },
  { label: 'Bookings',   icon: List,             path: '/admin/bookings' },
  { label: 'Services',   icon: Scissors,         path: '/admin/services' },
  { label: 'Forms',      icon: ClipboardList,    path: '/admin/forms' },
  { label: 'Events',     icon: PartyPopper,      path: '/admin/events' },
  { label: 'Staff',        icon: Users,      path: '/admin/staff' },
  { label: 'Clients',      icon: UserRound,  path: '/admin/clients' },
  { label: 'Memberships',  icon: Ticket,     path: '/admin/memberships' },
  { label: 'Discounts',    icon: Tag,        path: '/admin/discounts' },
  { label: 'Gift Vouchers', icon: Gift,      path: '/admin/gift-vouchers' },
  { label: 'Resources',    icon: DoorOpen,   path: '/admin/resources' },
  { label: 'Payroll',      icon: Banknote,   path: '/admin/payroll' },
  { label: 'Portfolio',    icon: Images,     path: '/admin/portfolio' },
  { label: 'Reviews',      icon: Star,       path: '/admin/reviews' },
  { label: 'Settings',     icon: Settings,   path: '/admin/settings' },
]

function NavLink({ item, onClick }: { item: typeof navItems[0]; onClick?: () => void }) {
  const { pathname } = useLocation()
  const active = pathname === item.path
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-(--color-primary) text-white'
          : 'text-gray-600 hover:bg-gray-100',
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  )
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { setSession } = useAuthStore()
  const { config } = useBrandStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [checkInAlerts, setCheckInAlerts] = useState<CheckInAlert[]>([])

  const dismissAlert = useCallback((id: string) => {
    setCheckInAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('admin-check-ins')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings' },
        async (payload) => {
          const oldRow = payload.old as Record<string, unknown>
          const newRow = payload.new as Record<string, unknown>
          // Only fire when checked_in_at transitions from null → set.
          if (!newRow.checked_in_at || oldRow.checked_in_at) return

          const { data } = await supabase
            .from('bookings')
            .select('id, starts_at, customer:customers(name), service:services(name), staff:staff(name), resource:resources!resource_id(name)')
            .eq('id', newRow.id as string)
            .single()

          if (!data) return

          const b = data as unknown as {
            id: string
            starts_at: string
            customer: { name: string } | null
            service: { name: string } | null
            staff: { name: string } | null
            resource: { name: string } | null
          }

          setCheckInAlerts((prev) => [
            ...prev,
            {
              id: b.id,
              customerName: b.customer?.name ?? 'Customer',
              serviceName: b.service?.name ?? 'appointment',
              staffName: b.staff?.name ?? null,
              startsAt: b.starts_at,
              roomName: b.resource?.name ?? null,
            },
          ])
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
    navigate('/admin/login')
  }

  const Sidebar = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-gray-100">
        <span className="font-bold text-base" style={{ color: 'var(--color-primary)' }}>
          {config.brandName}
        </span>
        <p className="text-xs text-gray-400 mt-0.5">Admin Panel</p>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.path} item={item} onClick={onClose} />
        ))}
      </nav>
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--color-background)' }}>
      <CheckInToasts alerts={checkInAlerts} onDismiss={dismissAlert} />
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-gray-100 shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-56 h-full bg-white border-r border-gray-100 flex flex-col">
            <div className="absolute top-3 right-3">
              <button onClick={() => setMobileOpen(false)} className="p-1 rounded text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-100">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded text-gray-500 hover:bg-gray-100">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-sm" style={{ color: 'var(--color-primary)' }}>
            {config.brandName} Admin
          </span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
