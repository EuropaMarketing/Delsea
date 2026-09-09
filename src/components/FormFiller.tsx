import { useEffect, useState } from 'react'
import { format, parseISO, addMonths } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

export type FormField = {
  id: string
  form_id: string
  section_id: string
  field_type: 'heading' | 'yes_no' | 'text' | 'textarea' | 'checkbox' | 'emergency_contact' | 'dropdown' | 'multi_select' | 'signature'
  label: string
  required: boolean
  position: number
  options: { follow_up_label?: string; description?: string; choices?: string[] }
}

export type Section = {
  id: string
  form_id: string
  title: string
  position: number
}

export type ResponseMap = Record<string, string | boolean | string[] | { ec_name?: string; ec_phone?: string; ec_relationship?: string } | { signature_name?: string; signed_at?: string }>

// ─── Shared field renderer used by the form builder's preview, the admin
// "fill on behalf of" flow, and (in spirit) the customer-facing form page ────
export function FieldRenderer({
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

  if (field.field_type === 'signature') {
    const sig = (val as { signature_name?: string; signed_at?: string }) ?? {}
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">
          {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
        </p>
        <input
          type="text"
          value={sig.signature_name ?? ''}
          onChange={e => onChange(field.id, { ...sig, signature_name: e.target.value })}
          onBlur={() => { if (sig.signature_name?.trim()) onChange(field.id, { ...sig, signed_at: new Date().toISOString() }) }}
          placeholder="Type your full name to sign"
          className={`w-full h-11 px-3 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) ${hasError ? 'border-red-300' : 'border-gray-200'}`}
        />
        {sig.signature_name && (
          <div className="border-b-2 border-gray-300 pt-1 pb-2 px-1">
            <p className="text-3xl leading-tight text-gray-800" style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive" }}>
              {sig.signature_name}
            </p>
          </div>
        )}
        {sig.signed_at && (
          <p className="text-xs text-gray-400">Signed {format(parseISO(sig.signed_at), "d MMM yyyy 'at' HH:mm")}</p>
        )}
        {hasError && <p className="text-xs text-red-500">A signature is required</p>}
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

  if (field.field_type === 'dropdown') {
    const choices = field.options?.choices ?? []
    return (
      <div>
        <label className="text-sm font-medium text-gray-800 block mb-2">
          {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <select value={(val as string) ?? ''} onChange={e => onChange(field.id, e.target.value)}
          className={`w-full h-10 px-3 text-sm border rounded-lg bg-white outline-none focus:ring-2 focus:ring-(--color-primary) ${hasError ? 'border-red-300' : 'border-gray-200'}`}>
          <option value="">Select…</option>
          {choices.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {hasError && <p className="text-xs text-red-500 mt-1">This field is required</p>}
      </div>
    )
  }

  if (field.field_type === 'multi_select') {
    const choices = field.options?.choices ?? []
    const selected = Array.isArray(val) ? val : []
    function toggle(choice: string) {
      const next = selected.includes(choice) ? selected.filter(c => c !== choice) : [...selected, choice]
      onChange(field.id, next)
    }
    return (
      <div>
        <p className="text-sm font-medium text-gray-800 mb-2">
          {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
        </p>
        <div className="space-y-1.5">
          {choices.map(c => (
            <label key={c} className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)}
                className="h-4 w-4 rounded border-gray-300 accent-(--color-primary) shrink-0" />
              <span className="text-sm text-gray-800">{c}</span>
            </label>
          ))}
        </div>
        {hasError && <p className="text-xs text-red-500 mt-1">Select at least one option</p>}
      </div>
    )
  }

  return null
}

export function validateFormFields(fields: FormField[], responses: ResponseMap): Set<string> {
  const errs = new Set<string>()
  for (const field of fields) {
    if (!field.required || field.field_type === 'heading') continue
    const val = responses[field.id]
    if (field.field_type === 'yes_no') {
      if (val !== 'yes' && val !== 'no') errs.add(field.id)
    } else if (field.field_type === 'checkbox') {
      if (!val) errs.add(field.id)
    } else if (field.field_type === 'emergency_contact') {
      const ec = val as { ec_name?: string; ec_phone?: string } | undefined
      if (!ec?.ec_name?.trim() || !ec?.ec_phone?.trim()) errs.add(field.id)
    } else if (field.field_type === 'multi_select') {
      if (!Array.isArray(val) || val.length === 0) errs.add(field.id)
    } else if (field.field_type === 'signature') {
      const sig = val as { signature_name?: string } | undefined
      if (!sig?.signature_name?.trim()) errs.add(field.id)
    } else {
      if (!String(val ?? '').trim()) errs.add(field.id)
    }
  }
  return errs
}

// ─── Admin "fill this form on the customer's behalf" modal ─────────────────
// Saves a real form_responses row tied to this booking, exactly as if the
// customer had submitted it themselves — clears the same "form required" alert.
export function AdminFormFiller({
  open,
  onClose,
  formId,
  formTitle,
  businessId,
  customerId,
  customerName,
  bookingId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  formId: string
  formTitle: string
  businessId: string
  customerId: string
  customerName: string
  bookingId: string
  onSaved: () => void
}) {
  const [sections, setSections] = useState<Section[]>([])
  const [fields, setFields] = useState<FormField[]>([])
  const [validityMonths, setValidityMonths] = useState(6)
  const [loading, setLoading] = useState(true)
  const [responses, setResponses] = useState<ResponseMap>({})
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setResponses({})
    setErrors(new Set())
    setError('')
    async function load() {
      const [formRes, secRes, fieldRes] = await Promise.all([
        supabase.from('service_forms').select('validity_months').eq('id', formId).single(),
        supabase.from('form_sections').select('*').eq('form_id', formId).order('position'),
        supabase.from('form_fields').select('*').eq('form_id', formId).order('position'),
      ])
      if (formRes.data) setValidityMonths(formRes.data.validity_months)
      setSections((secRes.data ?? []) as Section[])
      setFields((fieldRes.data ?? []) as FormField[])
      setLoading(false)
    }
    load()
  }, [open, formId])

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

  async function handleSave() {
    const errs = validateFormFields(fields, responses)
    if (errs.size) { setErrors(errs); return }
    setSaving(true)
    setError('')
    const completedAt = new Date()
    const expiresAt = addMonths(completedAt, validityMonths)
    const { error: insertError } = await supabase.from('form_responses').insert({
      business_id: businessId,
      customer_id: customerId,
      form_id: formId,
      booking_id: bookingId,
      responses,
      completed_at: completedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    setSaving(false)
    if (insertError) { setError(insertError.message); return }
    onSaved()
  }

  const sortedSections = [...sections].sort((a, b) => a.position - b.position)

  return (
    <Modal open={open} onClose={onClose} title={`Fill Out: ${formTitle}`} size="lg">
      <div className="space-y-5">
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          You're completing this on behalf of <span className="font-medium">{customerName}</span>, for this appointment only.
        </p>
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
        ) : (
          <>
            {sortedSections.map(section => {
              const sectionFields = fields.filter(f => f.section_id === section.id).sort((a, b) => a.position - b.position)
              if (!sectionFields.length) return null
              return (
                <div key={section.id} className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-1.5">{section.title}</h3>
                  {sectionFields.map(f => (
                    <FieldRenderer key={f.id} field={f} responses={responses} errors={errors} onChange={onChange} onEcChange={onEcChange} />
                  ))}
                </div>
              )
            })}
            {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button loading={saving} onClick={handleSave}>Save Form</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
