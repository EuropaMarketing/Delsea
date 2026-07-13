import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { format, addMonths, parseISO } from 'date-fns'
import { CheckCircle2, ClipboardList, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'

type ServiceForm = {
  id: string
  title: string
  description: string | null
  validity_months: number
}

type FormField = {
  id: string
  field_type: 'heading' | 'yes_no' | 'text' | 'textarea' | 'checkbox' | 'emergency_contact'
  label: string
  required: boolean
  position: number
  options: { follow_up_label?: string; description?: string }
}

type ResponseMap = Record<string, string | boolean | { ec_name?: string; ec_phone?: string; ec_relationship?: string }>

export default function FormPage() {
  const { formId } = useParams<{ formId: string }>()
  const [searchParams] = useSearchParams()
  const bookingId = searchParams.get('bookingId')
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [form, setForm] = useState<ServiceForm | null>(null)
  const [fields, setFields] = useState<FormField[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [alreadyValid, setAlreadyValid] = useState<string | null>(null) // expiry date string
  const [loading, setLoading] = useState(true)
  const [responses, setResponses] = useState<ResponseMap>({})
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!formId || !user) return
    const userId = user.id
    async function load() {
      const [formRes, fieldsRes, customerRes] = await Promise.all([
        supabase.from('service_forms').select('id, title, description, validity_months').eq('id', formId).single(),
        supabase.from('form_fields').select('*').eq('form_id', formId).order('position'),
        supabase.from('customers').select('id, business_id').eq('user_id', userId).single(),
      ])

      if (!formRes.data || !customerRes.data) { setLoading(false); return }

      setForm(formRes.data as ServiceForm)
      setFields((fieldsRes.data ?? []) as FormField[])
      setCustomerId(customerRes.data.id)
      setBusinessId(customerRes.data.business_id)

      // Check for existing valid response
      const { data: existing } = await supabase
        .from('form_responses')
        .select('expires_at')
        .eq('customer_id', customerRes.data.id)
        .eq('form_id', formId)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
        .single()

      if (existing) setAlreadyValid(existing.expires_at)
      setLoading(false)
    }
    load()
  }, [formId, user])

  function setResponse(fieldId: string, value: ResponseMap[string]) {
    setResponses(prev => ({ ...prev, [fieldId]: value }))
    setErrors(prev => { const s = new Set(prev); s.delete(fieldId); return s })
  }

  function setEcField(fieldId: string, key: 'ec_name' | 'ec_phone' | 'ec_relationship', value: string) {
    setResponses(prev => {
      const ec = (prev[fieldId] as { ec_name?: string; ec_phone?: string; ec_relationship?: string }) ?? {}
      return { ...prev, [fieldId]: { ...ec, [key]: value } }
    })
    setErrors(prev => { const s = new Set(prev); s.delete(fieldId); return s })
  }

  function validate(): boolean {
    const newErrors = new Set<string>()
    for (const field of fields) {
      if (!field.required || field.field_type === 'heading') continue
      const val = responses[field.id]
      if (field.field_type === 'yes_no') {
        if (val !== 'yes' && val !== 'no') newErrors.add(field.id)
      } else if (field.field_type === 'checkbox') {
        if (!val) newErrors.add(field.id)
      } else if (field.field_type === 'emergency_contact') {
        const ec = val as { ec_name?: string; ec_phone?: string } | undefined
        if (!ec?.ec_name?.trim() || !ec?.ec_phone?.trim()) newErrors.add(field.id)
      } else {
        if (!String(val ?? '').trim()) newErrors.add(field.id)
      }
    }
    setErrors(newErrors)
    return newErrors.size === 0
  }

  async function handleSubmit() {
    if (!form || !customerId || !businessId) return
    if (!validate()) return
    setSubmitting(true)
    const completedAt = new Date()
    const expiresAt = addMonths(completedAt, form.validity_months)
    await supabase.from('form_responses').insert({
      business_id: businessId,
      customer_id: customerId,
      form_id: form.id,
      booking_id: bookingId ?? null,
      responses,
      completed_at: completedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    setSubmitted(true)
    setSubmitting(false)
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <p className="text-gray-500 mb-4">Please sign in to complete this form.</p>
        <Button onClick={() => navigate('/my-bookings')}>Go to My Bookings</Button>
      </div>
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-gray-600 rounded-full" /></div>
  }

  if (!form) {
    return (
      <div className="text-center py-20 px-4">
        <p className="text-gray-500">Form not found.</p>
        <button onClick={() => navigate('/my-bookings')} className="mt-4 text-sm text-gray-400 hover:text-gray-600">← Back to My Bookings</button>
      </div>
    )
  }

  if (submitted || alreadyValid) {
    const expiry = submitted
      ? addMonths(new Date(), form.validity_months)
      : parseISO(alreadyValid!)
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {submitted ? 'Form completed!' : 'Already completed'}
        </h2>
        <p className="text-sm text-gray-500 mb-1">
          {submitted ? 'Thank you for completing your health questionnaire.' : 'Your health questionnaire is on file.'}
        </p>
        <p className="text-xs text-gray-400 mb-8">
          Valid until {format(expiry, 'd MMMM yyyy')}
        </p>
        <Button onClick={() => navigate('/my-bookings')}>
          <ArrowLeft className="h-4 w-4" /> Back to My Bookings
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <button onClick={() => navigate('/my-bookings')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6">
        <ArrowLeft className="h-4 w-4" /> My Bookings
      </button>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList className="h-5 w-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">{form.title}</h1>
        </div>
        {form.description && <p className="text-sm text-gray-500 mt-1">{form.description}</p>}
        <p className="text-xs text-gray-400 mt-3">
          Completed responses are valid for {form.validity_months} months. All information is treated as confidential.
        </p>
      </div>

      <div className="space-y-6">
        {fields.map(field => {
          const hasError = errors.has(field.id)
          const val = responses[field.id]

          if (field.field_type === 'heading') {
            return (
              <div key={field.id} className="border-b border-gray-200 pb-2 mt-6">
                <h2 className="font-semibold text-gray-800 text-base">{field.label}</h2>
              </div>
            )
          }

          if (field.field_type === 'yes_no') {
            const answered = val === 'yes' || val === 'no'
            const isYes = val === 'yes'
            return (
              <div key={field.id} className="border-b border-gray-100 pb-5">
                <p className="text-sm font-medium text-gray-800 mb-3">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </p>
                <div className="flex gap-3">
                  {(['yes', 'no'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setResponse(field.id, opt)}
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
                {hasError && <p className="text-xs text-red-500 mt-1.5">Please select Yes or No</p>}
                {isYes && field.options?.follow_up_label && (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-gray-600 block mb-1">{field.options.follow_up_label}</label>
                    <textarea
                      rows={2}
                      value={(responses[`${field.id}_followup`] as string) ?? ''}
                      onChange={e => setResponse(`${field.id}_followup`, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none resize-none focus:ring-2 focus:ring-(--color-primary)"
                    />
                  </div>
                )}
                {answered && !hasError && (
                  <div className="mt-1.5 flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {isYes ? 'Yes' : 'No'}
                  </div>
                )}
              </div>
            )
          }

          if (field.field_type === 'checkbox') {
            return (
              <div key={field.id} className="border-b border-gray-100 pb-5">
                <label className="flex gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!val}
                    onChange={e => setResponse(field.id, e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-(--color-primary) shrink-0"
                  />
                  <span className="text-sm text-gray-800">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</span>
                </label>
                {field.options?.description && (
                  <p className="text-xs text-gray-400 mt-1.5 ml-7">{field.options.description}</p>
                )}
                {hasError && <p className="text-xs text-red-500 mt-1.5">This acknowledgement is required</p>}
              </div>
            )
          }

          if (field.field_type === 'emergency_contact') {
            const ec = (val as { ec_name?: string; ec_phone?: string; ec_relationship?: string }) ?? {}
            return (
              <div key={field.id} className="border-b border-gray-100 pb-5 space-y-3">
                <p className="text-sm font-medium text-gray-800">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Full name</label>
                    <input
                      type="text"
                      value={ec.ec_name ?? ''}
                      onChange={e => setEcField(field.id, 'ec_name', e.target.value)}
                      placeholder="Jane Smith"
                      className={`w-full h-10 px-3 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) ${hasError && !ec.ec_name ? 'border-red-300' : 'border-gray-200'}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Phone number</label>
                    <input
                      type="tel"
                      value={ec.ec_phone ?? ''}
                      onChange={e => setEcField(field.id, 'ec_phone', e.target.value)}
                      placeholder="07700 900000"
                      className={`w-full h-10 px-3 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) ${hasError && !ec.ec_phone ? 'border-red-300' : 'border-gray-200'}`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-gray-600 block mb-1">Relationship</label>
                    <input
                      type="text"
                      value={ec.ec_relationship ?? ''}
                      onChange={e => setEcField(field.id, 'ec_relationship', e.target.value)}
                      placeholder="e.g. Partner, Parent, Friend"
                      className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
                    />
                  </div>
                </div>
                {hasError && <p className="text-xs text-red-500">Name and phone number are required</p>}
              </div>
            )
          }

          if (field.field_type === 'text') {
            return (
              <div key={field.id} className="border-b border-gray-100 pb-5">
                <label className="text-sm font-medium text-gray-800 block mb-2">
                  {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input
                  type="text"
                  value={(val as string) ?? ''}
                  onChange={e => setResponse(field.id, e.target.value)}
                  className={`w-full h-10 px-3 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) ${hasError ? 'border-red-300' : 'border-gray-200'}`}
                />
                {hasError && <p className="text-xs text-red-500 mt-1">This field is required</p>}
              </div>
            )
          }

          if (field.field_type === 'textarea') {
            return (
              <div key={field.id} className="border-b border-gray-100 pb-5">
                <label className="text-sm font-medium text-gray-800 block mb-2">
                  {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <textarea
                  rows={3}
                  value={(val as string) ?? ''}
                  onChange={e => setResponse(field.id, e.target.value)}
                  className={`w-full px-3 py-2 text-sm border rounded-lg outline-none resize-none focus:ring-2 focus:ring-(--color-primary) ${hasError ? 'border-red-300' : 'border-gray-200'}`}
                />
                {hasError && <p className="text-xs text-red-500 mt-1">This field is required</p>}
              </div>
            )
          }

          return null
        })}
      </div>

      {fields.length > 0 && (
        <div className="mt-8">
          <Button fullWidth size="lg" loading={submitting} onClick={handleSubmit}>
            Submit Health Form
          </Button>
          <p className="text-xs text-center text-gray-400 mt-3">
            By submitting this form you confirm all information is accurate and up to date.
          </p>
        </div>
      )}
    </div>
  )
}
