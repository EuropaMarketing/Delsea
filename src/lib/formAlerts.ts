import { supabase } from './supabase'

export type BookingFormStatus = {
  needsForm: boolean
  formTitle: string | null
}

/** Targeted check for a single booking's detail panel — covers both the
 *  service's own form (if any) and any forms attached directly to this booking. */
export async function checkBookingForm(
  serviceId: string,
  customerId: string,
  bookingId?: string,
): Promise<BookingFormStatus> {
  const [serviceRes, bookingFormsRes] = await Promise.all([
    supabase.from('services').select('form:service_forms(id, title, is_active)').eq('id', serviceId).maybeSingle(),
    bookingId
      ? supabase.from('booking_forms').select('form:service_forms(id, title)').eq('booking_id', bookingId)
      : Promise.resolve({ data: [] as { form: { id: string; title: string } | null }[] }),
  ])

  const forms: { id: string; title: string }[] = []
  const svcForm = (serviceRes.data as unknown as { form: { id: string; title: string; is_active: boolean } | null } | null)?.form
  if (svcForm?.is_active) forms.push({ id: svcForm.id, title: svcForm.title })
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

/** Batch check for list views — returns booking IDs that need a form (via their
 *  service or attached directly to the booking) but haven't completed one. */
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
      .select('id, form:service_forms(id, is_active)')
      .eq('business_id', businessId)
      .in('id', serviceIds),
    supabase.from('booking_forms').select('booking_id, form_id').in('booking_id', bookingIds),
  ])

  const serviceRows = (servicesRes.data ?? []) as unknown as { id: string; form: { id: string; is_active: boolean } | null }[]
  const formByService = new Map(
    serviceRows.filter(s => s.form?.is_active).map(s => [s.id, s.form!.id]),
  )
  const adhocByBooking = new Map<string, string[]>()
  for (const row of (bookingFormsRes.data ?? [])) {
    const arr = adhocByBooking.get(row.booking_id) ?? []
    arr.push(row.form_id)
    adhocByBooking.set(row.booking_id, arr)
  }

  const requiredByBooking = new Map<string, string[]>()
  for (const b of bookings) {
    const ids: string[] = []
    const svcForm = b.service_id ? formByService.get(b.service_id) : undefined
    if (svcForm) ids.push(svcForm)
    for (const fid of adhocByBooking.get(b.id) ?? []) {
      if (!ids.includes(fid)) ids.push(fid)
    }
    if (ids.length) requiredByBooking.set(b.id, ids)
  }
  if (!requiredByBooking.size) return new Set()

  const customerIds = [...new Set(bookings.filter(b => requiredByBooking.has(b.id)).map(b => b.customer_id))]
  const allFormIds = [...new Set([...requiredByBooking.values()].flat())]

  const { data: responses } = await supabase
    .from('form_responses')
    .select('customer_id, form_id')
    .in('customer_id', customerIds)
    .in('form_id', allFormIds)
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
