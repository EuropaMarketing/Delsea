import { supabase } from './supabase'

export type BookingFormStatus = {
  needsForm: boolean
  formTitle: string | null
}

type FormRow = { id: string; title: string; is_active: boolean }

/** Targeted check for a single booking's detail panel. Decides between the
 *  service's New Client Form and Returning Client Form (if a valid response to
 *  the New Client Form is already on file, the returning form applies instead),
 *  plus any forms attached directly to this booking. */
export async function checkBookingForm(
  serviceId: string,
  customerId: string,
  bookingId?: string,
): Promise<BookingFormStatus> {
  const [serviceRes, bookingFormsRes] = await Promise.all([
    supabase.from('services').select('form_id, returning_form_id').eq('id', serviceId).maybeSingle(),
    bookingId
      ? supabase.from('booking_forms').select('form:service_forms(id, title)').eq('booking_id', bookingId)
      : Promise.resolve({ data: [] as { form: { id: string; title: string } | null }[] }),
  ])

  const newFormId = serviceRes.data?.form_id ?? null
  const returningFormId = serviceRes.data?.returning_form_id ?? null
  const linkedFormIds = [newFormId, returningFormId].filter((id): id is string => !!id)

  const { data: linkedFormRows } = linkedFormIds.length
    ? await supabase.from('service_forms').select('id, title, is_active').in('id', linkedFormIds)
    : { data: [] as FormRow[] }
  const formById = new Map((linkedFormRows ?? []).map(f => [f.id, f]))
  const newForm = newFormId ? formById.get(newFormId) : undefined
  const returningForm = returningFormId ? formById.get(returningFormId) : undefined

  const forms: { id: string; title: string }[] = []
  if (newForm?.is_active) {
    const { data: newFormResponse } = await supabase
      .from('form_responses')
      .select('id')
      .eq('customer_id', customerId)
      .eq('form_id', newForm.id)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (newFormResponse && returningForm?.is_active) {
      forms.push(returningForm)
    } else {
      forms.push(newForm)
    }
  }

  const bookingFormRows = (bookingFormsRes.data ?? []) as unknown as { form: { id: string; title: string } | null }[]
  for (const row of bookingFormRows) {
    if (row.form && !forms.some(f => f.id === row.form!.id)) forms.push(row.form)
  }

  if (!forms.length) return { needsForm: false, formTitle: null }

  const { data: responses } = await supabase
    .from('form_responses')
    .select('form_id')
    .eq('customer_id', customerId)
    .in('form_id', forms.map(f => f.id))
    .gt('expires_at', new Date().toISOString())

  const doneIds = new Set((responses ?? []).map(r => r.form_id))
  const missing = forms.filter(f => !doneIds.has(f.id))

  return {
    needsForm: missing.length > 0,
    formTitle: missing.length ? missing.map(f => f.title).join(', ') : null,
  }
}

/** Batch check for list views — returns booking IDs that need a form (their
 *  service's New/Returning Client Form, or one attached directly to the booking)
 *  but haven't completed one. Same New-vs-Returning logic as checkBookingForm. */
export async function loadFormAlertSet(
  businessId: string,
  bookings: Array<{ id: string; service_id: string; customer_id: string }>,
): Promise<Set<string>> {
  if (!bookings.length) return new Set()

  const bookingIds = bookings.map(b => b.id)
  const serviceIds = [...new Set(bookings.map(b => b.service_id).filter(Boolean))]
  const [servicesRes, bookingFormsRes] = await Promise.all([
    supabase
      .from('services')
      .select('id, form_id, returning_form_id')
      .eq('business_id', businessId)
      .in('id', serviceIds),
    supabase.from('booking_forms').select('booking_id, form_id').in('booking_id', bookingIds),
  ])

  const services = (servicesRes.data ?? []) as { id: string; form_id: string | null; returning_form_id: string | null }[]
  const serviceById = new Map(services.map(s => [s.id, s]))
  const linkedFormIds = [...new Set(services.flatMap(s => [s.form_id, s.returning_form_id]).filter((id): id is string => !!id))]

  const { data: linkedFormRows } = linkedFormIds.length
    ? await supabase.from('service_forms').select('id, is_active').in('id', linkedFormIds)
    : { data: [] as { id: string; is_active: boolean }[] }
  const activeFormIds = new Set((linkedFormRows ?? []).filter(f => f.is_active).map(f => f.id))

  // Which customers already have a valid response to which "new client" forms —
  // needed up front to decide, per booking, whether the returning form applies.
  const customerIds = [...new Set(bookings.map(b => b.customer_id))]
  const newFormIds = [...new Set(services.map(s => s.form_id).filter((id): id is string => !!id && activeFormIds.has(id)))]
  const { data: newFormResponses } = newFormIds.length && customerIds.length
    ? await supabase
        .from('form_responses')
        .select('customer_id, form_id')
        .in('customer_id', customerIds)
        .in('form_id', newFormIds)
        .gt('expires_at', new Date().toISOString())
    : { data: [] as { customer_id: string; form_id: string }[] }
  const hasValidNewForm = new Set((newFormResponses ?? []).map(r => `${r.customer_id}:${r.form_id}`))

  const adhocByBooking = new Map<string, string[]>()
  for (const row of (bookingFormsRes.data ?? [])) {
    const arr = adhocByBooking.get(row.booking_id) ?? []
    arr.push(row.form_id)
    adhocByBooking.set(row.booking_id, arr)
  }

  const requiredByBooking = new Map<string, string[]>()
  for (const b of bookings) {
    const ids: string[] = []
    const svc = b.service_id ? serviceById.get(b.service_id) : undefined
    if (svc?.form_id && activeFormIds.has(svc.form_id)) {
      const alreadyHasNewForm = hasValidNewForm.has(`${b.customer_id}:${svc.form_id}`)
      if (alreadyHasNewForm && svc.returning_form_id && activeFormIds.has(svc.returning_form_id)) {
        ids.push(svc.returning_form_id)
      } else {
        ids.push(svc.form_id)
      }
    }
    for (const fid of adhocByBooking.get(b.id) ?? []) {
      if (!ids.includes(fid)) ids.push(fid)
    }
    if (ids.length) requiredByBooking.set(b.id, ids)
  }
  if (!requiredByBooking.size) return new Set()

  const finalCustomerIds = [...new Set(bookings.filter(b => requiredByBooking.has(b.id)).map(b => b.customer_id))]
  const allRequiredFormIds = [...new Set([...requiredByBooking.values()].flat())]

  const { data: responses } = await supabase
    .from('form_responses')
    .select('customer_id, form_id')
    .in('customer_id', finalCustomerIds)
    .in('form_id', allRequiredFormIds)
    .gt('expires_at', new Date().toISOString())

  const done = new Set((responses ?? []).map(r => `${r.customer_id}:${r.form_id}`))

  const alerts = new Set<string>()
  for (const b of bookings) {
    const required = requiredByBooking.get(b.id)
    if (!required) continue
    const allDone = required.every(fid => done.has(`${b.customer_id}:${fid}`))
    if (!allDone) alerts.add(b.id)
  }
  return alerts
}
