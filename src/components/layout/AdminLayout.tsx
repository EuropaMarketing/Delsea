import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, List, Scissors, Users, Settings,
  LogOut, Menu, X, Ticket, UserRound, Banknote,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useBrandStore } from '@/store/brandStore'
import { cn } from '@/lib/cn'

const navItems = [
  { label: 'Dashboard',  icon: LayoutDashboard, path: '/admin' },
  { label: 'Calendar',   icon: Calendar,         path: '/admin/calendar' },
  { label: 'Bookings',   icon: List,             path: '/admin/bookings' },
  { label: 'Services',   icon: Scissors,         path: '/admin/services' },
  { label: 'Staff',        icon: Users,      path: '/admin/staff' },
  { label: 'Clients',      icon: UserRound,  path: '/admin/clients' },
  { label: 'Memberships',  icon: Ticket,     path: '/admin/memberships' },
  { label: 'Payroll',      icon: Banknote,   path: '/admin/payroll' },
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
    <div className="flex h-screen bg-gray-50 overflow-hidden">
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
