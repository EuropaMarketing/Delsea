import { supabase } from './supabase'

export type BookingFormStatus = {
  needsForm: boolean
  formTitle: string | null
}

/** Targeted check for a single booking's detail panel. */
export async function checkBookingForm(
  serviceId: string,
  customerId: string,
): Promise<BookingFormStatus> {
  const { data: form } = await supabase
    .from('service_forms')
    .select('id, title')
    .eq('service_id', serviceId)
    .eq('is_active', true)
    .maybeSingle()

  if (!form) return { needsForm: false, formTitle: null }

  const { data: response } = await supabase
    .from('form_responses')
    .select('id')
    .eq('customer_id', customerId)
    .eq('form_id', form.id)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  return { needsForm: !response, formTitle: form.title }
}

/** Batch check for list views — returns booking IDs that need a form but haven't completed one. */
export async function loadFormAlertSet(
  businessId: string,
  bookings: Array<{ id: string; service_id: string; customer_id: string }>,
): Promise<Set<string>> {
  if (!bookings.length) return new Set()

  const { data: forms } = await supabase
    .from('service_forms')
    .select('service_id, id')
    .eq('business_id', businessId)
    .eq('is_active', true)

  if (!forms?.length) return new Set()

  const formByService = new Map(forms.map(f => [f.service_id as string, f.id as string]))
  const needsForm = bookings.filter(b => b.service_id && formByService.has(b.service_id))
  if (!needsForm.length) return new Set()

  const customerIds = [...new Set(needsForm.map(b => b.customer_id))]
  const formIds = [...new Set(needsForm.map(b => formByService.get(b.service_id)!))]

  const { data: responses } = await supabase
    .from('form_responses')
    .select('customer_id, form_id')
    .in('customer_id', customerIds)
    .in('form_id', formIds)
    .gt('expires_at', new Date().toISOString())

  const done = new Set((responses ?? []).map(r => `${r.customer_id}:${r.form_id}`))

  const alerts = new Set<string>()
  for (const b of needsForm) {
    const formId = formByService.get(b.service_id)!
    if (!done.has(`${b.customer_id}:${formId}`)) alerts.add(b.id)
  }
  return alerts
}
