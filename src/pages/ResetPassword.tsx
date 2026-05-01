import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PasswordInput } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleReset() {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError('This reset link has expired. Please request a new one from the sign-in page.')
    } else {
      setDone(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {done ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Password updated</h1>
              <p className="text-sm text-gray-500 mb-6">You're now signed in. Head to My Bookings to see your appointments.</p>
              <Button fullWidth onClick={() => navigate('/my-bookings')}>View My Bookings</Button>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, white)' }}>
                <KeyRound className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">Set a new password</h1>
              <p className="text-sm text-gray-500 mb-6">Choose a password you'll remember.</p>

              <div className="space-y-3">
                <PasswordInput
                  label="New password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                />
                <PasswordInput
                  label="Confirm password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleReset()}
                />
              </div>

              {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

              <Button fullWidth loading={loading} onClick={handleReset} className="mt-5">
                Update Password
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
