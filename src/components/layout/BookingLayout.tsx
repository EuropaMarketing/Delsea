import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import brand from '@/config/brand'
import { cn } from '@/lib/cn'

const steps = [
  { label: 'Service', path: '/' },
  { label: 'Staff', path: '/staff' },
  { label: 'Date & Time', path: '/datetime' },
  { label: 'Details', path: '/details' },
  { label: 'Confirm', path: '/confirm' },
]

export function BookingLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const currentIdx = steps.findIndex((s) => s.path === pathname)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={brand.logo} alt={brand.brandName} className="h-8 w-auto" onError={(e) => {
              const t = e.target as HTMLImageElement
              t.style.display = 'none'
            }} />
            <span className="font-semibold text-base" style={{ color: 'var(--color-primary)' }}>
              {brand.brandName}
            </span>
          </Link>
          <Link to="/my-bookings" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            My Bookings
          </Link>
        </div>
      </header>

      {/* Progress stepper */}
      {currentIdx >= 0 && (
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-4 py-3 overflow-x-auto">
            <ol className="flex items-center gap-1 min-w-max">
              {steps.map((step, i) => {
                const done = i < currentIdx
                const active = i === currentIdx
                return (
                  <React.Fragment key={step.path}>
                    <li className="flex items-center gap-1">
                      <span
                        className={cn(
                          'flex items-center gap-1.5 text-xs font-medium',
                          done ? 'text-[var(--color-primary)]' : active ? 'text-gray-900' : 'text-gray-400',
                        )}
                      >
                        {done ? (
                          <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" />
                        ) : (
                          <span
                            className={cn(
                              'h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                              active
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'bg-gray-100 text-gray-400',
                            )}
                          >
                            {i + 1}
                          </span>
                        )}
                        {step.label}
                      </span>
                    </li>
                    {i < steps.length - 1 && (
                      <ChevronRight className="h-3 w-3 text-gray-300 flex-shrink-0" />
                    )}
                  </React.Fragment>
                )
              })}
            </ol>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-gray-400 border-t border-gray-100 mt-auto">
        <p>© {new Date().getFullYear()} {brand.brandName} · {brand.businessEmail}</p>
        {brand.socialLinks && (
          <div className="flex justify-center gap-4 mt-2">
            {brand.socialLinks.instagram && (
              <a href={brand.socialLinks.instagram} target="_blank" rel="noreferrer" className="hover:text-gray-600">
                Instagram
              </a>
            )}
            {brand.socialLinks.facebook && (
              <a href={brand.socialLinks.facebook} target="_blank" rel="noreferrer" className="hover:text-gray-600">
                Facebook
              </a>
            )}
            {brand.socialLinks.tiktok && (
              <a href={brand.socialLinks.tiktok} target="_blank" rel="noreferrer" className="hover:text-gray-600">
                TikTok
              </a>
            )}
          </div>
        )}
      </footer>
    </div>
  )
}
