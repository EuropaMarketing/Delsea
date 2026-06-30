import { createClient } from 'npm:@supabase/supabase-js@2'
import { chargeWithToken, corsHeaders, sumupFetch, type SumupCheckout } from '../_shared/sumup.ts'

const SUMUP_MERCHANT_CODE = Deno.env.get('SUMUP_MERCHANT_CODE')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

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
      .select('id, booking_id, type, status, amount, target_amount, target_type')
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

      const token = checkout.payment_instrument?.token
      if (token) {
        await supabase.from('customers').update({ sumup_card_token: token }).eq('id', booking.customer_id)
      }

      const bookingUpdate: Record<string, unknown> = {}

      if (payment.type === 'tokenization') {
        if (token && payment.target_amount && payment.target_type) {
          // Card just got saved — immediately charge the real amount it was tokenized for.
          const charge = await chargeWithToken({
            merchantCode: SUMUP_MERCHANT_CODE,
            customerId: booking.customer_id,
            token,
            amountPence: payment.target_amount,
            description: `${payment.target_type === 'deposit' ? 'Deposit' : 'Payment'} for booking ${booking.id}`,
            returnUrl: `${SUPABASE_URL}/functions/v1/sumup-webhook`,
            checkoutReference: `${booking.id}-${payment.target_type}-${Date.now()}`,
          })
          await supabase.from('payments').insert({
            booking_id: booking.id,
            type: payment.target_type,
            amount: payment.target_amount,
            currency: 'GBP',
            sumup_checkout_id: charge.checkoutId,
            status: charge.status === 'PAID' ? 'paid' : charge.status === 'FAILED' || charge.status === 'EXPIRED' ? 'failed' : 'pending',
          })
          if (charge.status === 'PAID') {
            bookingUpdate.payment_status = payment.target_type === 'deposit' ? 'deposit_paid' : 'paid_in_full'
            if (payment.target_type === 'deposit') bookingUpdate.deposit_charged = payment.target_amount
          } else if (booking.payment_status === 'unpaid') {
            // Card is saved even though the immediate charge didn't land — staff can retry via Charge Balance.
            bookingUpdate.payment_status = 'card_saved'
          }
        } else if (booking.payment_status === 'unpaid') {
          // Pure Pay-at-Venue tokenization — don't downgrade a booking already paid via deposit/full.
          bookingUpdate.payment_status = 'card_saved'
        }
      } else if (payment.type === 'deposit') {
        bookingUpdate.payment_status = 'deposit_paid'
        bookingUpdate.deposit_charged = payment.amount
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
