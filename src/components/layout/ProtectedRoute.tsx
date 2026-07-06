import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
  staffOnly?: boolean
}

export function ProtectedRoute({ children, adminOnly = false, staffOnly = false }: ProtectedRouteProps) {
  const { session, isAdmin, isStaff, initialized } = useAuthStore()

  if (!initialized) return null

  if (!session) return <Navigate to="/admin/login" replace />

  if (adminOnly && !isAdmin) return <Navigate to="/admin/login" replace />

  if (staffOnly && !isStaff) return <Navigate to="/admin/login" replace />

  return <>{children}</>
}
