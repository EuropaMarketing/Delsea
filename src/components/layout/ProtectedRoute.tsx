import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
}

export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { session, isAdmin, initialized } = useAuthStore()

  if (!initialized) return null

  if (!session) return <Navigate to="/admin/login" replace />

  if (adminOnly && !isAdmin) return <Navigate to="/admin/login" replace />

  return <>{children}</>
}
