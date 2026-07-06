import { useEffect, useState } from 'react'
import { X, UserCheck } from 'lucide-react'
import { format, parseISO } from 'date-fns'

export type CheckInAlert = {
  id: string
  customerName: string
  serviceName: string
  staffName: string | null
  startsAt: string
  roomName: string | null
}

interface CheckInToastProps {
  alerts: CheckInAlert[]
  onDismiss: (id: string) => void
}

export function CheckInToasts({ alerts, onDismiss }: CheckInToastProps) {
  if (alerts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {alerts.map((a) => (
        <CheckInToast key={a.id} alert={a} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function CheckInToast({ alert, onDismiss }: { alert: CheckInAlert; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Slide in
    const show = setTimeout(() => setVisible(true), 10)
    // Auto-dismiss after 30 seconds
    const hide = setTimeout(() => onDismiss(alert.id), 30000)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [alert.id, onDismiss])

  return (
    <div
      className={`bg-white border-2 rounded-xl shadow-2xl p-4 transition-all duration-300 ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
      }`}
      style={{ borderColor: 'var(--color-primary)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, white)' }}
        >
          <UserCheck className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">{alert.customerName} has arrived</p>
          <p className="text-xs text-gray-600 mt-0.5">
            {alert.serviceName} · {format(parseISO(alert.startsAt), 'HH:mm')}
            {alert.staffName && ` · ${alert.staffName}`}
          </p>
          {alert.roomName && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-primary)' }}>
              {alert.roomName}
            </p>
          )}
        </div>
        <button
          onClick={() => onDismiss(alert.id)}
          className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
