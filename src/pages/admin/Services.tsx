import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDuration } from '@/lib/currency'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Service } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

const empty: Omit<Service, 'id' | 'business_id'> = {
  name: '', description: null, duration_minutes: 60, price: 0, category: 'General', is_active: true,
}

export default function AdminServices() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Service | null>(null)
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .order('category').order('name')
    if (data) setServices(data as Service[])
    setLoading(false)
  }

  function openCreate() {
    setEditTarget(null)
    setForm(empty)
    setErrors({})
    setModalOpen(true)
  }

  function openEdit(service: Service) {
    setEditTarget(service)
    setForm({ name: service.name, description: service.description, duration_minutes: service.duration_minutes, price: service.price, category: service.category, is_active: service.is_active })
    setErrors({})
    setModalOpen(true)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name required'
    if (form.duration_minutes < 5) e.duration_minutes = 'Minimum 5 minutes'
    if (form.price < 0) e.price = 'Must be 0 or more'
    return e
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)

    if (editTarget) {
      const { data } = await supabase.from('services').update(form).eq('id', editTarget.id).select().single()
      if (data) setServices((prev) => prev.map((s) => (s.id === editTarget.id ? data as Service : s)))
    } else {
      const { data } = await supabase.from('services').insert({ ...form, business_id: BUSINESS_ID }).select().single()
      if (data) setServices((prev) => [...prev, data as Service])
    }
    setSaving(false)
    setModalOpen(false)
  }

  async function handleToggle(service: Service) {
    const { data } = await supabase.from('services').update({ is_active: !service.is_active }).eq('id', service.id).select().single()
    if (data) setServices((prev) => prev.map((s) => (s.id === service.id ? data as Service : s)))
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this service?')) return
    await supabase.from('services').delete().eq('id', id)
    setServices((prev) => prev.filter((s) => s.id !== id))
  }

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Services</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Service
        </Button>
      </div>

      <div className="space-y-2">
        {services.map((service) => (
          <Card key={service.id} padding="sm" className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900">{service.name}</p>
                <Badge variant="default">{service.category}</Badge>
                {!service.is_active && <Badge variant="danger">Inactive</Badge>}
              </div>
              {service.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{service.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {formatDuration(service.duration_minutes)} · {formatCurrency(service.price)}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => handleToggle(service)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                title={service.is_active ? 'Deactivate' : 'Activate'}
              >
                {service.is_active
                  ? <ToggleRight className="h-5 w-5 text-[var(--color-primary)]" />
                  : <ToggleLeft className="h-5 w-5" />
                }
              </button>
              <button onClick={() => openEdit(service)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => handleDelete(service.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Service' : 'New Service'}
      >
        <div className="space-y-4">
          <Input
            label="Name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
          />
          <Textarea
            label="Description"
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Duration (minutes)"
              type="number"
              min={5}
              value={form.duration_minutes}
              onChange={(e) => setForm((f) => ({ ...f, duration_minutes: parseInt(e.target.value) || 0 }))}
              error={errors.duration_minutes}
            />
            <Input
              label="Price (£)"
              type="number"
              min={0}
              step="0.01"
              value={form.price ? form.price / 100 : ''}
              onChange={(e) => setForm((f) => ({ ...f, price: Math.round(parseFloat(e.target.value) * 100) || 0 }))}
              placeholder="0.00"
              error={errors.price}
            />
          </div>
          <Input
            label="Category"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>Save Service</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
