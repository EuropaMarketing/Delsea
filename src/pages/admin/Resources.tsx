import { useEffect, useState } from 'react'
import { DoorOpen, Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Resource } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

const emptyForm = { name: '', description: '' }

export default function AdminResources() {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<Resource | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('resources')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .order('name')
      .then(({ data }) => {
        if (data) setResources(data as Resource[])
        setLoading(false)
      })
  }, [])

  function openCreate() {
    setEditTarget(null)
    setForm({ ...emptyForm })
    setError('')
  }

  function openEdit(resource: Resource) {
    setEditTarget(resource)
    setForm({ name: resource.name, description: resource.description ?? '' })
    setError('')
  }

  function closeModal() {
    setEditTarget(null)
    setForm({ ...emptyForm })
  }

  const isModalOpen = editTarget !== null || (form.name !== '' || form.description !== '')

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')

    if (editTarget) {
      const { error: err } = await supabase
        .from('resources')
        .update({ name: form.name.trim(), description: form.description.trim() || null })
        .eq('id', editTarget.id)
      if (err) { setError(err.message); setSaving(false); return }
      setResources(prev => prev.map(r => r.id === editTarget.id ? { ...r, name: form.name.trim(), description: form.description.trim() || null } : r))
    } else {
      const { data, error: err } = await supabase
        .from('resources')
        .insert({ business_id: BUSINESS_ID, name: form.name.trim(), description: form.description.trim() || null })
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      setResources(prev => [...prev, data as Resource])
    }
    closeModal()
    setSaving(false)
  }

  async function toggleActive(resource: Resource) {
    const { error: err } = await supabase
      .from('resources')
      .update({ is_active: !resource.is_active })
      .eq('id', resource.id)
    if (!err) setResources(prev => prev.map(r => r.id === resource.id ? { ...r, is_active: !resource.is_active } : r))
  }

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
          <p className="text-sm text-gray-500 mt-1">Rooms, equipment, and other bookable resources. Assign them to services to prevent double-booking.</p>
        </div>
        <Button onClick={() => { setForm({ ...emptyForm }); setError(''); setEditTarget({} as Resource) }}>
          <Plus className="h-4 w-4" />
          New Resource
        </Button>
      </div>

      {resources.length === 0 ? (
        <Card padding="md" className="text-center py-16">
          <DoorOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-500">No resources yet.</p>
          <p className="text-sm text-gray-400 mt-1">Add rooms or equipment that can be assigned to services.</p>
          <Button className="mt-4" onClick={() => { setForm({ ...emptyForm }); setError(''); setEditTarget({} as Resource) }}>
            Add first resource
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {resources.map(resource => (
            <Card key={resource.id} padding="md">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-gray-400 shrink-0" />
                    <p className="font-semibold text-gray-900">{resource.name}</p>
                    <Badge variant={resource.is_active ? 'success' : 'neutral'}>
                      {resource.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {resource.description && (
                    <p className="text-xs text-gray-500 mt-1 ml-6">{resource.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEdit(resource)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => toggleActive(resource)} className="text-gray-400 hover:text-gray-600 transition-colors" title={resource.is_active ? 'Deactivate' : 'Activate'}>
                    {resource.is_active
                      ? <ToggleRight className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                      : <ToggleLeft className="h-6 w-6" />
                    }
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editTarget && editTarget.id ? 'Edit Resource' : 'New Resource'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Treatment Room 1"
            required
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="e.g. Ground floor, heated table"
          />
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>{editTarget && editTarget.id ? 'Save' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
