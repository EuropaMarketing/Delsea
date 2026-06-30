import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, sumupFetch, type SumupCheckout } from '../_shared/sumup.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { id: checkoutId } = await req.json() as { event_type?: string; id?: string }
    if (!checkoutId) return new Response('ok', { status: 200 })

    // Never trust the webhook payload's status — always re-fetch from SumUp.
    const checkoutRes = await sumupFetch(`/v0.1/checkouts/${checkoutId}`)
    if (!checkoutRes.ok) return new Response('ok', { status: 200 })
    const checkout = await checkoutRes.json() as SumupCheckout

    const { data: payment } = await supabase
      .from('payments')
      .select('id, booking_id, type, status')
      .eq('sumup_checkout_id', checkoutId)
      .single()

    if (!payment) return new Response('ok', { status: 200 })

    const newStatus = checkout.status === 'PAID' ? 'paid' : checkout.status === 'FAILED' || checkout.status === 'EXPIRED' ? 'failed' : 'pending'
    if (newStatus === payment.status) return new Response('ok', { status: 200 })

    await supabase.from('payments').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', payment.id)

    if (newStatus === 'paid') {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, customer_id, payment_status, deposit_charged')
        .eq('id', payment.booking_id)
        .single()
      if (!booking) return new Response('ok', { status: 200 })

      if (checkout.payment_instrument?.token) {
        await supabase
          .from('customers')
          .update({ sumup_card_token: checkout.payment_instrument.token })
          .eq('id', booking.customer_id)
      }

      const bookingUpdate: Record<string, unknown> = {}
      if (payment.type === 'tokenization') {
        // Don't downgrade a booking that's already paid via deposit/full
        if (booking.payment_status === 'unpaid') bookingUpdate.payment_status = 'card_saved'
      } else if (payment.type === 'deposit') {
        bookingUpdate.payment_status = 'deposit_paid'
        const { data: p } = await supabase.from('payments').select('amount').eq('id', payment.id).single()
        bookingUpdate.deposit_charged = p?.amount ?? booking.deposit_charged
      } else if (payment.type === 'full') {
        bookingUpdate.payment_status = 'paid_in_full'
      } else if (payment.type === 'balance' || payment.type === 'noshow') {
        bookingUpdate.payment_status = 'paid_in_full'
        bookingUpdate.balance_charged_at = new Date().toISOString()
      }
      if (Object.keys(bookingUpdate).length) {
        await supabase.from('bookings').update(bookingUpdate).eq('id', booking.id)
      }
    } else if (newStatus === 'failed' && (payment.type === 'deposit' || payment.type === 'full' || payment.type === 'tokenization')) {
      const { data: booking } = await supabase.from('bookings').select('payment_status').eq('id', payment.booking_id).single()
      if (booking?.payment_status === 'unpaid') {
        await supabase.from('bookings').update({ payment_status: 'failed' }).eq('id', payment.booking_id)
      }
    }

    return new Response('ok', { status: 200 })
  } catch {
    // Return 200 to avoid infinite SumUp retries on malformed payloads; real errors are visible via the payments table staying 'pending'.
    return new Response('ok', { status: 200 })
  }
})
