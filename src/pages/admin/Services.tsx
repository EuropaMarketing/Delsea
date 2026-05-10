import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDuration, calculateDeposit } from '@/lib/currency'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Service, ServiceSession, ServiceVariant, ServiceAddon, DepositType, Resource, Staff, CommissionType } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const empty: Omit<Service, 'id' | 'business_id'> = {
  name: '', description: null, duration_minutes: 60, price: 0, category: 'General', is_active: true,
  is_self_service: false, is_group_session: false, max_capacity: null, deposit_type: 'none', deposit_value: 0,
  resource_id: null, pre_buffer_minutes: 0, post_buffer_minutes: 0,
}

export default function AdminServices() {
  const [services, setServices] = useState<Service[]>([])
  const [resources, setResources] = useState<Resource[]>([])
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
  const [sessionsList, setSessionsList] = useState<ServiceSession[]>([])
  const [sessionForm, setSessionForm] = useState({ day_of_week: 1, start_time: '09:00' })
  const [addingSession, setAddingSession] = useState(false)
  const [savingSession, setSavingSession] = useState(false)

  // Staff assignments
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  // Map of staff_id → override or null (null = assigned with no override)
  type Assignment = { commission_type: CommissionType | null; commission_rate: string | null }
  const [staffAssignments, setStaffAssignments] = useState<Map<string, Assignment>>(new Map())
  const [togglingStaffId, setTogglingStaffId] = useState<string | null>(null)

  // Add-ons
  const [addonsList, setAddonsList] = useState<ServiceAddon[]>([])
  const [addingAddon, setAddingAddon] = useState(false)
  const [addonForm, setAddonForm] = useState({ name: '', duration_minutes: 15, price: '' })
  const [savingAddon, setSavingAddon] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [svcRes, resRes] = await Promise.all([
      supabase
        .from('services')
        .select('*, variants:service_variants(id, name, duration_minutes, price, sort_order, is_active)')
        .eq('business_id', BUSINESS_ID)
        .order('category').order('name'),
      supabase.from('resources').select('*').eq('business_id', BUSINESS_ID).eq('is_active', true).order('name'),
    ])
    if (svcRes.data) setServices(svcRes.data as Service[])
    if (resRes.data) setResources(resRes.data as Resource[])
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
    setForm({ name: service.name, description: service.description, duration_minutes: service.duration_minutes, price: service.price, category: service.category, is_active: service.is_active, is_self_service: service.is_self_service, is_group_session: service.is_group_session, max_capacity: service.max_capacity, deposit_type: service.deposit_type, deposit_value: service.deposit_value, resource_id: service.resource_id ?? null, pre_buffer_minutes: service.pre_buffer_minutes ?? 0, post_buffer_minutes: service.post_buffer_minutes ?? 0 })
    setErrors({})
    setVariantForm({ name: '', duration_minutes: 60, price: '' })
    setAddingVariant(false)
    setAddingSession(false)
    setSessionForm({ day_of_week: 1, start_time: '09:00' })
    const [variantsRes, sessionsRes, staffRes, assignRes, addonsRes] = await Promise.all([
      supabase.from('service_variants').select('*').eq('service_id', service.id).eq('is_active', true).order('sort_order'),
      supabase.from('service_sessions').select('*').eq('service_id', service.id).eq('is_active', true).order('day_of_week').order('start_time'),
      supabase.from('staff').select('*').eq('business_id', BUSINESS_ID).order('name'),
      supabase.from('staff_services').select('*').eq('service_id', service.id),
      supabase.from('service_addons').select('*').eq('service_id', service.id).eq('is_active', true).order('name'),
    ])
    setVariantsList((variantsRes.data as ServiceVariant[]) ?? [])
    setSessionsList((sessionsRes.data as ServiceSession[]) ?? [])
    setAllStaff((staffRes.data as Staff[]) ?? [])
    const aMap = new Map<string, Assignment>()
    for (const row of (assignRes.data ?? [])) {
      aMap.set(row.staff_id, {
        commission_type: row.commission_type ?? null,
        commission_rate: row.commission_rate != null ? String(row.commission_rate) : null,
      })
    }
    setStaffAssignments(aMap)
    setAddonsList((addonsRes.data as ServiceAddon[]) ?? [])
    setAddingAddon(false)
    setAddonForm({ name: '', duration_minutes: 15, price: '' })
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

    const payload = {
      ...form,
      // Group sessions are always self-service
      is_self_service: form.is_self_service || form.is_group_session,
    }
    if (editTarget) {
      const { data } = await supabase.from('services').update(payload).eq('id', editTarget.id).select().single()
      if (data) setServices((prev) => prev.map((s) => (s.id === editTarget.id ? data as Service : s)))
    } else {
      const { data } = await supabase.from('services').insert({ ...payload, business_id: BUSINESS_ID }).select().single()
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

  async function handleAddSession() {
    if (!editTarget) return
    setSavingSession(true)
    const { data } = await supabase
      .from('service_sessions')
      .insert({ business_id: BUSINESS_ID, service_id: editTarget.id, day_of_week: sessionForm.day_of_week, start_time: sessionForm.start_time })
      .select().single()
    if (data) {
      setSessionsList((prev) =>
        [...prev, data as ServiceSession].sort((a, b) =>
          a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)
        )
      )
      setAddingSession(false)
    }
    setSavingSession(false)
  }

  async function handleDeleteSession(id: string) {
    await supabase.from('service_sessions').update({ is_active: false }).eq('id', id)
    setSessionsList((prev) => prev.filter((s) => s.id !== id))
  }

  async function handleToggleAssignment(staffId: string) {
    if (!editTarget) return
    setTogglingStaffId(staffId)
    const isAssigned = staffAssignments.has(staffId)
    if (isAssigned) {
      await supabase.from('staff_services').delete().eq('service_id', editTarget.id).eq('staff_id', staffId)
      setStaffAssignments(prev => { const n = new Map(prev); n.delete(staffId); return n })
    } else {
      await supabase.from('staff_services').insert({ service_id: editTarget.id, staff_id: staffId })
      setStaffAssignments(prev => new Map(prev).set(staffId, { commission_type: null, commission_rate: null }))
    }
    setTogglingStaffId(null)
  }

  async function handleSaveOverride(staffId: string, type: CommissionType | null, rate: string | null) {
    if (!editTarget || !staffAssignments.has(staffId)) return
    const commission_type = type || null
    const commission_rate = rate ? parseFloat(rate) : null
    await supabase.from('staff_services')
      .update({ commission_type, commission_rate })
      .eq('service_id', editTarget.id).eq('staff_id', staffId)
    setStaffAssignments(prev => new Map(prev).set(staffId, { commission_type, commission_rate: rate }))
  }

  async function handleAddAddon() {
    if (!editTarget || !addonForm.name.trim()) return
    setSavingAddon(true)
    const priceInPence = Math.round(parseFloat(addonForm.price) * 100) || 0
    const { data } = await supabase.from('service_addons').insert({
      service_id: editTarget.id,
      name: addonForm.name.trim(),
      duration_minutes: addonForm.duration_minutes,
      price: priceInPence,
    }).select().single()
    if (data) {
      setAddonsList(prev => [...prev, data as ServiceAddon].sort((a, b) => a.name.localeCompare(b.name)))
      setAddonForm({ name: '', duration_minutes: 15, price: '' })
      setAddingAddon(false)
    }
    setSavingAddon(false)
  }

  async function handleDeleteAddon(id: string) {
    await supabase.from('service_addons').update({ is_active: false }).eq('id', id)
    setAddonsList(prev => prev.filter(a => a.id !== id))
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
                {service.is_group_session && <Badge variant="brand"><Users className="h-3 w-3 mr-1 inline" />Group · max {service.max_capacity ?? 8}</Badge>}
                {service.is_self_service && !service.is_group_session && <Badge variant="brand">Self-service</Badge>}
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
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Pre-buffer (minutes)"
              type="number"
              min={0}
              value={form.pre_buffer_minutes || ''}
              onChange={(e) => setForm((f) => ({ ...f, pre_buffer_minutes: parseInt(e.target.value) || 0 }))}
              placeholder="0"
              hint="Prep time before client arrives"
            />
            <Input
              label="Post-buffer (minutes)"
              type="number"
              min={0}
              value={form.post_buffer_minutes || ''}
              onChange={(e) => setForm((f) => ({ ...f, post_buffer_minutes: parseInt(e.target.value) || 0 }))}
              placeholder="0"
              hint="Clean-down time after service"
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
              disabled={form.is_group_session}
              onChange={(e) => setForm((f) => ({ ...f, is_self_service: e.target.checked }))}
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Self-service room</p>
              <p className="text-xs text-gray-500 mt-0.5">
                No staff member required. Customers book a time slot directly — ideal for rooms like recovery pools or contrast therapy.
              </p>
            </div>
          </label>

          {/* Group session toggle */}
          <label className="flex items-start gap-3 p-3 border border-gray-100 rounded-xl bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 accent-(--color-primary)"
              checked={form.is_group_session}
              onChange={(e) => setForm((f) => ({
                ...f,
                is_group_session: e.target.checked,
                is_self_service: e.target.checked ? true : f.is_self_service,
                max_capacity: e.target.checked ? (f.max_capacity ?? 8) : null,
              }))}
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Group session</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Multiple clients can book the same fixed time slot up to a maximum capacity — ideal for classes or group therapy.
              </p>
            </div>
          </label>

          {/* Max capacity — only for group sessions */}
          {form.is_group_session && (
            <Input
              label="Max capacity per session"
              type="number"
              min={1}
              max={100}
              value={form.max_capacity ?? 8}
              onChange={(e) => setForm((f) => ({ ...f, max_capacity: parseInt(e.target.value) || 1 }))}
            />
          )}

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

          {/* Session schedule — only for group sessions when editing */}
          {editTarget && form.is_group_session && (
            <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Session Schedule</p>
                  <p className="text-xs text-gray-500 mt-0.5">Set the recurring days and times this session runs.</p>
                </div>
                {!addingSession && (
                  <button
                    type="button"
                    onClick={() => setAddingSession(true)}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                )}
              </div>

              {sessionsList.length === 0 && !addingSession && (
                <p className="text-xs text-gray-400 text-center py-2">No sessions scheduled yet. Add one above.</p>
              )}

              {DAY_NAMES.map((dayName, dow) => {
                const daySessions = sessionsList.filter((s) => s.day_of_week === dow)
                if (!daySessions.length) return null
                return (
                  <div key={dow}>
                    <p className="text-xs font-semibold text-gray-500 mb-1">{dayName}</p>
                    <div className="space-y-1">
                      {daySessions.map((s) => (
                        <div key={s.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                          <span className="text-sm font-medium text-gray-900">{s.start_time.substring(0, 5)}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(s.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {addingSession && (
                <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">Day</label>
                      <select
                        value={sessionForm.day_of_week}
                        onChange={(e) => setSessionForm((f) => ({ ...f, day_of_week: parseInt(e.target.value) }))}
                        className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded outline-none focus:ring-2 focus:ring-(--color-primary)"
                      >
                        {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                    <Input
                      label="Start time"
                      type="time"
                      value={sessionForm.start_time}
                      onChange={(e) => setSessionForm((f) => ({ ...f, start_time: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" loading={savingSession} onClick={handleAddSession}>Add</Button>
                    <Button size="sm" variant="secondary" onClick={() => setAddingSession(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Staff Assignments — only for staff-led services when editing */}
          {editTarget && !form.is_self_service && !form.is_group_session && (
            <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
              <div>
                <p className="text-sm font-semibold text-gray-700">Staff Assignments</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  If none are selected, all staff can perform this service.
                  Checked staff can optionally have a commission override for this service.
                </p>
              </div>
              {allStaff.map(member => {
                const isAssigned = staffAssignments.has(member.id)
                const override = staffAssignments.get(member.id)
                const hasOverride = isAssigned && (override?.commission_type || override?.commission_rate)
                return (
                  <div key={member.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        disabled={togglingStaffId === member.id}
                        onChange={() => handleToggleAssignment(member.id)}
                        className="accent-(--color-primary)"
                      />
                      <span className="text-sm font-medium text-gray-900 flex-1">{member.name}</span>
                      {isAssigned && (
                        <span className="text-xs text-gray-400">
                          {hasOverride
                            ? override?.commission_type === 'hourly'
                              ? `£${parseFloat(override.commission_rate ?? '0').toFixed(2)}/hr override`
                              : `${override?.commission_rate ?? member.commission_rate}% override`
                            : `Default (${member.commission_type === 'hourly' ? `£${(member.commission_rate / 100).toFixed(2)}/hr` : `${member.commission_rate}%`})`
                          }
                        </span>
                      )}
                    </div>
                    {isAssigned && (
                      <div className="flex items-center gap-2 pl-6">
                        <span className="text-xs text-gray-500 w-20">Override:</span>
                        <select
                          value={override?.commission_type ?? ''}
                          onChange={e => handleSaveOverride(member.id, (e.target.value as CommissionType) || null, override?.commission_rate ?? null)}
                          className="text-xs h-8 px-2 border border-gray-200 rounded bg-white outline-none focus:ring-1 focus:ring-(--color-primary)"
                        >
                          <option value="">Use default</option>
                          <option value="percentage">% of excl. VAT</option>
                          <option value="hourly">Hourly (£/hr)</option>
                        </select>
                        {override?.commission_type && (
                          <input
                            type="number"
                            min="0"
                            step={override.commission_type === 'percentage' ? '0.5' : '0.01'}
                            value={override.commission_rate ?? ''}
                            onChange={e => setStaffAssignments(prev =>
                              new Map(prev).set(member.id, { ...override, commission_rate: e.target.value })
                            )}
                            onBlur={e => handleSaveOverride(member.id, override.commission_type, e.target.value || null)}
                            placeholder={override.commission_type === 'percentage' ? '50' : '15.00'}
                            className="text-xs h-8 w-20 px-2 border border-gray-200 rounded outline-none focus:ring-1 focus:ring-(--color-primary)"
                          />
                        )}
                        {override?.commission_type && (
                          <span className="text-xs text-gray-400">
                            {override.commission_type === 'percentage' ? '%' : '£/hr'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add-ons — only for staff-led services when editing */}
          {editTarget && !form.is_self_service && !form.is_group_session && (
            <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Add-ons</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Extra treatments customers can add at booking — e.g. cupping, dry needling.
                  </p>
                </div>
                {!addingAddon && (
                  <button
                    type="button"
                    onClick={() => setAddingAddon(true)}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                )}
              </div>

              {addonsList.length === 0 && !addingAddon && (
                <p className="text-xs text-gray-400 text-center py-2">No add-ons yet.</p>
              )}

              {addonsList.map(addon => (
                <div key={addon.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900">{addon.name}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      +{addon.duration_minutes} min · +{formatCurrency(addon.price)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAddon(addon.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {addingAddon && (
                <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      label="Name"
                      value={addonForm.name}
                      onChange={e => setAddonForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Cupping"
                    />
                    <Input
                      label="Extra duration (min)"
                      type="number"
                      min={5}
                      value={addonForm.duration_minutes}
                      onChange={e => setAddonForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 0 }))}
                    />
                    <Input
                      label="Extra price (£)"
                      type="number"
                      min={0}
                      step="0.01"
                      value={addonForm.price}
                      onChange={e => setAddonForm(f => ({ ...f, price: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" loading={savingAddon} onClick={handleAddAddon}>Add</Button>
                    <Button size="sm" variant="secondary" onClick={() => setAddingAddon(false)}>Cancel</Button>
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

          {resources.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Required Resource</label>
              <select
                value={form.resource_id ?? ''}
                onChange={e => setForm(f => ({ ...f, resource_id: e.target.value || null }))}
                className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
              >
                <option value="">No resource required</option>
                {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>Save Service</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
