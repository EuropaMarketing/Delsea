import { useEffect, useState } from 'react'
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, ClipboardList,
  ToggleRight, Type, AlignLeft, CheckSquare, Phone, Heading1, X, Save, Eye, EyeOff,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type ServiceForm = {
  id: string
  service_id: string | null
  title: string
  description: string | null
  is_active: boolean
  validity_months: number
  service?: { name: string } | null
}

type FormField = {
  id: string
  form_id: string
  field_type: 'heading' | 'yes_no' | 'text' | 'textarea' | 'checkbox' | 'emergency_contact'
  label: string
  required: boolean
  position: number
  options: {
    follow_up_label?: string
    description?: string
  }
}

type Service = { id: string; name: string }

const FIELD_TYPES: { type: FormField['field_type']; label: string; icon: typeof Type; color: string }[] = [
  { type: 'heading',           label: 'Section Heading',    icon: Heading1,    color: 'text-gray-500 bg-gray-100' },
  { type: 'yes_no',            label: 'Yes / No',           icon: ToggleRight, color: 'text-blue-600 bg-blue-50' },
  { type: 'text',              label: 'Short Text',         icon: Type,        color: 'text-violet-600 bg-violet-50' },
  { type: 'textarea',          label: 'Long Text',          icon: AlignLeft,   color: 'text-orange-600 bg-orange-50' },
  { type: 'checkbox',          label: 'Acknowledgement',    icon: CheckSquare, color: 'text-green-600 bg-green-50' },
  { type: 'emergency_contact', label: 'Emergency Contact',  icon: Phone,       color: 'text-red-600 bg-red-50' },
]

function fieldTypeMeta(type: FormField['field_type']) {
  return FIELD_TYPES.find(f => f.type === type) ?? FIELD_TYPES[0]
}

export default function AdminForms() {
  const [forms, setForms] = useState<ServiceForm[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [selectedForm, setSelectedForm] = useState<ServiceForm | null>(null)
  const [fields, setFields] = useState<FormField[]>([])
  const [editingField, setEditingField] = useState<string | null>(null) // field id being edited inline
  const [loading, setLoading] = useState(true)
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // New form modal state
  const [newFormOpen, setNewFormOpen] = useState(false)
  const [newServiceId, setNewServiceId] = useState('')
  const [newTitle, setNewTitle] = useState('Health Questionnaire')
  const [creating, setCreating] = useState(false)

  // Edited form header state (title/desc/validity)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editValidity, setEditValidity] = useState(6)

  // Inline field editor state
  const [fieldLabel, setFieldLabel] = useState('')
  const [fieldRequired, setFieldRequired] = useState(false)
  const [fieldFollowUp, setFieldFollowUp] = useState(false)
  const [fieldFollowUpLabel, setFieldFollowUpLabel] = useState('Please provide further details')
  const [fieldDescription, setFieldDescription] = useState('')

  useEffect(() => {
    async function load() {
      const [formsRes, servicesRes] = await Promise.all([
        supabase
          .from('service_forms')
          .select('*, service:services(name)')
          .eq('business_id', BUSINESS_ID)
          .order('created_at'),
        supabase
          .from('services')
          .select('id, name')
          .eq('business_id', BUSINESS_ID)
          .eq('is_active', true)
          .order('name'),
      ])
      if (formsRes.data) setForms(formsRes.data as ServiceForm[])
      if (servicesRes.data) setServices(servicesRes.data as Service[])
      setLoading(false)
    }
    load()
  }, [])

  async function openForm(form: ServiceForm) {
    setSelectedForm(form)
    setEditTitle(form.title)
    setEditDesc(form.description ?? '')
    setEditValidity(form.validity_months)
    setEditingField(null)
    setFieldsLoading(true)
    const { data } = await supabase
      .from('form_fields')
      .select('*')
      .eq('form_id', form.id)
      .order('position')
    setFields((data ?? []) as FormField[])
    setFieldsLoading(false)
  }

  async function createForm() {
    if (!newServiceId || !newTitle.trim()) return
    setCreating(true)
    const { data } = await supabase
      .from('service_forms')
      .insert({ business_id: BUSINESS_ID, service_id: newServiceId, title: newTitle.trim(), validity_months: 6 })
      .select('*, service:services(name)')
      .single()
    if (data) {
      const form = data as ServiceForm
      setForms(prev => [...prev, form])
      setNewFormOpen(false)
      setNewServiceId('')
      setNewTitle('Health Questionnaire')
      openForm(form)
    }
    setCreating(false)
  }

  async function saveFormHeader() {
    if (!selectedForm) return
    setSaving(true)
    const updates = { title: editTitle.trim(), description: editDesc.trim() || null, validity_months: editValidity, updated_at: new Date().toISOString() }
    await supabase.from('service_forms').update(updates).eq('id', selectedForm.id)
    const updated = { ...selectedForm, ...updates }
    setSelectedForm(updated)
    setForms(prev => prev.map(f => f.id === selectedForm.id ? { ...f, ...updates } : f))
    setSaving(false)
  }

  async function toggleActive(form: ServiceForm) {
    const is_active = !form.is_active
    await supabase.from('service_forms').update({ is_active }).eq('id', form.id)
    setForms(prev => prev.map(f => f.id === form.id ? { ...f, is_active } : f))
    if (selectedForm?.id === form.id) setSelectedForm(prev => prev ? { ...prev, is_active } : prev)
  }

  async function deleteForm(formId: string) {
    if (!confirm('Delete this form and all its fields? Customer responses will be kept.')) return
    await supabase.from('service_forms').delete().eq('id', formId)
    setForms(prev => prev.filter(f => f.id !== formId))
    if (selectedForm?.id === formId) setSelectedForm(null)
  }

  async function addField(type: FormField['field_type']) {
    if (!selectedForm) return
    const position = fields.length > 0 ? Math.max(...fields.map(f => f.position)) + 1 : 0
    const defaultLabel =
      type === 'heading'           ? 'Section Title' :
      type === 'yes_no'            ? 'New question?' :
      type === 'text'              ? 'Your answer' :
      type === 'textarea'          ? 'Additional information' :
      type === 'checkbox'          ? 'I confirm that I have read and understood the above' :
      /* emergency_contact */        'Emergency Contact'
    const { data } = await supabase
      .from('form_fields')
      .insert({ form_id: selectedForm.id, field_type: type, label: defaultLabel, required: type !== 'heading', position, options: {} })
      .select()
      .single()
    if (data) {
      const field = data as FormField
      setFields(prev => [...prev, field])
      openFieldEdit(field)
    }
  }

  function openFieldEdit(field: FormField) {
    setEditingField(field.id)
    setFieldLabel(field.label)
    setFieldRequired(field.required)
    setFieldFollowUp(!!field.options?.follow_up_label)
    setFieldFollowUpLabel(field.options?.follow_up_label ?? 'Please provide further details')
    setFieldDescription(field.options?.description ?? '')
  }

  async function saveField(fieldId: string) {
    const options: FormField['options'] = {}
    const field = fields.find(f => f.id === fieldId)
    if (!field) return
    if (field.field_type === 'yes_no' && fieldFollowUp) options.follow_up_label = fieldFollowUpLabel
    if (field.field_type === 'checkbox' && fieldDescription) options.description = fieldDescription
    const updates = { label: fieldLabel.trim() || field.label, required: fieldRequired, options }
    await supabase.from('form_fields').update(updates).eq('id', fieldId)
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, ...updates } : f))
    setEditingField(null)
  }

  async function deleteField(fieldId: string) {
    await supabase.from('form_fields').delete().eq('id', fieldId)
    setFields(prev => prev.filter(f => f.id !== fieldId))
    if (editingField === fieldId) setEditingField(null)
  }

  async function moveField(fieldId: string, direction: 'up' | 'down') {
    const sorted = [...fields].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex(f => f.id === fieldId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const a = sorted[idx], b = sorted[swapIdx]
    const [posA, posB] = [a.position, b.position]
    await Promise.all([
      supabase.from('form_fields').update({ position: posB }).eq('id', a.id),
      supabase.from('form_fields').update({ position: posA }).eq('id', b.id),
    ])
    setFields(prev => prev.map(f => f.id === a.id ? { ...f, position: posB } : f.id === b.id ? { ...f, position: posA } : f))
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-gray-600 rounded-full" /></div>

  const sortedFields = [...fields].sort((a, b) => a.position - b.position)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Health Forms</h1>
          <p className="text-sm text-gray-500 mt-0.5">Build consent and screening forms for each service.</p>
        </div>
        <Button onClick={() => setNewFormOpen(true)}>
          <Plus className="h-4 w-4" /> New Form
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Form list ── */}
        <div className="lg:col-span-2 space-y-2">
          {forms.length === 0 && (
            <Card padding="md" className="text-center py-12">
              <ClipboardList className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No forms yet.</p>
              <p className="text-xs text-gray-400 mt-1">Create one for each service that requires a questionnaire.</p>
            </Card>
          )}
          {forms.map(form => (
            <button
              key={form.id}
              onClick={() => openForm(form)}
              className={`w-full text-left transition-colors rounded-xl border px-4 py-3 flex items-start justify-between gap-3 ${
                selectedForm?.id === form.id
                  ? 'border-(--color-primary) bg-(--color-primary)/5'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{form.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{form.service?.name ?? 'All services'}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${form.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {form.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* ── Form editor ── */}
        <div className="lg:col-span-3">
          {!selectedForm ? (
            <Card padding="md" className="text-center py-16 text-gray-400 text-sm">
              Select a form to edit its fields
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Header editor */}
              <Card padding="md">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-700">Form Settings</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive(selectedForm)}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                          selectedForm.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {selectedForm.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        {selectedForm.is_active ? 'Active' : 'Inactive'}
                      </button>
                      <button onClick={() => deleteForm(selectedForm.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <Input label="Form title" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                  <Textarea label="Description / intro text (optional)" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} />
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700 shrink-0">Valid for</label>
                    <input
                      type="number" min={1} max={24}
                      value={editValidity}
                      onChange={e => setEditValidity(Number(e.target.value))}
                      className="w-16 h-9 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                    />
                    <span className="text-sm text-gray-500">months before re-completion required</span>
                  </div>
                  <Button size="sm" loading={saving} onClick={saveFormHeader}>
                    <Save className="h-3.5 w-3.5" /> Save settings
                  </Button>
                </div>
              </Card>

              {/* Field list */}
              <Card padding="md">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Fields ({sortedFields.length})</h2>

                {fieldsLoading ? (
                  <div className="py-6 flex justify-center"><div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-gray-600 rounded-full" /></div>
                ) : sortedFields.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No fields yet — add one below.</p>
                ) : (
                  <ol className="space-y-2 mb-4">
                    {sortedFields.map((field, idx) => {
                      const meta = fieldTypeMeta(field.field_type)
                      const isEditing = editingField === field.id
                      return (
                        <li key={field.id} className="rounded-lg border border-gray-200 overflow-hidden">
                          {/* Field row */}
                          <div className={`flex items-center gap-2 px-3 py-2.5 ${isEditing ? 'bg-gray-50' : 'bg-white'}`}>
                            {/* Reorder */}
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button onClick={() => moveField(field.id, 'up')} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                                <ChevronUp className="h-3 w-3" />
                              </button>
                              <button onClick={() => moveField(field.id, 'down')} disabled={idx === sortedFields.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                                <ChevronDown className="h-3 w-3" />
                              </button>
                            </div>
                            {/* Type badge */}
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${meta.color}`}>
                              <meta.icon className="h-3 w-3" />
                              {meta.label}
                            </span>
                            {/* Label */}
                            <span className="flex-1 text-sm text-gray-800 truncate">{field.label}</span>
                            {field.required && <span className="text-xs text-gray-400 shrink-0">Required</span>}
                            {/* Actions */}
                            <button onClick={() => isEditing ? setEditingField(null) : openFieldEdit(field)} className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0">
                              {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                            </button>
                            <button onClick={() => deleteField(field.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Inline editor */}
                          {isEditing && (
                            <div className="border-t border-gray-200 bg-gray-50 px-3 py-3 space-y-3">
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">
                                  {field.field_type === 'heading' ? 'Heading text' : 'Question / label'}
                                </label>
                                {field.field_type === 'checkbox' ? (
                                  <Textarea value={fieldLabel} onChange={e => setFieldLabel(e.target.value)} rows={2} />
                                ) : (
                                  <Input value={fieldLabel} onChange={e => setFieldLabel(e.target.value)} />
                                )}
                              </div>

                              {field.field_type !== 'heading' && (
                                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                                  <input type="checkbox" checked={fieldRequired} onChange={e => setFieldRequired(e.target.checked)} className="rounded" />
                                  Required
                                </label>
                              )}

                              {field.field_type === 'yes_no' && (
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                                    <input type="checkbox" checked={fieldFollowUp} onChange={e => setFieldFollowUp(e.target.checked)} className="rounded" />
                                    If answered Yes, show a follow-up text field
                                  </label>
                                  {fieldFollowUp && (
                                    <Input
                                      label="Follow-up prompt"
                                      value={fieldFollowUpLabel}
                                      onChange={e => setFieldFollowUpLabel(e.target.value)}
                                      placeholder="Please provide further details"
                                    />
                                  )}
                                </div>
                              )}

                              {field.field_type === 'checkbox' && (
                                <Input
                                  label="Sub-text below checkbox (optional)"
                                  value={fieldDescription}
                                  onChange={e => setFieldDescription(e.target.value)}
                                  placeholder="e.g. All information is treated as confidential"
                                />
                              )}

                              <Button size="sm" onClick={() => saveField(field.id)}>
                                <Save className="h-3.5 w-3.5" /> Save field
                              </Button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                )}

                {/* Add field */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Add field</p>
                  <div className="flex flex-wrap gap-2">
                    {FIELD_TYPES.map(ft => (
                      <button
                        key={ft.type}
                        onClick={() => addField(ft.type)}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-transparent font-medium transition-colors hover:border-gray-300 ${ft.color}`}
                      >
                        <ft.icon className="h-3.5 w-3.5" />
                        {ft.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* New form modal */}
      <Modal open={newFormOpen} onClose={() => setNewFormOpen(false)} title="New Health Form" size="sm">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Service</label>
            <select
              value={newServiceId}
              onChange={e => setNewServiceId(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-(--color-primary)"
            >
              <option value="">Select a service…</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Input
            label="Form title"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Health Questionnaire"
          />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setNewFormOpen(false)}>Cancel</Button>
            <Button fullWidth loading={creating} disabled={!newServiceId || !newTitle.trim()} onClick={createForm}>
              Create Form
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
