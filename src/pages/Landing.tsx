import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Lock, Info } from 'lucide-react'
import { useBrandStore } from '@/store/brandStore'
import { Button } from '@/components/ui/Button'

export default function Landing() {
  const { config } = useBrandStore()
  const [logoFailed, setLogoFailed] = useState(false)

  const showLogo = config.logo && config.logo !== '/logo.svg' && !logoFailed

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>
            {config.brandName}
          </span>
          <div className="flex items-center gap-4">
            <Link to="/about" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
              <Info className="h-3.5 w-3.5" />
              About
            </Link>
            <Link to="/admin/login" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              <Lock className="h-3.5 w-3.5" />
              Staff login
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center py-20">
        {showLogo ? (
          <img
            src={config.logo}
            alt={config.brandName}
            onError={() => setLogoFailed(true)}
            className="h-44 w-auto max-w-55 object-contain mb-10"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-sm"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <CalendarCheck className="h-8 w-8 text-white" />
          </div>
        )}

        <h1 className="text-4xl font-bold text-gray-900 mb-3">{config.brandName}</h1>
        <p className="text-gray-500 text-lg mb-10 max-w-sm">
          Book your appointment online in under a minute.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/book">
            <Button size="lg" className="min-w-48">
              Book an Appointment
            </Button>
          </Link>
          <Link to="/my-bookings">
            <Button variant="secondary" size="lg" className="min-w-48">
              My Bookings
            </Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-gray-400 border-t border-gray-100">
        <p>© {new Date().getFullYear()} {config.brandName} · {config.businessEmail}</p>
      </footer>
    </div>
  )
}
