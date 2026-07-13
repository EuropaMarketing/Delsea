import { useEffect, useState } from 'react'
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, ClipboardList,
  ToggleRight, Type, AlignLeft, CheckSquare, Phone, Heading1, X, Save, Eye, EyeOff,
  ChevronRight, ChevronLeft, CheckCircle2,
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

type Section = {
  id: string
  form_id: string
  title: string
  position: number
}

type FormField = {
  id: string
  form_id: string
  section_id: string
  field_type: 'heading' | 'yes_no' | 'text' | 'textarea' | 'checkbox' | 'emergency_contact'
  label: string
  required: boolean
  position: number
  options: { follow_up_label?: string; description?: string }
}

type Service = { id: string; name: string }
type ResponseMap = Record<string, string | boolean | { ec_name?: string; ec_phone?: string; ec_relationship?: string }>

const FIELD_TYPES: { type: FormField['field_type']; label: string; icon: typeof Type; color: string }[] = [
  { type: 'heading',           label: 'Sub-heading',       icon: Heading1,    color: 'text-gray-500 bg-gray-100' },
  { type: 'yes_no',            label: 'Yes / No',          icon: ToggleRight, color: 'text-blue-600 bg-blue-50' },
  { type: 'text',              label: 'Short Text',        icon: Type,        color: 'text-violet-600 bg-violet-50' },
  { type: 'textarea',          label: 'Long Text',         icon: AlignLeft,   color: 'text-orange-600 bg-orange-50' },
  { type: 'checkbox',          label: 'Acknowledgement',   icon: CheckSquare, color: 'text-green-600 bg-green-50' },
  { type: 'emergency_contact', label: 'Emergency Contact', icon: Phone,       color: 'text-red-600 bg-red-50' },
]

function fieldMeta(type: FormField['field_type']) {
  return FIELD_TYPES.find(f => f.type === type) ?? FIELD_TYPES[0]
}

// ─── Shared field renderer used by both editor preview and customer page ───────
function FieldRenderer({
  field,
  responses,
  errors,
  onChange,
  onEcChange,
}: {
  field: FormField
  responses: ResponseMap
  errors: Set<string>
  onChange: (id: string, val: ResponseMap[string]) => void
  onEcChange: (id: string, key: 'ec_name' | 'ec_phone' | 'ec_relationship', val: string) => void
}) {
  const val = responses[field.id]
  const hasError = errors.has(field.id)

  if (field.field_type === 'heading') {
    return <h3 className="font-semibold text-gray-800 text-base pt-2 border-b border-gray-100 pb-2">{field.label}</h3>
  }

  if (field.field_type === 'yes_no') {
    return (
      <div className="space-y-2.5">
        <p className="text-sm font-medium text-gray-800">
          {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
        </p>
        <div className="flex gap-3">
          {(['yes', 'no'] as const).map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(field.id, opt)}
              className={`w-28 h-11 rounded-xl border-2 text-sm font-semibold transition-all ${
                val === opt
                  ? 'border-(--color-primary) bg-(--color-primary) text-white'
                  : 'border-gray-200 text-gray-700 hover:border-gray-400 bg-white'
              }`}
            >
              {opt === 'yes' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
        {hasError && <p className="text-xs text-red-500">Please select Yes or No</p>}
        {val === 'yes' && field.options?.follow_up_label && (
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">{field.options.follow_up_label}</label>
            <textarea
              rows={2}
              value={(responses[`${field.id}_followup`] as string) ?? ''}
              onChange={e => onChange(`${field.id}_followup`, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none resize-none focus:ring-2 focus:ring-(--color-primary)"
            />
          </div>
        )}
      </div>
    )
  }

  if (field.field_type === 'checkbox') {
    return (
      <div className="space-y-1.5">
        <label className="flex gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!val}
            onChange={e => onChange(field.id, e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-(--color-primary) shrink-0"
          />
          <span className="text-sm text-gray-800">
            {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
          </span>
        </label>
        {field.options?.description && (
          <p className="text-xs text-gray-400 ml-7">{field.options.description}</p>
        )}
        {hasError && <p className="text-xs text-red-500 ml-7">This acknowledgement is required</p>}
      </div>
    )
  }

  if (field.field_type === 'emergency_contact') {
    const ec = (val as { ec_name?: string; ec_phone?: string; ec_relationship?: string }) ?? {}
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-800">
          {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Full name</label>
            <input type="text" value={ec.ec_name ?? ''} onChange={e => onEcChange(field.id, 'ec_name', e.target.value)}
              placeholder="Jane Smith"
              className={`w-full h-10 px-3 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) ${hasError && !ec.ec_name ? 'border-red-300' : 'border-gray-200'}`} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Phone number</label>
            <input type="tel" value={ec.ec_phone ?? ''} onChange={e => onEcChange(field.id, 'ec_phone', e.target.value)}
              placeholder="07700 900000"
              className={`w-full h-10 px-3 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) ${hasError && !ec.ec_phone ? 'border-red-300' : 'border-gray-200'}`} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Relationship</label>
            <input type="text" value={ec.ec_relationship ?? ''} onChange={e => onEcChange(field.id, 'ec_relationship', e.target.value)}
              placeholder="e.g. Partner, Parent, Friend"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)" />
          </div>
        </div>
        {hasError && <p className="text-xs text-red-500">Name and phone number are required</p>}
      </div>
    )
  }

  if (field.field_type === 'text') {
    return (
      <div>
        <label className="text-sm font-medium text-gray-800 block mb-2">
          {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <input type="text" value={(val as string) ?? ''} onChange={e => onChange(field.id, e.target.value)}
          className={`w-full h-10 px-3 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) ${hasError ? 'border-red-300' : 'border-gray-200'}`} />
        {hasError && <p className="text-xs text-red-500 mt-1">This field is required</p>}
      </div>
    )
  }

  if (field.field_type === 'textarea') {
    return (
      <div>
        <label className="text-sm font-medium text-gray-800 block mb-2">
          {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <textarea rows={3} value={(val as string) ?? ''} onChange={e => onChange(field.id, e.target.value)}
          className={`w-full px-3 py-2 text-sm border rounded-lg outline-none resize-none focus:ring-2 focus:ring-(--color-primary) ${hasError ? 'border-red-300' : 'border-gray-200'}`} />
        {hasError && <p className="text-xs text-red-500 mt-1">This field is required</p>}
      </div>
    )
  }

  return null
}

// ─── Preview modal ─────────────────────────────────────────────────────────────
function PreviewModal({ form, sections, fields, onClose }: {
  form: ServiceForm; sections: Section[]; fields: FormField[]; onClose: () => void
}) {
  const [step, setStep] = useState(0)
  const [responses, setResponses] = useState<ResponseMap>({})
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const [done, setDone] = useState(false)

  const sorted = [...sections].sort((a, b) => a.position - b.position)
  const current = sorted[step]
  const currentFields = fields.filter(f => f.section_id === current?.id).sort((a, b) => a.position - b.position)
  const isLast = step === sorted.length - 1

  function onChange(id: string, val: ResponseMap[string]) {
    setResponses(p => ({ ...p, [id]: val }))
    setErrors(p => { const s = new Set(p); s.delete(id); return s })
  }
  function onEcChange(id: string, key: 'ec_name' | 'ec_phone' | 'ec_relationship', val: string) {
    setResponses(p => {
      const ec = (p[id] as Record<string, string>) ?? {}
      return { ...p, [id]: { ...ec, [key]: val } }
    })
    setErrors(p => { const s = new Set(p); s.delete(id); return s })
  }

  function next() { if (isLast) setDone(true); else { setStep(s => s + 1); setErrors(new Set()) } }
  function prev() { setStep(s => s - 1); setErrors(new Set()) }

  return (
    <Modal open onClose={onClose} title={`Preview: ${form.title}`} size="md">
      {done ? (
        <div className="text-center py-8">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <p className="font-semibold text-gray-900 mb-1">Preview complete</p>
          <p className="text-sm text-gray-500 mb-6">This is what customers see after submitting.</p>
          <Button variant="secondary" onClick={() => { setDone(false); setStep(0); setResponses({}) }}>
            Restart preview
          </Button>
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Add sections and fields to preview the form.</p>
      ) : (
        <div>
          {/* Progress */}
          <div className="mb-5">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span className="font-medium">{current?.title}</span>
              <span>Step {step + 1} of {sorted.length}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${((step + 1) / sorted.length) * 100}%`, backgroundColor: 'var(--color-primary)' }}
              />
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-5 min-h-32">
            {currentFields.length === 0
              ? <p className="text-sm text-gray-400 text-center py-8">No fields in this section yet.</p>
              : currentFields.map(f => (
                <FieldRenderer key={f.id} field={f} responses={responses} errors={errors}
                  onChange={onChange} onEcChange={onEcChange} />
              ))
            }
          </div>

          {/* Navigation */}
          <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
            {step > 0 && (
              <Button variant="secondary" onClick={prev} className="shrink-0">
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
            )}
            <Button fullWidth onClick={next}>
              {isLast ? 'Submit' : <>Next <ChevronRight className="h-4 w-4" /></>}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function AdminForms() {
  const [forms, setForms] = useState<ServiceForm[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [selectedForm, setSelectedForm] = useState<ServiceForm | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [fields, setFields] = useState<FormField[]>([])
  const [editingField, setEditingField] = useState<string | null>(null)
  const [addingToSection, setAddingToSection] = useState<string | null>(null)
  const [renamingSection, setRenamingSection] = useState<string | null>(null)
  const [renamingTitle, setRenamingTitle] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form header
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editValidity, setEditValidity] = useState(6)

  // Field inline editor
  const [fieldLabel, setFieldLabel] = useState('')
  const [fieldRequired, setFieldRequired] = useState(false)
  const [fieldFollowUp, setFieldFollowUp] = useState(false)
  const [fieldFollowUpLabel, setFieldFollowUpLabel] = useState('Please provide further details')
  const [fieldDescription, setFieldDescription] = useState('')

  // New form
  const [newFormOpen, setNewFormOpen] = useState(false)
  const [newServiceId, setNewServiceId] = useState('')
  const [newTitle, setNewTitle] = useState('Health Questionnaire')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    async function load() {
      const [fr, sr] = await Promise.all([
        supabase.from('service_forms').select('*, service:services(name)').eq('business_id', BUSINESS_ID).order('created_at'),
        supabase.from('services').select('id, name').eq('business_id', BUSINESS_ID).eq('is_active', true).order('name'),
      ])
      if (fr.data) setForms(fr.data as ServiceForm[])
      if (sr.data) setServices(sr.data as Service[])
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
    setAddingToSection(null)
    setRenamingSection(null)

    const [secRes, fieldRes] = await Promise.all([
      supabase.from('form_sections').select('*').eq('form_id', form.id).order('position'),
      supabase.from('form_fields').select('*').eq('form_id', form.id).order('position'),
    ])
    setSections((secRes.data ?? []) as Section[])
    setFields((fieldRes.data ?? []) as FormField[])
  }

  async function createForm() {
    if (!newServiceId || !newTitle.trim()) return
    setCreating(true)
    const { data } = await supabase
      .from('service_forms')
      .insert({ business_id: BUSINESS_ID, service_id: newServiceId, title: newTitle.trim(), validity_months: 6 })
      .select('*, service:services(name)').single()
    if (data) {
      const form = data as ServiceForm
      setForms(p => [...p, form])
      setNewFormOpen(false)
      setNewServiceId('')
      setNewTitle('Health Questionnaire')
      await openForm(form)
    }
    setCreating(false)
  }

  async function saveFormHeader() {
    if (!selectedForm) return
    setSaving(true)
    const u = { title: editTitle.trim(), description: editDesc.trim() || null, validity_months: editValidity, updated_at: new Date().toISOString() }
    await supabase.from('service_forms').update(u).eq('id', selectedForm.id)
    const updated = { ...selectedForm, ...u }
    setSelectedForm(updated)
    setForms(p => p.map(f => f.id === selectedForm.id ? { ...f, ...u } : f))
    setSaving(false)
  }

  async function toggleActive(form: ServiceForm) {
    const is_active = !form.is_active
    await supabase.from('service_forms').update({ is_active }).eq('id', form.id)
    setForms(p => p.map(f => f.id === form.id ? { ...f, is_active } : f))
    if (selectedForm?.id === form.id) setSelectedForm(p => p ? { ...p, is_active } : p)
  }

  async function deleteForm(id: string) {
    if (!confirm('Delete this form and all its sections and fields?')) return
    await supabase.from('service_forms').delete().eq('id', id)
    setForms(p => p.filter(f => f.id !== id))
    if (selectedForm?.id === id) { setSelectedForm(null); setSections([]); setFields([]) }
  }

  // ── Sections ──
  async function addSection() {
    if (!selectedForm) return
    const pos = sections.length > 0 ? Math.max(...sections.map(s => s.position)) + 1 : 0
    const { data } = await supabase
      .from('form_sections')
      .insert({ form_id: selectedForm.id, title: 'New Section', position: pos })
      .select().single()
    if (data) setSections(p => [...p, data as Section])
  }

  async function saveSection(id: string) {
    if (!renamingTitle.trim()) return
    await supabase.from('form_sections').update({ title: renamingTitle.trim() }).eq('id', id)
    setSections(p => p.map(s => s.id === id ? { ...s, title: renamingTitle.trim() } : s))
    setRenamingSection(null)
  }

  async function deleteSection(id: string) {
    if (!confirm('Delete this section and all its fields?')) return
    await supabase.from('form_sections').delete().eq('id', id)
    setSections(p => p.filter(s => s.id !== id))
    setFields(p => p.filter(f => f.section_id !== id))
    if (editingField && fields.find(f => f.id === editingField)?.section_id === id) setEditingField(null)
  }

  async function moveSection(id: string, dir: 'up' | 'down') {
    const sorted = [...sections].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex(s => s.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const [a, b] = [sorted[idx], sorted[swapIdx]]
    await Promise.all([
      supabase.from('form_sections').update({ position: b.position }).eq('id', a.id),
      supabase.from('form_sections').update({ position: a.position }).eq('id', b.id),
    ])
    setSections(p => p.map(s => s.id === a.id ? { ...s, position: b.position } : s.id === b.id ? { ...s, position: a.position } : s))
  }

  // ── Fields ──
  async function addField(sectionId: string, type: FormField['field_type']) {
    if (!selectedForm) return
    const sectionFields = fields.filter(f => f.section_id === sectionId)
    const pos = sectionFields.length > 0 ? Math.max(...sectionFields.map(f => f.position)) + 1 : 0
    const defaultLabel =
      type === 'heading' ? 'Sub-heading' :
      type === 'yes_no'  ? 'New question?' :
      type === 'text'    ? 'Your answer' :
      type === 'textarea' ? 'Additional information' :
      type === 'checkbox' ? 'I confirm that I have read and understood the above' :
      'Emergency Contact'
    const { data } = await supabase
      .from('form_fields')
      .insert({ form_id: selectedForm.id, section_id: sectionId, field_type: type, label: defaultLabel, required: type !== 'heading', position: pos, options: {} })
      .select().single()
    if (data) {
      const f = data as FormField
      setFields(p => [...p, f])
      setAddingToSection(null)
      openFieldEditor(f)
    }
  }

  function openFieldEditor(field: FormField) {
    setEditingField(field.id)
    setFieldLabel(field.label)
    setFieldRequired(field.required)
    setFieldFollowUp(!!field.options?.follow_up_label)
    setFieldFollowUpLabel(field.options?.follow_up_label ?? 'Please provide further details')
    setFieldDescription(field.options?.description ?? '')
  }

  async function saveField(id: string) {
    const field = fields.find(f => f.id === id)
    if (!field) return
    const options: FormField['options'] = {}
    if (field.field_type === 'yes_no' && fieldFollowUp) options.follow_up_label = fieldFollowUpLabel
    if (field.field_type === 'checkbox' && fieldDescription) options.description = fieldDescription
    const u = { label: fieldLabel.trim() || field.label, required: fieldRequired, options }
    await supabase.from('form_fields').update(u).eq('id', id)
    setFields(p => p.map(f => f.id === id ? { ...f, ...u } : f))
    setEditingField(null)
  }

  async function deleteField(id: string) {
    await supabase.from('form_fields').delete().eq('id', id)
    setFields(p => p.filter(f => f.id !== id))
    if (editingField === id) setEditingField(null)
  }

  async function moveField(id: string, dir: 'up' | 'down') {
    const field = fields.find(f => f.id === id)!
    const inSection = fields.filter(f => f.section_id === field.section_id).sort((a, b) => a.position - b.position)
    const idx = inSection.findIndex(f => f.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= inSection.length) return
    const [a, b] = [inSection[idx], inSection[swapIdx]]
    await Promise.all([
      supabase.from('form_fields').update({ position: b.position }).eq('id', a.id),
      supabase.from('form_fields').update({ position: a.position }).eq('id', b.id),
    ])
    setFields(p => p.map(f => f.id === a.id ? { ...f, position: b.position } : f.id === b.id ? { ...f, position: a.position } : f))
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-gray-600 rounded-full" /></div>

  const sortedSections = [...sections].sort((a, b) => a.position - b.position)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Health Forms</h1>
          <p className="text-sm text-gray-500 mt-0.5">Build consent and screening forms per service.</p>
        </div>
        <Button onClick={() => setNewFormOpen(true)}><Plus className="h-4 w-4" /> New Form</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form list */}
        <div className="lg:col-span-2 space-y-2">
          {forms.length === 0 && (
            <Card padding="md" className="text-center py-12">
              <ClipboardList className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No forms yet.</p>
            </Card>
          )}
          {forms.map(form => (
            <button key={form.id} onClick={() => openForm(form)}
              className={`w-full text-left rounded-xl border px-4 py-3 flex items-start justify-between gap-3 transition-colors ${
                selectedForm?.id === form.id ? 'border-(--color-primary) bg-(--color-primary)/5' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{form.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{form.service?.name ?? 'All services'}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${form.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {form.is_active ? 'Active' : 'Inactive'}
              </span>
            </button>
          ))}
        </div>

        {/* Form editor */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedForm ? (
            <Card padding="md" className="text-center py-16 text-gray-400 text-sm">Select a form to edit</Card>
          ) : (
            <>
              {/* Settings card */}
              <Card padding="md">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-700">Form Settings</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPreviewOpen(true)}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </button>
                    <button onClick={() => toggleActive(selectedForm)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                        selectedForm.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>
                      {selectedForm.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {selectedForm.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button onClick={() => deleteForm(selectedForm.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <Input label="Form title" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                  <Textarea label="Intro text (optional)" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} />
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700 shrink-0">Valid for</label>
                    <input type="number" min={1} max={24} value={editValidity} onChange={e => setEditValidity(Number(e.target.value))}
                      className="w-16 h-9 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)" />
                    <span className="text-sm text-gray-500">months</span>
                  </div>
                  <Button size="sm" loading={saving} onClick={saveFormHeader}>
                    <Save className="h-3.5 w-3.5" /> Save settings
                  </Button>
                </div>
              </Card>

              {/* Sections */}
              {sortedSections.map((section, secIdx) => {
                const sectionFields = fields.filter(f => f.section_id === section.id).sort((a, b) => a.position - b.position)
                return (
                  <Card key={section.id} padding="md">
                    {/* Section header */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button onClick={() => moveSection(section.id, 'up')} disabled={secIdx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => moveSection(section.id, 'down')} disabled={secIdx === sortedSections.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>

                      {renamingSection === section.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            autoFocus
                            value={renamingTitle}
                            onChange={e => setRenamingTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveSection(section.id); if (e.key === 'Escape') setRenamingSection(null) }}
                            className="flex-1 h-8 px-2 text-sm font-semibold border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                          />
                          <button onClick={() => saveSection(section.id)} className="p-1.5 rounded text-green-600 hover:bg-green-50"><Save className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setRenamingSection(null)} className="p-1.5 rounded text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 text-sm truncate">{section.title}</p>
                            <p className="text-xs text-gray-400">{sectionFields.length} field{sectionFields.length !== 1 ? 's' : ''} · Step {secIdx + 1} of {sortedSections.length}</p>
                          </div>
                          <button onClick={() => { setRenamingSection(section.id); setRenamingTitle(section.title) }}
                            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deleteSection(section.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Fields */}
                    {sectionFields.length === 0 && (
                      <p className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg mb-3">No fields yet</p>
                    )}
                    {sectionFields.length > 0 && (
                      <ol className="space-y-1.5 mb-3">
                        {sectionFields.map((field, fIdx) => {
                          const meta = fieldMeta(field.field_type)
                          const isEditing = editingField === field.id
                          return (
                            <li key={field.id} className="rounded-lg border border-gray-200 overflow-hidden">
                              <div className={`flex items-center gap-2 px-3 py-2 ${isEditing ? 'bg-gray-50' : 'bg-white'}`}>
                                <div className="flex flex-col gap-0.5 shrink-0">
                                  <button onClick={() => moveField(field.id, 'up')} disabled={fIdx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                                    <ChevronUp className="h-3 w-3" />
                                  </button>
                                  <button onClick={() => moveField(field.id, 'down')} disabled={fIdx === sectionFields.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </div>
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${meta.color}`}>
                                  <meta.icon className="h-3 w-3" />{meta.label}
                                </span>
                                <span className="flex-1 text-sm text-gray-800 truncate">{field.label}</span>
                                {field.required && <span className="text-xs text-gray-400 shrink-0">Req.</span>}
                                <button onClick={() => isEditing ? setEditingField(null) : openFieldEditor(field)}
                                  className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0">
                                  {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                                </button>
                                <button onClick={() => deleteField(field.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {isEditing && (
                                <div className="border-t border-gray-200 bg-gray-50 px-3 py-3 space-y-3">
                                  <div>
                                    <label className="text-xs font-medium text-gray-600 block mb-1">
                                      {field.field_type === 'heading' ? 'Heading text' : 'Question / label'}
                                    </label>
                                    {field.field_type === 'checkbox'
                                      ? <Textarea value={fieldLabel} onChange={e => setFieldLabel(e.target.value)} rows={2} />
                                      : <Input value={fieldLabel} onChange={e => setFieldLabel(e.target.value)} />}
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
                                        <Input label="Follow-up prompt" value={fieldFollowUpLabel} onChange={e => setFieldFollowUpLabel(e.target.value)} />
                                      )}
                                    </div>
                                  )}
                                  {field.field_type === 'checkbox' && (
                                    <Input label="Sub-text below checkbox (optional)" value={fieldDescription} onChange={e => setFieldDescription(e.target.value)} />
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

                    {/* Add field to this section */}
                    {addingToSection === section.id ? (
                      <div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {FIELD_TYPES.map(ft => (
                            <button key={ft.type} onClick={() => addField(section.id, ft.type)}
                              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-transparent font-medium transition-colors hover:border-gray-300 ${ft.color}`}>
                              <ft.icon className="h-3.5 w-3.5" />{ft.label}
                            </button>
                          ))}
                        </div>
                        <button onClick={() => setAddingToSection(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingToSection(section.id)}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Add field
                      </button>
                    )}
                  </Card>
                )
              })}

              {/* Add section */}
              <button onClick={addSection}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" /> Add section
              </button>
            </>
          )}
        </div>
      </div>

      {/* New form modal */}
      <Modal open={newFormOpen} onClose={() => setNewFormOpen(false)} title="New Health Form" size="sm">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Service</label>
            <select value={newServiceId} onChange={e => setNewServiceId(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-(--color-primary)">
              <option value="">Select a service…</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Input label="Form title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Health Questionnaire" />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setNewFormOpen(false)}>Cancel</Button>
            <Button fullWidth loading={creating} disabled={!newServiceId || !newTitle.trim()} onClick={createForm}>Create Form</Button>
          </div>
        </div>
      </Modal>

      {/* Preview modal */}
      {previewOpen && selectedForm && (
        <PreviewModal form={selectedForm} sections={sections} fields={fields} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  )
}
