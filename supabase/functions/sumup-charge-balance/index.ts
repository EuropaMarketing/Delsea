import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, penceToMajor, sumupFetch } from '../_shared/sumup.ts'

const SUMUP_MERCHANT_CODE = Deno.env.get('SUMUP_MERCHANT_CODE')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseAsUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseAsUser.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)

    const { booking_id, amount, type } = await req.json() as { booking_id: string; amount: number; type?: 'balance' | 'noshow' }
    if (!booking_id || !amount || amount <= 0) return json({ error: 'booking_id and a positive amount are required' }, 400)

    const { data: booking, error: bErr } = await supabaseAdmin
      .from('bookings')
      .select('id, business_id, customer:customers(id, sumup_card_token)')
      .eq('id', booking_id)
      .single()
    if (bErr || !booking) return json({ error: 'Booking not found' }, 404)

    const { data: isAdmin } = await supabaseAsUser.rpc('is_business_admin', { bid: booking.business_id })
    if (!isAdmin) return json({ error: 'Not authorized for this business' }, 403)

    const customer = booking.customer as unknown as { id: string; sumup_card_token: string | null }
    if (!customer.sumup_card_token) return json({ error: 'No saved card on file for this customer' }, 400)

    const paymentType = type === 'noshow' ? 'noshow' : 'balance'

    const checkoutRes = await sumupFetch('/v0.1/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        checkout_reference: `${booking_id}-${paymentType}-${Date.now()}`,
        amount: penceToMajor(amount),
        currency: 'GBP',
        merchant_code: SUMUP_MERCHANT_CODE,
        customer_id: customer.id,
        purpose: 'CHECKOUT',
        description: `${paymentType === 'noshow' ? 'No-show charge' : 'Balance payment'} for booking ${booking_id}`,
        return_url: `${SUPABASE_URL}/functions/v1/sumup-webhook`,
      }),
    })
    if (!checkoutRes.ok) return json({ error: `SumUp checkout creation failed: ${await checkoutRes.text()}` }, 502)
    const checkout = await checkoutRes.json() as { id: string }

    await supabaseAdmin.from('payments').insert({
      booking_id,
      type: paymentType,
      amount,
      currency: 'GBP',
      sumup_checkout_id: checkout.id,
      status: 'pending',
    })

    const processRes = await sumupFetch(`/v0.1/checkouts/${checkout.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        payment_type: 'card',
        token: customer.sumup_card_token,
        customer_id: customer.id,
        mandate: { type: 'recurrent', user_agent: 'staff-dashboard', user_ip: req.headers.get('x-forwarded-for') ?? '0.0.0.0' },
      }),
    })
    const processed = await processRes.json() as { status: string }

    if (processed.status === 'PAID') {
      await supabaseAdmin.from('payments').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('sumup_checkout_id', checkout.id)
      await supabaseAdmin.from('bookings').update({ payment_status: 'paid_in_full', balance_charged_at: new Date().toISOString() }).eq('id', booking_id)
      return json({ success: true, status: 'PAID' })
    }

    if (processed.status === 'FAILED') {
      await supabaseAdmin.from('payments').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('sumup_checkout_id', checkout.id)
      return json({ success: false, status: 'FAILED', error: 'Card was declined' }, 402)
    }

    // PENDING (e.g. async 3DS) — the webhook will resolve this once SumUp confirms.
    return json({ success: false, status: processed.status, message: 'Payment is processing, status will update shortly' })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
