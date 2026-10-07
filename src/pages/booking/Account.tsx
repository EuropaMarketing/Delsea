import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, KeyRound, Trash2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Input, PasswordInput } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type MyCustomer = {
  id: string
  name: string
  email: string
  phone: string | null
  date_of_birth: string | null
}

export default function Account() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [customer, setCustomer] = useState<MyCustomer | null>(null)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [detailsSaved, setDetailsSaved] = useState(false)
  const [detailsError, setDetailsError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    if (!user) { navigate('/my-bookings', { replace: true }); return }
    async function load() {
      const { data } = await supabase
        .from('customers')
        .select('id, name, email, phone, date_of_birth')
        .eq('user_id', user!.id)
        .eq('business_id', BUSINESS_ID)
        .maybeSingle()
      if (data) {
        setCustomer(data as MyCustomer)
        setName(data.name)
        setPhone(data.phone ?? '')
        setDob(data.date_of_birth ?? '')
      }
      setLoading(false)
    }
    load()
  }, [user])

  async function handleSaveDetails() {
    if (!customer || !name.trim()) { setDetailsError('Name is required.'); return }
    setDetailsSaving(true)
    setDetailsError('')
    setDetailsSaved(false)
    const { error } = await supabase
      .from('customers')
      .update({ name: name.trim(), phone: phone.trim() || null, date_of_birth: dob || null })
      .eq('id', customer.id)
    if (error) {
      setDetailsError(error.message)
    } else {
      setCustomer({ ...customer, name: name.trim(), phone: phone.trim() || null, date_of_birth: dob || null })
      setDetailsSaved(true)
    }
    setDetailsSaving(false)
  }

  async function handleChangePassword() {
    if (!currentPassword) { setPasswordError('Enter your current password.'); return }
    if (newPassword.length < 8) { setPasswordError('New password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('New passwords do not match.'); return }
    setPasswordSaving(true)
    setPasswordError('')
    setPasswordSaved(false)
    // Re-authenticate with the current password first — updateUser alone doesn't
    // verify it, so without this anyone with an active session could change it blind.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: customer?.email ?? user?.email ?? '',
      password: currentPassword,
    })
    if (signInErr) {
      setPasswordError('Current password is incorrect.')
      setPasswordSaving(false)
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPasswordError(error.message)
    } else {
      setPasswordSaved(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
    setPasswordSaving(false)
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    setDeleteError('')
    const { data, error } = await supabase.functions.invoke('delete-customer-account')
    if (error || !data?.success) {
      setDeleteError((data as { error?: string } | null)?.error ?? error?.message ?? 'Failed to delete account')
      setDeleting(false)
      return
    }
    await supabase.auth.signOut()
    navigate('/')
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-gray-600 rounded-full" /></div>
  }

  if (!customer) {
    return <p className="text-center text-gray-500 py-16">We couldn't find your profile.</p>
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your details and account settings.</p>
      </div>

      {/* Details */}
      <Card padding="md">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-4">
          <User className="h-4 w-4" /> Your Details
        </h2>
        <div className="space-y-3">
          <Input label="Full name" value={name} onChange={(e) => { setName(e.target.value); setDetailsSaved(false) }} />
          <Input label="Email" value={customer.email} disabled />
          <Input label="Phone" type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setDetailsSaved(false) }} placeholder="+44 7700 900000" />
          <Input label="Date of birth" type="date" value={dob} onChange={(e) => { setDob(e.target.value); setDetailsSaved(false) }} />
          {detailsError && <p className="text-xs text-red-600">{detailsError}</p>}
          <div className="flex items-center gap-3">
            <Button size="sm" loading={detailsSaving} onClick={handleSaveDetails}>Save Changes</Button>
            {detailsSaved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>}
          </div>
        </div>
      </Card>

      {/* Password */}
      <Card padding="md">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-4">
          <KeyRound className="h-4 w-4" /> Change Password
        </h2>
        <div className="space-y-3">
          <PasswordInput label="Current password" value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError('') }} />
          <PasswordInput label="New password" placeholder="At least 8 characters" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setPasswordError('') }} />
          <PasswordInput label="Confirm new password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError('') }} />
          {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
          <div className="flex items-center gap-3">
            <Button size="sm" loading={passwordSaving} onClick={handleChangePassword}>Update Password</Button>
            {passwordSaved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Password updated</span>}
          </div>
        </div>
      </Card>

      {/* Delete account */}
      <Card padding="md" className="border-red-200">
        <h2 className="text-sm font-semibold text-red-700 flex items-center gap-1.5 mb-2">
          <Trash2 className="h-4 w-4" /> Delete Account
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          This removes your ability to sign in. Your appointment history is kept by the business for their records.
        </p>
        <Button variant="danger" size="sm" onClick={() => { setDeleteOpen(true); setDeleteConfirmText(''); setDeleteError('') }}>
          Delete My Account
        </Button>
      </Card>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This can't be undone. Type <span className="font-mono font-semibold">DELETE</span> to confirm.
          </p>
          <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" />
          {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" size="sm" loading={deleting} disabled={deleteConfirmText !== 'DELETE'} onClick={handleDeleteAccount}>
              Delete Account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
