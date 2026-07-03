import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ShieldCheck, Loader2, RotateCcw, CalendarDays, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { formatCurrency } from '@/lib/currency'
import { loadSumUpSdk, type SumUpCardInstance, type SumUpWidgetResponseType } from '@/lib/sumup'
import { Button } from '@/components/ui/Button'

const WIDGET_ID = 'sumup-payment-widget'

type PaymentState = {
  bookingId: string
  paymentMethod: 'card' | 'venue'
  serviceName: string
  startsAt: string
  staffName: string | null
  amountDue: number
  isDeposit: boolean
  balanceDue: number
  confirmedState: Record<string, unknown>
}

export default function Payment() {
  const { state } = useLocation() as { state: PaymentState | null }
  const navigate = useNavigate()
  const { reset } = useBookingStore()

  const [checkoutLoading, setCheckoutLoading] = useState(true)
  const [widgetError, setWidgetError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const instanceRef = useRef<SumUpCardInstance | null>(null)
  const bookingIdRef = useRef<string | null>(null)
  const confirmedRef = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!state?.bookingId) { navigate('/book', { replace: true }); return }
    bookingIdRef.current = state.bookingId
    confirmedRef.current = state.confirmedState
    startCheckout()
  }, [])

  async function startCheckout() {
    setCheckoutLoading(true)
    setWidgetError(null)

    const { data, error } = await supabase.functions.invoke('sumup-create-checkout', {
      body: {
        booking_id: state!.bookingId,
        mode: state!.paymentMethod === 'card' ? 'payment' : 'tokenize',
      },
    })

    if (error || !data?.checkout_id) {
      setWidgetError('Could not start payment. Please try again.')
      setCheckoutLoading(false)
      return
    }

    await loadSumUpSdk()
    instanceRef.current?.unmount()
    instanceRef.current = window.SumUpCard!.mount({
      id: WIDGET_ID,
      checkoutId: data.checkout_id,
      onResponse: handleWidgetResponse,
    })
    setCheckoutLoading(false)
  }

  function handleWidgetResponse(type: SumUpWidgetResponseType, body: unknown) {
    if (type === 'success') {
      verifyAndFinish()
    } else if (type === 'fail' || type === 'error') {
      const msg = (body as { message?: string } | undefined)?.message
      setWidgetError(msg || 'Payment failed. Please check your details and try again.')
    }
  }

  async function verifyAndFinish() {
    setVerifying(true)
    const bookingId = bookingIdRef.current
    if (bookingId) {
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        const { data } = await supabase.from('bookings').select('payment_status').eq('id', bookingId).single()
        if (data && data.payment_status !== 'unpaid') break
      }
    }
    reset()
    navigate('/booking-confirmed', { replace: true, state: confirmedRef.current ?? undefined })
  }

  if (!state?.bookingId) return null

  const startsAt = parseISO(state.startsAt)
  const isFreeBooking = state.amountDue <= 0 && state.paymentMethod === 'card'

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      {/* Compact summary */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 mb-6 space-y-1.5">
        <p className="font-semibold text-gray-900">{state.serviceName}</p>
        <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {format(startsAt, 'EEE d MMM, HH:mm')}
          </span>
          {state.staffName && (
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {state.staffName}
            </span>
          )}
        </div>
        {!isFreeBooking && (
          <div className="pt-1.5 border-t border-gray-200 flex items-baseline justify-between">
            <span className="text-sm text-gray-500">
              {state.paymentMethod === 'venue'
                ? 'Card verification (pay at venue)'
                : state.isDeposit
                ? 'Deposit due now'
                : 'Total due now'}
            </span>
            <span className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>
              {state.paymentMethod === 'venue' ? '£1.00*' : formatCurrency(state.amountDue)}
            </span>
          </div>
        )}
        {state.isDeposit && state.balanceDue > 0 && (
          <p className="text-xs text-gray-400">Balance of {formatCurrency(state.balanceDue)} due at your appointment</p>
        )}
        {state.paymentMethod === 'venue' && (
          <p className="text-xs text-gray-400">*Refunded instantly — your card is saved for payment at the appointment</p>
        )}
      </div>

      {/* Widget div must always be in the DOM so SumUpCard.mount() can attach to it.
          Visibility is controlled purely via CSS — never conditionally unmount this div. */}
      <div id={WIDGET_ID} className={!checkoutLoading && !widgetError && !verifying ? '' : 'hidden'} />

      {verifying && (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
          <p className="text-sm font-medium">Confirming your payment…</p>
        </div>
      )}

      {checkoutLoading && (
        <div className="flex flex-col items-center gap-3 py-16 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin text-gray-300" />
          <p className="text-sm">Setting up secure payment…</p>
        </div>
      )}

      {widgetError && (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {widgetError}
          </div>
          <Button fullWidth onClick={startCheckout}>
            <RotateCcw className="h-4 w-4" />
            Try Again
          </Button>
        </div>
      )}

      {/* Security note */}
      {!verifying && !widgetError && (
        <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-gray-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Secure payment powered by SumUp</span>
        </div>
      )}
    </div>
  )
}
