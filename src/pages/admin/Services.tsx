import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDuration, calculateDeposit } from '@/lib/currency'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Service, ServiceVariant, DepositType } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

const empty: Omit<Service, 'id' | 'business_id'> = {
  name: '', description: null, duration_minutes: 60, price: 0, category: 'General', is_active: true,
  is_self_service: false, deposit_type: 'none', deposit_value: 0,
}

export default function AdminServices() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Service | null>(null)
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [variantsList, setVariantsList] = useState<ServiceVariant[]>([])
  const [variantForm, setVariantForm] = useState({ name: '', duration_minutes: 60, price: '' })
  const [addingVariant, setAddingVariant] = useState(false)
  const [savingVariant, setSavingVariant] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('services')
      .select('*, variants:service_variants(id, name, duration_minutes, price, sort_order, is_active)')
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

  async function openEdit(service: Service) {
    setEditTarget(service)
    setForm({ name: service.name, description: service.description, duration_minutes: service.duration_minutes, price: service.price, category: service.category, is_active: service.is_active, is_self_service: service.is_self_service, deposit_type: service.deposit_type, deposit_value: service.deposit_value })
    setErrors({})
    setVariantForm({ name: '', duration_minutes: 60, price: '' })
    setAddingVariant(false)
    const { data } = await supabase
      .from('service_variants')
      .select('*')
      .eq('service_id', service.id)
      .eq('is_active', true)
      .order('sort_order')
    setVariantsList((data as ServiceVariant[]) ?? [])
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

  async function handleAddVariant() {
    if (!editTarget || !variantForm.name.trim()) return
    setSavingVariant(true)
    const priceInPence = Math.round(parseFloat(String(variantForm.price)) * 100) || 0
    const { data } = await supabase
      .from('service_variants')
      .insert({
        service_id: editTarget.id,
        name: variantForm.name,
        duration_minutes: variantForm.duration_minutes,
        price: priceInPence,
        sort_order: variantsList.length,
      })
      .select().single()
    if (data) {
      setVariantsList((prev) => [...prev, data as ServiceVariant])
      setVariantForm({ name: '', duration_minutes: 60, price: '' })
      setAddingVariant(false)
    }
    setSavingVariant(false)
  }

  async function handleDeleteVariant(id: string) {
    await supabase.from('service_variants').update({ is_active: false }).eq('id', id)
    setVariantsList((prev) => prev.filter((v) => v.id !== id))
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
                {service.is_self_service && <Badge variant="brand">Self-service</Badge>}
                {!service.is_active && <Badge variant="danger">Inactive</Badge>}
              </div>
              {service.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{service.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {(() => {
                  const av = (service.variants ?? []).filter((v) => v.is_active)
                  return av.length > 0 ? (
                    <>
                      {av.length} variant{av.length !== 1 ? 's' : ''} · from {formatCurrency(Math.min(...av.map((v) => v.price)))}
                    </>
                  ) : (
                    <>
                      {formatDuration(service.duration_minutes)} · {formatCurrency(service.price)}
                      {service.deposit_type !== 'none' && (
                        <span className="ml-1 text-amber-600">
                          · {formatCurrency(calculateDeposit(service))} deposit
                        </span>
                      )}
                    </>
                  )
                })()}
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

          {/* Self-service toggle */}
          <label className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 accent-(--color-primary)"
              checked={form.is_self_service}
              onChange={(e) => setForm((f) => ({ ...f, is_self_service: e.target.checked }))}
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Self-service room</p>
              <p className="text-xs text-gray-500 mt-0.5">
                No staff member required. Customers book a time slot directly — ideal for rooms like recovery pools or contrast therapy.
              </p>
            </div>
          </label>

          {/* Variants — only available when editing an existing service */}
          {editTarget && (
            <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Variants</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Different durations / prices for the same service, e.g. 45 min £45 or 60 min £60.
                  </p>
                </div>
                {!addingVariant && (
                  <button
                    type="button"
                    onClick={() => setAddingVariant(true)}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                )}
              </div>

              {variantsList.map((v) => (
                <div key={v.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900">{v.name}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      {formatDuration(v.duration_minutes)} · {formatCurrency(v.price)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteVariant(v.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {addingVariant && (
                <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      label="Name"
                      value={variantForm.name}
                      onChange={(e) => setVariantForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. 45 min"
                    />
                    <Input
                      label="Duration (min)"
                      type="number"
                      min={5}
                      value={variantForm.duration_minutes}
                      onChange={(e) => setVariantForm((f) => ({ ...f, duration_minutes: parseInt(e.target.value) || 0 }))}
                    />
                    <Input
                      label="Price (£)"
                      type="number"
                      min={0}
                      step="0.01"
                      value={variantForm.price}
                      onChange={(e) => setVariantForm((f) => ({ ...f, price: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" loading={savingVariant} onClick={handleAddVariant}>Add</Button>
                    <Button size="sm" variant="secondary" onClick={() => setAddingVariant(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Deposit */}
          <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">Deposit</p>
            <div className="flex gap-2 flex-wrap">
              {(['none', 'fixed', 'percentage'] as DepositType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, deposit_type: t, deposit_value: t === 'none' ? 0 : f.deposit_value }))}
                  className={`px-3 py-1.5 text-xs font-medium border rounded-full transition-colors ${
                    form.deposit_type === t
                      ? 'bg-(--color-primary) text-white border-(--color-primary)'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {t === 'none' ? 'No deposit' : t === 'fixed' ? 'Fixed amount' : 'Percentage'}
                </button>
              ))}
            </div>
            {form.deposit_type !== 'none' && (
              <div className="flex items-end gap-3">
                <Input
                  label={form.deposit_type === 'fixed' ? 'Deposit amount (£)' : 'Deposit (%)'}
                  type="number"
                  min={0}
                  max={form.deposit_type === 'percentage' ? 100 : undefined}
                  step={form.deposit_type === 'fixed' ? '0.01' : '1'}
                  value={form.deposit_type === 'fixed' ? (form.deposit_value ? form.deposit_value / 100 : '') : (form.deposit_value || '')}
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value)
                    setForm((f) => ({
                      ...f,
                      deposit_value: f.deposit_type === 'fixed'
                        ? Math.round(raw * 100) || 0
                        : Math.min(100, Math.round(raw) || 0),
                    }))
                  }}
                  placeholder={form.deposit_type === 'fixed' ? '0.00' : '25'}
                  className="flex-1"
                />
                {form.deposit_type === 'percentage' && form.price > 0 && form.deposit_value > 0 && (
                  <p className="text-xs text-gray-500 pb-2 shrink-0">
                    = {formatCurrency(Math.round(form.price * form.deposit_value / 100))}
                  </p>
                )}
              </div>
            )}
            {form.deposit_type !== 'none' && form.price > 0 && form.deposit_value > 0 && (
              <p className="text-xs text-gray-400">
                Balance due at appointment:{' '}
                {formatCurrency(form.price - (form.deposit_type === 'fixed'
                  ? form.deposit_value
                  : Math.round(form.price * form.deposit_value / 100)))}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>Save Service</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
