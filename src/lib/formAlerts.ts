import { supabase } from './supabase'

export type BookingFormStatus = {
  needsForm: boolean
  formTitle: string | null
  missingForms: { id: string; title: string }[]
}

type FormRow = { id: string; title: string; is_active: boolean }

/** Targeted check for a single booking's detail panel. Decides between the
 *  service's New Client Form and Returning Client Form (if the customer already
 *  had a valid response to the New Client Form BEFORE this booking was made,
 *  the returning form applies instead), plus any forms attached directly to
 *  this booking.
 *
 *  The "before this booking was made" anchor matters: without it, a customer
 *  completing their New Client Form flips them to "returning" status the
 *  instant they submit it, so reopening the very booking that form was for
 *  would immediately start demanding the (unrelated, uncompleted) Returning
 *  form instead — a permanent false "form not completed" warning. Anchoring
 *  the classification to bookingCreatedAt keeps it stable for that booking. */
export async function checkBookingForm(
  serviceId: string,
  customerId: string,
  bookingId?: string,
  bookingCreatedAt?: string,
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
    const cutoff = bookingCreatedAt ?? new Date().toISOString()
    let hadEarlierValidNewForm = false
    if (bookingCreatedAt) {
      const { data: rows } = await supabase
        .from('form_responses')
        .select('id')
        .eq('customer_id', customerId)
        .eq('form_id', newForm.id)
        .lt('completed_at', cutoff)
        .gt('expires_at', cutoff)
        .limit(1)
      hadEarlierValidNewForm = !!rows?.length
    } else {
      // No booking timestamp to anchor to (e.g. the ad-hoc "add a form" flow) —
      // fall back to "is there a valid response right now".
      const { data: row } = await supabase
        .from('form_responses')
        .select('id')
        .eq('customer_id', customerId)
        .eq('form_id', newForm.id)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      hadEarlierValidNewForm = !!row
    }
    if (hadEarlierValidNewForm && returningForm?.is_active) {
      forms.push(returningForm)
    } else {
      forms.push(newForm)
    }
  }

  const bookingFormRows = (bookingFormsRes.data ?? []) as unknown as { form: { id: string; title: string } | null }[]
  for (const row of bookingFormRows) {
    if (row.form && !forms.some(f => f.id === row.form!.id)) forms.push(row.form)
  }

  if (!forms.length) return { needsForm: false, formTitle: null, missingForms: [] }

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
    missingForms: missing,
  }
}

/** Batch check for list views — returns booking IDs that need a form (their
 *  service's New/Returning Client Form, or one attached directly to the booking)
 *  but haven't completed one. Same New-vs-Returning logic as checkBookingForm,
 *  anchored per-booking to that booking's own created_at (see checkBookingForm's
 *  doc comment for why: without the anchor, completing the New form flips a
 *  customer to "returning" immediately, making their own just-submitted
 *  booking demand the unrelated Returning form instead). */
export async function loadFormAlertSet(
  businessId: string,
  bookings: Array<{ id: string; service_id: string; customer_id: string; created_at: string }>,
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

  // Every New-form response for the relevant customers (not just "currently valid")
  // so each booking can check "was there already a valid one as of when I was made".
  const customerIds = [...new Set(bookings.map(b => b.customer_id))]
  const newFormIds = [...new Set(services.map(s => s.form_id).filter((id): id is string => !!id && activeFormIds.has(id)))]
  const { data: newFormResponses } = newFormIds.length && customerIds.length
    ? await supabase
        .from('form_responses')
        .select('customer_id, form_id, completed_at, expires_at')
        .in('customer_id', customerIds)
        .in('form_id', newFormIds)
    : { data: [] as { customer_id: string; form_id: string; completed_at: string; expires_at: string }[] }
  const newFormResponsesByKey = new Map<string, { completed_at: string; expires_at: string }[]>()
  for (const r of (newFormResponses ?? [])) {
    const key = `${r.customer_id}:${r.form_id}`
    const arr = newFormResponsesByKey.get(key) ?? []
    arr.push({ completed_at: r.completed_at, expires_at: r.expires_at })
    newFormResponsesByKey.set(key, arr)
  }
  function hadEarlierValidNewForm(customerId: string, formId: string, cutoff: string): boolean {
    const rows = newFormResponsesByKey.get(`${customerId}:${formId}`)
    return !!rows?.some(r => r.completed_at < cutoff && r.expires_at > cutoff)
  }

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
      const alreadyHasNewForm = hadEarlierValidNewForm(b.customer_id, svc.form_id, b.created_at)
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
