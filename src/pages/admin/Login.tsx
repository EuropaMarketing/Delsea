import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import brand from '@/config/brand'

export default function AdminLogin() {
  const navigate = useNavigate()
  const { setSession } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      console.log('attempting login, supabase URL:', import.meta.env.VITE_SUPABASE_URL)
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      console.log('login result:', { data, error: authError })
      if (authError) {
        setError(authError.message)
      } else if (data.session) {
        setSession(data.session)
        navigate('/admin')
      } else {
        setError('Sign in failed — no session returned. Check console for details.')
      }
    } catch (err) {
      console.error('login exception:', err)
      setError('Unexpected error — check the browser console.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{brand.brandName}</h1>
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
