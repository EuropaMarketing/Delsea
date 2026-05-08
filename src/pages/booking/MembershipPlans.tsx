import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ticket, Tag, CheckCircle2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency } from '@/lib/currency'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { MembershipPlan } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

export default function MembershipPlans() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedPlan, setSelectedPlan] = useState<MembershipPlan | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [namePrefilled, setNamePrefilled] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

  const [discountCode, setDiscountCode] = useState('')
  const [discountApplying, setDiscountApplying] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [discountInfo, setDiscountInfo] = useState<{ amount: number; code: string } | null>(null)

  useEffect(() => {
    supabase
      .from('membership_plans')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .eq('is_active', true)
      .order('price')
      .then(({ data }) => {
        if (data) setPlans(data as MembershipPlan[])
        setLoading(false)
      })
  }, [])

  // Pre-fill from signed-in user
  useEffect(() => {
    if (user) {
      setEmail(user.email ?? '')
      if (user.user_metadata?.full_name) {
        setName(user.user_metadata.full_name)
        setNamePrefilled(true)
      }
    }
  }, [user])

  function openPlan(plan: MembershipPlan) {
    setSelectedPlan(plan)
    setErrors({})
    setPurchaseError(null)
    setDiscountCode('')
    setDiscountError(null)
    setDiscountInfo(null)
    if (!user) { setName(''); setEmail(''); setNamePrefilled(false) }
  }

  async function handleApplyDiscount() {
    if (!selectedPlan || !discountCode.trim()) return
    setDiscountApplying(true)
    setDiscountError(null)
    const { data, error: rpcErr } = await supabase.rpc('validate_discount_code', {
      p_code: discountCode.trim(),
      p_business_id: BUSINESS_ID,
      p_order_value: selectedPlan.price,
    })
    if (rpcErr) {
      setDiscountError(rpcErr.message)
      setDiscountInfo(null)
    } else if (data) {
      const d = data as { discount_amount: number; code: string }
      setDiscountInfo({ amount: d.discount_amount, code: d.code })
      setDiscountError(null)
    }
    setDiscountApplying(false)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Name is required'
    if (!email.trim()) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email address'
    return e
  }

  async function handlePurchase() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    if (!selectedPlan) return

    setPurchasing(true)
    setPurchaseError(null)

    try {
      const { data: membershipId, error } = await supabase.rpc('purchase_membership', {
        p_business_id: BUSINESS_ID,
        p_plan_id: selectedPlan.id,
        p_name: name.trim(),
        p_email: email.trim().toLowerCase(),
        p_user_id: user?.id ?? null,
      })

      if (error) throw new Error(error.message)
      if (!membershipId) throw new Error('No membership ID returned')

      if (discountInfo && discountCode.trim()) {
        await supabase.rpc('apply_discount_to_membership', {
          p_membership_id: membershipId as string,
          p_code: discountCode.trim(),
          p_business_id: BUSINESS_ID,
        })
      }

      navigate('/membership-confirmed', {
        state: { planName: selectedPlan.name, tokenCount: selectedPlan.token_count, email: email.trim().toLowerCase() },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setPurchaseError(msg)
    } finally {
      setPurchasing(false)
    }
  }

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Membership Plans</h1>
        <p className="text-sm text-gray-500 mt-1">
          Buy a session pack and save — use tokens whenever you book.
        </p>
      </div>

      {plans.length === 0 ? (
        <Card padding="md" className="text-center py-16">
          <Ticket className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-500">No membership plans available right now.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} padding="md" className="flex flex-col gap-4">
              <div className="flex-1">
                <h2 className="font-bold text-gray-900 text-lg">{plan.name}</h2>
                {plan.description && (
                  <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                )}
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-3xl font-extrabold text-gray-900">
                    {formatCurrency(plan.price)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-sm" style={{ color: 'var(--color-primary)' }}>
                  <Ticket className="h-4 w-4" />
                  <span className="font-semibold">
                    {plan.token_count} {plan.token_count === 1 ? 'session' : 'sessions'}
                  </span>
                  <span className="text-gray-400 text-xs ml-1">
                    ({formatCurrency(Math.round(plan.price / plan.token_count))} each)
                  </span>
                </div>
              </div>
              <Button fullWidth onClick={() => openPlan(plan)}>
                Buy Now
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Checkout modal */}
      <Modal
        open={!!selectedPlan}
        onClose={() => setSelectedPlan(null)}
        title="Complete Purchase"
        size="md"
      >
        {selectedPlan && (
          <div className="space-y-4">
            {/* Order summary */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Order Summary</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{selectedPlan.name}</p>
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                    <Ticket className="h-3.5 w-3.5" />
                    {selectedPlan.token_count} {selectedPlan.token_count === 1 ? 'session' : 'sessions'}
                  </p>
                </div>
                <span className={`text-xl font-extrabold ${discountInfo ? 'line-through text-gray-400 text-base' : 'text-gray-900'}`}>
                  {formatCurrency(selectedPlan.price)}
                </span>
              </div>
              {discountInfo && (
                <>
                  <div className="flex justify-between text-sm text-green-700">
                    <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{discountInfo.code}</span>
                    <span className="font-semibold">−{formatCurrency(discountInfo.amount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2">
                    <span>Total</span>
                    <span>{formatCurrency(selectedPlan.price - discountInfo.amount)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Customer details */}
            <Input
              label="Full Name"
              required
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((v) => { const n = { ...v }; delete n.name; return n }) }}
              placeholder="Jane Smith"
              error={errors.name}
              readOnly={namePrefilled}
            />
            <Input
              label="Email Address"
              type="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((v) => { const n = { ...v }; delete n.email; return n }) }}
              placeholder="jane@example.com"
              error={errors.email}
              readOnly={!!user}
            />

            {/* Discount code */}
            <div className="border-t border-gray-100 pt-3">
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

            {purchaseError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {purchaseError}
              </p>
            )}

            <p className="text-xs text-gray-400">
              Your sessions will be available immediately and can be redeemed when booking any service.
            </p>

            <div className="flex gap-3 pt-1">
              <Button variant="secondary" onClick={() => setSelectedPlan(null)}>Cancel</Button>
              <Button fullWidth loading={purchasing} onClick={handlePurchase}>
                Confirm Purchase — {formatCurrency(selectedPlan.price - (discountInfo?.amount ?? 0))}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
