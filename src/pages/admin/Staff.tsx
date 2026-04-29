import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Staff, Availability } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface StaffForm {
  name: string
  role: string
  bio: string
  avatar_url: string
}

const emptyForm: StaffForm = { name: '', role: 'staff', bio: '', avatar_url: '' }

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
    setForm({ name: member.name, role: member.role, bio: member.bio ?? '', avatar_url: member.avatar_url ?? '' })
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
    setSchedule(defaultSchedule())
    setErrors({})
    setModalOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name required'
    return e
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)

    let staffId: string

    if (editTarget) {
      const { data } = await supabase
        .from('staff')
        .update({ name: form.name, role: form.role, bio: form.bio || null, avatar_url: form.avatar_url || null })
        .eq('id', editTarget.id)
        .select().single()
      if (data) setStaff((prev) => prev.map((s) => (s.id === editTarget.id ? data as Staff : s)))
      staffId = editTarget.id
    } else {
      const { data } = await supabase
        .from('staff')
        .insert({ ...form, bio: form.bio || null, avatar_url: form.avatar_url || null, business_id: BUSINESS_ID })
        .select().single()
      if (data) { setStaff((prev) => [...prev, data as Staff]); staffId = (data as Staff).id }
      else { setSaving(false); return }
    }

    // Sync availability
    await supabase.from('availability').delete().eq('staff_id', staffId!)
    const toInsert = Object.entries(schedule)
      .filter(([, v]) => v.enabled)
      .map(([day, v]) => ({
        staff_id: staffId!,
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

  if (loading) return <FullPageSpinner />

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
          <Card key={member.id} padding="md" className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar src={member.avatar_url} name={member.name} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{member.name}</p>
                <Badge variant="default" className="mt-1 capitalize">{member.role}</Badge>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(member)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(member.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600">
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
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors.name} />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="h-10 px-3 text-sm border border-gray-200 bg-white [border-radius:var(--border-radius-sm)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <Input label="Avatar URL" value={form.avatar_url} onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))} placeholder="https://…" />
          <Textarea label="Bio" value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />

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
                      onChange={(e) => setSchedule((s) => ({ ...s, [i]: { ...s[i], enabled: e.target.checked } }))}
                      className="accent-[var(--color-primary)]"
                    />
                    <span className="text-sm text-gray-700">{day.slice(0, 3)}</span>
                  </label>
                  {schedule[i].enabled && (
                    <>
                      <input
                        type="time"
                        value={schedule[i].start_time}
                        onChange={(e) => setSchedule((s) => ({ ...s, [i]: { ...s[i], start_time: e.target.value } }))}
                        className="h-8 px-2 text-xs border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                      />
                      <span className="text-xs text-gray-400">to</span>
                      <input
                        type="time"
                        value={schedule[i].end_time}
                        onChange={(e) => setSchedule((s) => ({ ...s, [i]: { ...s[i], end_time: e.target.value } }))}
                        className="h-8 px-2 text-xs border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
