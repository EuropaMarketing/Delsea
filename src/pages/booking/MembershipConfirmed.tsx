import { useLocation, Link } from 'react-router-dom'
import { CheckCircle2, Ticket, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function MembershipConfirmed() {
  const { state } = useLocation()
  const { planName, tokenCount, email } = (state ?? {}) as {
    planName?: string
    tokenCount?: number
    email?: string
  }

  return (
    <div className="flex flex-col items-center text-center py-8 max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-5">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h1>
      <p className="text-sm text-gray-500 mb-6">
        Your membership has been activated{email ? ` for ${email}` : ''}.
      </p>

      {planName && (
        <div className="w-full bg-gray-50 border border-gray-100 rounded-xl p-4 mb-6 text-left">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Membership Details</p>
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900">{planName}</p>
            <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
              <Ticket className="h-4 w-4" />
              {tokenCount} {tokenCount === 1 ? 'session' : 'sessions'}
            </span>
          </div>
        </div>
      )}

      <p className="text-sm text-gray-500 mb-6">
        Use your sessions when booking — enter this email address on the details step and your membership will be applied automatically.
      </p>

      <div className="flex flex-col gap-3 w-full">
        <Link to="/book">
          <Button fullWidth size="lg">
            <CalendarDays className="h-4 w-4" />
            Book a Session
          </Button>
        </Link>
        <Link to="/memberships">
          <Button fullWidth variant="secondary">
            View Plans
          </Button>
        </Link>
      </div>
    </div>
  )
}
