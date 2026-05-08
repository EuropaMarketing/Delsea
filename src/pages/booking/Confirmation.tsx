import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, addMinutes } from 'date-fns'
import { ShieldCheck, Ticket, AlertCircle, Info, Tag, Gift, CheckCircle2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import { useAuthStore } from '@/store/authStore'
import { useBrandStore } from '@/store/brandStore'
import { formatCurrency, formatDuration } from '@/lib/currency'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function Confirmation() {
  const navigate = useNavigate()
  const { draft, services, staff, reset, useToken, tokenMembershipId, tokenPlanName } = useBookingStore()
  const { user } = useAuthStore()
  const { config: brandConfig } = useBrandStore()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmed = useRef(false)

  // Discount code state
  const [discountCode, setDiscountCode] = useState('')
  const [discountApplying, setDiscountApplying] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [discountInfo, setDiscountInfo] = useState<{ amount: number; code: string; type: string; value: number } | null>(null)

  // Gift voucher state
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherApplying, setVoucherApplying] = useState(false)
  const [voucherError, setVoucherError] = useState<string | null>(null)
  const [voucherInfo, setVoucherInfo] = useState<{ code: string; remaining_value: number } | null>(null)

  const service = services.find((s) => s.id === draft.serviceId)
  const staffMember = staff.find((s) => s.id === draft.staffId)

  if (!draft.serviceId || !draft.date || !draft.timeSlot || !draft.customerEmail) {
    if (!confirmed.current) navigate('/book')
    return null
  }

  const [slotH, slotM] = draft.timeSlot.split(':').map(Number)
  const startsAt = new Date(draft.date)
  startsAt.setHours(slotH, slotM, 0, 0)
  const effectiveDuration = draft.variantDuration ?? service?.duration_minutes ?? 60
  const effectiveUnitPrice = draft.variantPrice ?? service?.price ?? 0
  const effectivePrice = effectiveUnitPrice * (draft.spotsBooked ?? 1)
  const voucherAmount = voucherInfo
    ? Math.min(voucherInfo.remaining_value, Math.max(0, effectivePrice - (discountInfo?.amount ?? 0)))
    : 0
  const discountedPrice = effectivePrice - (discountInfo?.amount ?? 0) - voucherAmount
  // endsAt includes post-buffer so the calendar blocks clean-down time;
  // the client-visible end time uses effectiveDuration only.
  const postBuffer = service?.post_buffer_minutes ?? 0
  const endsAt = addMinutes(startsAt, effectiveDuration + postBuffer)
  const clientEndsAt = addMinutes(startsAt, effectiveDuration)

  const depositAmount = service ? (
    service.deposit_type === 'fixed' ? service.deposit_value :
    service.deposit_type === 'percentage' ? Math.round(discountedPrice * service.deposit_value / 100) :
    0
  ) : 0
  const hasDeposit = depositAmount > 0
  const balanceDue = discountedPrice - depositAmount

  async function handleApplyDiscount() {
    if (!discountCode.trim()) return
    setDiscountApplying(true)
    setDiscountError(null)
    const { data, error: rpcErr } = await supabase.rpc('validate_discount_code', {
      p_code: discountCode.trim(),
      p_business_id: BUSINESS_ID,
      p_order_value: effectivePrice,
    })
    if (rpcErr) {
      setDiscountError(rpcErr.message)
      setDiscountInfo(null)
    } else if (data) {
      const d = data as { discount_amount: number; code: string; type: string; value: number }
      setDiscountInfo({ amount: d.discount_amount, code: d.code, type: d.type, value: d.value })
      setDiscountError(null)
    }
    setDiscountApplying(false)
  }

  async function handleApplyVoucher() {
    if (!voucherCode.trim()) return
    setVoucherApplying(true)
    setVoucherError(null)
    const { data, error: rpcErr } = await supabase.rpc('validate_gift_voucher', {
      p_code: voucherCode.trim(),
      p_business_id: BUSINESS_ID,
    })
    if (rpcErr) {
      setVoucherError(rpcErr.message)
      setVoucherInfo(null)
    } else if (data) {
      const d = data as { remaining_value: number }
      setVoucherInfo({ code: voucherCode.trim().toUpperCase(), remaining_value: d.remaining_value })
      setVoucherError(null)
    }
    setVoucherApplying(false)
  }

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    try {
      let resolvedStaffId = draft.staffId
      if (!resolvedStaffId && !service?.is_self_service && staff.length) resolvedStaffId = staff[0].id

      const { data: bookingId, error: bErr } = await supabase
        .rpc('create_booking', {
          p_business_id: BUSINESS_ID,
          p_user_id: user?.id ?? null,
          p_name: draft.customerName,
          p_email: draft.customerEmail,
          p_phone: draft.customerPhone || null,
          p_staff_id: resolvedStaffId ?? null,
          p_service_id: draft.serviceId,
          p_variant_id: draft.variantId ?? null,
          p_starts_at: startsAt.toISOString(),
          p_ends_at: endsAt.toISOString(),
          p_notes: draft.notes || null,
          p_spots_booked: draft.spotsBooked ?? 1,
        })

      if (bErr) throw bErr

      // Redeem membership token if selected
      if (useToken && tokenMembershipId) {
        await supabase.rpc('redeem_token', {
          p_booking_id: bookingId as string,
          p_membership_id: tokenMembershipId,
        })
      }

      // Apply discount code if entered
      if (discountInfo && discountCode.trim()) {
        await supabase.rpc('apply_discount_to_booking', {
          p_booking_id: bookingId as string,
          p_code: discountCode.trim(),
          p_business_id: BUSINESS_ID,
        })
      }

      // Apply gift voucher if entered
      if (voucherInfo && voucherCode.trim()) {
        await supabase.rpc('apply_gift_voucher_to_booking', {
          p_booking_id: bookingId as string,
          p_code: voucherCode.trim(),
          p_business_id: BUSINESS_ID,
        })
      }

      const ref = (bookingId as string).slice(0, 8).toUpperCase()
      const customerEmail = draft.customerEmail
      const wasGuest = !user
      confirmed.current = true
      reset()
      navigate('/booking-confirmed', {
        replace: true,
        state: {
          bookingRef: ref,
          serviceName: service?.name ?? '',
          variantName: draft.variantName ?? null,
          serviceDuration: effectiveDuration,
          servicePrice: discountedPrice,
          staffName: staffMember?.name ?? null,
          startsAt: startsAt.toISOString(),
          endsAt: clientEndsAt.toISOString(),
          customerEmail,
          isNewUser: wasGuest,
          depositAmount,
        },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? 'Something went wrong. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
        <p className="text-sm text-gray-500 mt-1">Review your booking before confirming.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Left — order summary */}
        <div className="space-y-4">
          {/* Service & appointment */}
          <Card padding="md">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Appointment</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Service</dt>
                <dd className="font-semibold text-gray-900">{service?.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Duration</dt>
                <dd className="text-gray-700">
                  {draft.variantName ?? formatDuration(effectiveDuration)}
                  {draft.variantName && <span className="text-gray-400 ml-1">({formatDuration(effectiveDuration)})</span>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Date</dt>
                <dd className="font-medium text-gray-900">{format(startsAt, 'EEEE d MMMM yyyy')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Time</dt>
                <dd className="font-medium" style={{ color: 'var(--color-primary)' }}>
                  {format(startsAt, 'HH:mm')} – {format(clientEndsAt, 'HH:mm')}
                </dd>
              </div>
              {(draft.spotsBooked ?? 1) > 1 && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Spots</dt>
                  <dd className="font-semibold text-gray-900">{draft.spotsBooked}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Team member</dt>
                <dd className="text-gray-700">
                  {service?.is_self_service ? 'Self-service' : staffMember?.name ?? 'Any available'}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Customer */}
          <Card padding="md">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Your Details</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Name</dt>
                <dd className="font-medium text-gray-900">{draft.customerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Email</dt>
                <dd className="text-gray-700">{draft.customerEmail}</dd>
              </div>
              {draft.customerPhone && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="text-gray-700">{draft.customerPhone}</dd>
                </div>
              )}
              {draft.notes && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0">Notes</dt>
                  <dd className="text-gray-700 text-right">{draft.notes}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>

        {/* Right — payment summary */}
        <div>
          <Card padding="md" className="border-2 lg:sticky lg:top-24" style={{ borderColor: 'var(--color-primary)' }}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Payment Summary</h2>

            {useToken ? (
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total</span>
                  <span className="font-semibold text-gray-900 line-through">{formatCurrency(effectivePrice)}</span>
                </div>
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                  <Ticket className="h-4 w-4 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Paid via membership</p>
                    <p className="text-xs text-green-600">{tokenPlanName} · 1 session redeemed</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm mb-4">
                {(draft.spotsBooked ?? 1) > 1 && (
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{formatCurrency(effectiveUnitPrice)} × {draft.spotsBooked} spots</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Total</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(effectivePrice)}</span>
                </div>
                {discountInfo && (
                  <div className="flex justify-between text-sm text-green-700">
                    <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{discountInfo.code}</span>
                    <span className="font-semibold">−{formatCurrency(discountInfo.amount)}</span>
                  </div>
                )}
                {voucherInfo && voucherAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-700">
                    <span className="flex items-center gap-1"><Gift className="h-3.5 w-3.5" />{voucherInfo.code}</span>
                    <span className="font-semibold">−{formatCurrency(voucherAmount)}</span>
                  </div>
                )}
                {(discountInfo || (voucherInfo && voucherAmount > 0)) && (
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2 mt-1">
                    <span>Total after savings</span>
                    <span>{formatCurrency(discountedPrice)}</span>
                  </div>
                )}
                {hasDeposit ? (
                  <div className="border-t border-gray-100 pt-2 mt-2 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Deposit due today</span>
                      <span className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>
                        {formatCurrency(depositAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Balance at appointment</span>
                      <span className="text-gray-500">{formatCurrency(balanceDue)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-gray-100 pt-2 mt-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Due at appointment</span>
                      <span className="text-gray-500">{formatCurrency(discountedPrice)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Discount code + gift voucher entry */}
            {!useToken && (
              <>
                <div className="border-t border-gray-100 pt-3 mb-3">
                  {discountInfo ? (
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-green-700 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Code <span className="font-mono">{discountInfo.code}</span> applied
                      </div>
                      <button onClick={() => { setDiscountInfo(null); setDiscountCode('') }} className="text-gray-400 hover:text-gray-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={discountCode}
                        onChange={e => { setDiscountCode(e.target.value.toUpperCase()); setDiscountError(null) }}
                        onKeyDown={e => e.key === 'Enter' && handleApplyDiscount()}
                        placeholder="DISCOUNT CODE"
                        className="flex-1 h-9 px-3 text-xs font-mono border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) uppercase placeholder:normal-case placeholder:font-sans"
                      />
                      <Button size="sm" variant="secondary" loading={discountApplying} onClick={handleApplyDiscount} disabled={!discountCode.trim()}>
                        Apply
                      </Button>
                    </div>
                  )}
                  {discountError && <p className="text-xs text-red-600 mt-1">{discountError}</p>}
                </div>

                <div className="pt-2 border-t border-gray-100 mb-3">
                  {voucherInfo ? (
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-green-700 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Voucher <span className="font-mono">{voucherInfo.code}</span> applied
                      </div>
                      <button onClick={() => { setVoucherInfo(null); setVoucherCode('') }} className="text-gray-400 hover:text-gray-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={voucherCode}
                        onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setVoucherError(null) }}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyVoucher()}
                        placeholder="GIFT VOUCHER"
                        className="flex-1 h-9 px-3 text-xs font-mono border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) uppercase placeholder:normal-case placeholder:font-sans"
                      />
                      <Button size="sm" variant="secondary" loading={voucherApplying} onClick={handleApplyVoucher} disabled={!voucherCode.trim()}>
                        Apply
                      </Button>
                    </div>
                  )}
                  {voucherError && <p className="text-xs text-red-600 mt-1">{voucherError}</p>}
                </div>
              </>
            )}

            {error && (
              <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button fullWidth size="lg" loading={loading} onClick={handleConfirm}>
              {useToken ? 'Confirm Booking' : hasDeposit ? `Confirm & Pay ${formatCurrency(depositAmount)} Deposit` : 'Confirm Booking'}
            </Button>

            <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-gray-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{useToken ? 'Membership session · no payment needed' : `Secure booking${hasDeposit ? ' · Payment coming soon' : ''}`}</span>
            </div>
          </Card>
        </div>
      </div>

      {(brandConfig.cancellationPolicy || brandConfig.importantInfo) && (
        <div className="mt-6 space-y-3">
          {brandConfig.cancellationPolicy && (
            <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800 mb-1">Cancellation Policy</p>
                <p className="text-xs text-amber-700 whitespace-pre-line">{brandConfig.cancellationPolicy}</p>
              </div>
            </div>
          )}
          {brandConfig.importantInfo && (
            <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-800 mb-1">Important Information</p>
                <p className="text-xs text-blue-700 whitespace-pre-line">{brandConfig.importantInfo}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <Button variant="secondary" onClick={() => navigate('/details')}>
          Back
        </Button>
      </div>
    </div>
  )
}
