import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, ensureSumupCustomer, penceToMajor, sumupFetch } from '../_shared/sumup.ts'

const SUMUP_MERCHANT_CODE = Deno.env.get('SUMUP_MERCHANT_CODE')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const TOKENIZE_AMOUNT_PENCE = 100 // £1.00 — authorized then instantly refunded by SumUp

const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { booking_id, mode } = await req.json() as { booking_id: string; mode: 'payment' | 'tokenize' }
    if (!booking_id || !['payment', 'tokenize'].includes(mode)) {
      return json({ error: 'booking_id and a valid mode are required' }, 400)
    }

    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select(`
        id, spots_booked, discount_amount, gift_voucher_amount,
        service:services(price, deposit_type, deposit_value),
        customer:customers(id, name, email, phone)
      `)
      .eq('id', booking_id)
      .single()

    if (bErr || !booking) return json({ error: 'Booking not found' }, 404)
    const service = booking.service as unknown as { price: number; deposit_type: string; deposit_value: number }
    const customer = booking.customer as unknown as { id: string; name: string; email: string; phone: string | null }

    const { data: addonRows } = await supabase
      .from('booking_addons')
      .select('price')
      .eq('booking_id', booking_id)
    const addonsTotal = (addonRows ?? []).reduce((sum, a) => sum + a.price, 0)

    const servicePrice = service.price * (booking.spots_booked ?? 1)
    const total = servicePrice + addonsTotal - (booking.discount_amount ?? 0) - (booking.gift_voucher_amount ?? 0)

    const depositAmount =
      service.deposit_type === 'fixed' ? service.deposit_value :
      service.deposit_type === 'percentage' ? Math.round(total * service.deposit_value / 100) :
      0

    // SumUp only ever saves a card during a SETUP_RECURRING_PAYMENT checkout — a normal
    // CHECKOUT with customer_id attached does NOT save it, even mid-payment. So both modes
    // mount the same £1 tokenize-and-refund widget; "payment" mode additionally records the
    // real amount due so the webhook can charge it server-side the moment the token lands.
    const targetAmount = mode === 'payment' ? (depositAmount > 0 ? depositAmount : total) : null
    const targetType = mode === 'payment' ? (depositAmount > 0 ? 'deposit' : 'full') : null

    await ensureSumupCustomer(customer)

    const checkoutRes = await sumupFetch('/v0.1/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        checkout_reference: `${booking_id}-${Date.now()}`,
        amount: penceToMajor(TOKENIZE_AMOUNT_PENCE),
        currency: 'GBP',
        merchant_code: SUMUP_MERCHANT_CODE,
        customer_id: customer.id,
        purpose: 'SETUP_RECURRING_PAYMENT',
        description: `Booking ${booking_id}`,
        return_url: `${SUPABASE_URL}/functions/v1/sumup-webhook`,
      }),
    })

    if (!checkoutRes.ok) {
      const body = await checkoutRes.text()
      return json({ error: `SumUp checkout creation failed: ${body}` }, 502)
    }

    const checkout = await checkoutRes.json() as { id: string }

    await supabase.from('payments').insert({
      booking_id,
      type: 'tokenization',
      amount: TOKENIZE_AMOUNT_PENCE,
      currency: 'GBP',
      sumup_checkout_id: checkout.id,
      status: 'pending',
      target_amount: targetAmount,
      target_type: targetType,
    })

    return json({ checkout_id: checkout.id })
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
