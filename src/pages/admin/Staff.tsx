import { useEffect, useRef, useState } from 'react'
import { format, parseISO, startOfDay, endOfDay, isBefore } from 'date-fns'
import { Plus, Pencil, Trash2, PlaneTakeoff, Camera, CalendarX2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Staff, Availability, BlockedTime, CommissionType } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface StaffForm {
  name: string
  role: string
  bio: string
  commission_type: CommissionType
  commission_rate: string
}

const emptyForm: StaffForm = { name: '', role: 'staff', bio: '', commission_type: 'percentage', commission_rate: '50' }

interface DaySchedule {
  enabled: boolean
  start_time: string
  end_time: string
}

const defaultSchedule = (): Record<number, DaySchedule> =>
  Object.fromEntries(
    DAYS.map((_, i) => [
      i,
      { enabled: i >= 1 && i <= 5, start_time: '09:00', end_time: '18:00' },
    ]),
  )

export default function AdminStaff() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Staff | null>(null)
  const [form, setForm] = useState<StaffForm>(emptyForm)
  const [schedule, setSchedule] = useState<Record<number, DaySchedule>>(defaultSchedule())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState('')
  const [saveError, setSaveError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Leave / blocked-time modal
  const [leaveMember, setLeaveMember] = useState<Staff | null>(null)
  const [leaveBlocks, setLeaveBlocks] = useState<BlockedTime[]>([])
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [leaveAdding, setLeaveAdding] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ startDate: '', endDate: '', reason: '' })
  const [leaveError, setLeaveError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('staff')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .order('name')
    if (data) setStaff(data as Staff[])
    setLoading(false)
  }

  async function openEdit(member: Staff) {
    setEditTarget(member)
    setForm({
      name: member.name,
      role: member.role,
      bio: member.bio ?? '',
      commission_type: member.commission_type ?? 'percentage',
      commission_rate: String(member.commission_rate ?? 50),
    })
    setCurrentAvatarUrl(member.avatar_url ?? null)
    setAvatarFile(null)
    setAvatarPreview(null)
    setAvatarError('')
    setSaveError('')
    setErrors({})

    const { data: avail } = await supabase
      .from('availability')
      .select('*')
      .eq('staff_id', member.id)
    const sched = defaultSchedule()
    if (avail) {
      avail.forEach((a: Availability) => {
        sched[a.day_of_week] = { enabled: true, start_time: a.start_time, end_time: a.end_time }
      })
    }
    setSchedule(sched)
    setModalOpen(true)
  }

  function openCreate() {
    setEditTarget(null)
    setForm(emptyForm)
    setCurrentAvatarUrl(null)
    setAvatarFile(null)
    setAvatarPreview(null)
    setAvatarError('')
    setSaveError('')
    setSchedule(defaultSchedule())
    setErrors({})
    setModalOpen(true)
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name required'
    return e
  }

  async function uploadAvatar(staffId: string): Promise<string | null> {
    if (!avatarFile) return currentAvatarUrl
    setAvatarError('')
    const ext = avatarFile.name.split('.').pop()
    const path = `avatars/${BUSINESS_ID}/${staffId}.${ext}`
    const { error } = await supabase.storage.from('assets').upload(path, avatarFile, { upsert: true })
    if (error) {
      setAvatarError(`Photo upload failed: ${error.message}`)
      return currentAvatarUrl
    }
    const { data } = supabase.storage.from('assets').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    setSaveError('')

    let staffId: string

    if (editTarget) {
      staffId = editTarget.id
      const avatarUrl = await uploadAvatar(staffId)
      const { data, error } = await supabase
        .from('staff')
        .update({
          name: form.name, role: form.role, bio: form.bio || null, avatar_url: avatarUrl,
          commission_type: form.commission_type,
          commission_rate: parseFloat(form.commission_rate) || 50,
        })
        .eq('id', staffId)
        .select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (data) setStaff((prev) => prev.map((s) => (s.id === staffId ? data as Staff : s)))
    } else {
      staffId = crypto.randomUUID()
      const avatarUrl = await uploadAvatar(staffId)
      const { data, error } = await supabase
        .from('staff')
        .insert({
          id: staffId, name: form.name, role: form.role, bio: form.bio || null,
          avatar_url: avatarUrl, business_id: BUSINESS_ID,
          commission_type: form.commission_type,
          commission_rate: parseFloat(form.commission_rate) || 50,
        })
        .select().single()
      if (error) { setSaveError(error.message); setSaving(false); return }
      if (!data) { setSaving(false); return }
      setStaff((prev) => [...prev, data as Staff])
    }

    await supabase.from('availability').delete().eq('staff_id', staffId)
    const toInsert = Object.entries(schedule)
      .filter(([, v]) => v.enabled)
      .map(([day, v]) => ({
        staff_id: staffId,
        day_of_week: parseInt(day),
        start_time: v.start_time,
        end_time: v.end_time,
      }))
    if (toInsert.length) await supabase.from('availability').insert(toInsert)

    setSaving(false)
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this team member?')) return
    await supabase.from('staff').delete().eq('id', id)
    setStaff((prev) => prev.filter((s) => s.id !== id))
  }

  async function handleToggleHoliday(member: Staff) {
    const on_holiday = !member.on_holiday
    await supabase.from('staff').update({ on_holiday }).eq('id', member.id)
    setStaff((prev) => prev.map((s) => (s.id === member.id ? { ...s, on_holiday } : s)))
  }

  async function openLeaveModal(member: Staff) {
    setLeaveMember(member)
    setLeaveLoading(true)
    setLeaveForm({ startDate: '', endDate: '', reason: '' })
    setLeaveError('')
    const { data } = await supabase
      .from('blocked_times')
      .select('*')
      .eq('staff_id', member.id)
      .order('starts_at')
    setLeaveBlocks((data ?? []) as BlockedTime[])
    setLeaveLoading(false)
  }

  async function handleAddLeave() {
    if (!leaveMember) return
    if (!leaveForm.startDate || !leaveForm.endDate) { setLeaveError('Select a start and end date'); return }
    if (leaveForm.endDate < leaveForm.startDate) { setLeaveError('End date must be after start date'); return }
    setLeaveAdding(true)
    setLeaveError('')
    const starts_at = startOfDay(new Date(leaveForm.startDate)).toISOString()
    const ends_at = endOfDay(new Date(leaveForm.endDate)).toISOString()
    const { data, error } = await supabase
      .from('blocked_times')
      .insert({ staff_id: leaveMember.id, starts_at, ends_at, reason: leaveForm.reason || null })
      .select().single()
    if (error) { setLeaveError('Failed to save — please try again.'); setLeaveAdding(false); return }
    setLeaveBlocks((prev) => [...prev, data as BlockedTime].sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
    setLeaveForm({ startDate: '', endDate: '', reason: '' })
    setLeaveAdding(false)
  }

  async function handleDeleteLeave(id: string) {
    await supabase.from('blocked_times').delete().eq('id', id)
    setLeaveBlocks((prev) => prev.filter((b) => b.id !== id))
  }

  if (loading) return <FullPageSpinner />

  const displayAvatar = avatarPreview ?? currentAvatarUrl

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Team</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Member
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((member) => (
          <Card
            key={member.id}
            padding="md"
            className={`flex flex-col gap-3 transition-opacity ${member.on_holiday ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <Avatar src={member.avatar_url} name={member.name} size="lg" />
                {member.on_holiday && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-amber-400 flex items-center justify-center">
                    <PlaneTakeoff className="h-3 w-3 text-white" />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{member.name}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Badge variant="default" className="capitalize">{member.role}</Badge>
                  {member.on_holiday && <Badge variant="warning">On Holiday</Badge>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleToggleHoliday(member)}
                  title={member.on_holiday ? 'End holiday' : 'Set on holiday'}
                  className={`p-1.5 rounded-lg transition-colors ${
                    member.on_holiday
                      ? 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                      : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <PlaneTakeoff className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openLeaveModal(member)}
                  title="Manage leave & blocked dates"
                  className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                >
                  <CalendarX2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openEdit(member)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(member.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {member.bio && <p className="text-xs text-gray-500 line-clamp-2">{member.bio}</p>}
          </Card>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Team Member' : 'New Team Member'}
        size="lg"
      >
        <div className="space-y-4">
          {/* Avatar upload */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <Avatar
                src={displayAvatar}
                name={form.name || 'New'}
                size="xl"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                title="Upload photo"
              >
                <Camera className="h-3.5 w-3.5 text-gray-600" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              {displayAvatar ? 'Change photo' : 'Upload photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            {avatarError && (
              <p className="text-xs text-red-500 text-center max-w-xs">{avatarError}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              error={errors.name}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="h-10 px-3 text-sm border border-gray-200 bg-white rounded-(--border-radius-sm) outline-none focus:ring-2 focus:ring-(--color-primary)"
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <Textarea
            label="Bio"
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          />

          {/* Payroll commission */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Payroll</p>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Payment type</label>
                <select
                  value={form.commission_type}
                  onChange={(e) => setForm((f) => ({ ...f, commission_type: e.target.value as CommissionType }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) bg-white"
                >
                  <option value="percentage">% of service (excl. VAT)</option>
                  <option value="hourly">Hourly rate (£/hr)</option>
                </select>
              </div>
              <div className="w-32">
                <label className="text-xs text-gray-500 mb-1 block">
                  {form.commission_type === 'percentage' ? 'Percentage (%)' : 'Rate (£/hr)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step={form.commission_type === 'percentage' ? '0.5' : '0.01'}
                  max={form.commission_type === 'percentage' ? '100' : undefined}
                  value={form.commission_rate}
                  onChange={(e) => setForm((f) => ({ ...f, commission_rate: e.target.value }))}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {form.commission_type === 'percentage'
                ? `Staff receives ${form.commission_rate || 0}% of the service price excl. VAT.`
                : `Staff receives £${parseFloat(form.commission_rate || '0').toFixed(2)}/hr based on service duration.`}
            </p>
          </div>

          {/* Working hours */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Working Hours</p>
            <div className="space-y-2">
              {DAYS.map((day, i) => (
                <div key={i} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 w-28 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={schedule[i].enabled}
                      onChange={(e) =>
                        setSchedule((s) => ({ ...s, [i]: { ...s[i], enabled: e.target.checked } }))
                      }
                      className="accent-(--color-primary)"
                    />
                    <span className="text-sm text-gray-700">{day.slice(0, 3)}</span>
                  </label>
                  {schedule[i].enabled && (
                    <>
                      <input
                        type="time"
                        value={schedule[i].start_time}
                        onChange={(e) =>
                          setSchedule((s) => ({ ...s, [i]: { ...s[i], start_time: e.target.value } }))
                        }
                        className="h-8 px-2 text-xs border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-(--color-primary)"
                      />
                      <span className="text-xs text-gray-400">to</span>
                      <input
                        type="time"
                        value={schedule[i].end_time}
                        onChange={(e) =>
                          setSchedule((s) => ({ ...s, [i]: { ...s[i], end_time: e.target.value } }))
                        }
                        className="h-8 px-2 text-xs border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-(--color-primary)"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {saveError}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Leave / blocked-dates modal */}
      <Modal
        open={!!leaveMember}
        onClose={() => setLeaveMember(null)}
        title={`Leave & Blocked Dates — ${leaveMember?.name ?? ''}`}
        size="lg"
      >
        <div className="space-y-5">
          {/* Add new block */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Block a date range</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">From</label>
                <input
                  type="date"
                  value={leaveForm.startDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="h-9 px-3 text-sm border border-gray-200 rounded-(--border-radius-sm) outline-none focus:ring-2 focus:ring-(--color-primary)"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">To</label>
                <input
                  type="date"
                  value={leaveForm.endDate}
                  min={leaveForm.startDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="h-9 px-3 text-sm border border-gray-200 rounded-(--border-radius-sm) outline-none focus:ring-2 focus:ring-(--color-primary)"
                />
              </div>
            </div>
            <input
              type="text"
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Reason (e.g. Annual Leave, Training)"
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-(--border-radius-sm) outline-none focus:ring-2 focus:ring-(--color-primary)"
            />
            {leaveError && <p className="text-xs text-red-500">{leaveError}</p>}
            <Button size="sm" loading={leaveAdding} onClick={handleAddLeave}>
              Block these dates
            </Button>
          </div>

          {/* Existing blocks */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Scheduled blocks</p>
            {leaveLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : leaveBlocks.length === 0 ? (
              <p className="text-sm text-gray-400">No blocked dates scheduled.</p>
            ) : (
              <div className="space-y-2">
                {leaveBlocks.map((block) => {
                  const start = parseISO(block.starts_at)
                  const end = parseISO(block.ends_at)
                  const isPast = isBefore(end, new Date())
                  return (
                    <div
                      key={block.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border ${isPast ? 'border-gray-100 bg-gray-50 opacity-50' : 'border-gray-200 bg-white'}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {format(start, 'd MMM yyyy')}
                          {format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd') && (
                            <> → {format(end, 'd MMM yyyy')}</>
                          )}
                        </p>
                        {block.reason && <p className="text-xs text-gray-500">{block.reason}</p>}
                      </div>
                      <button
                        onClick={() => handleDeleteLeave(block.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        title="Remove block"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button variant="secondary" onClick={() => setLeaveMember(null)}>Done</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
