import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useBrandStore } from '@/store/brandStore'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function AdminLogin() {
  const navigate = useNavigate()
  const { setSession, setAdmin } = useAuthStore()
  const { config } = useBrandStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        setError(authError.message)
      } else if (data.session) {
        // Check admin status before navigating so ProtectedRoute doesn't bounce back
        const { data: staffData } = await supabase
          .from('staff')
          .select('id')
          .eq('user_id', data.session.user.id)
          .eq('role', 'admin')
          .single()
        if (!staffData) {
          await supabase.auth.signOut()
          setError('This account does not have admin access.')
        } else {
          setSession(data.session)
          setAdmin(true)
          navigate('/admin')
        }
      } else {
        setError('Sign in failed — no session returned.')
      }
    } catch (err) {
      setError('Unexpected error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{config.brandName}</h1>
          <p className="text-sm text-gray-500 mt-1">Admin sign in</p>
        </div>
        <div className="bg-white border border-gray-200 brand-card p-6 shadow-sm">
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            <Button type="submit" fullWidth size="lg" loading={loading}>
              Sign In
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
