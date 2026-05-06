import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ticket } from 'lucide-react'
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
    if (!user) { setName(''); setEmail(''); setNamePrefilled(false) }
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
      // Upsert customer record
      const { data: customer, error: custErr } = await supabase
        .from('customers')
        .upsert(
          { business_id: BUSINESS_ID, user_id: user?.id ?? null, name: name.trim(), email: email.trim().toLowerCase() },
          { onConflict: 'business_id,email', ignoreDuplicates: false }
        )
        .select('id')
        .single()

      if (custErr || !customer) throw custErr ?? new Error('Could not create customer record')

      // Assign membership
      const { data: membership, error: memErr } = await supabase
        .from('customer_memberships')
        .insert({ customer_id: customer.id, plan_id: selectedPlan.id, tokens_remaining: selectedPlan.token_count })
        .select('id')
        .single()

      if (memErr || !membership) throw memErr ?? new Error('Could not assign membership')

      // Record transaction
      await supabase.from('membership_transactions').insert({
        membership_id: membership.id,
        type: 'purchase',
        amount: selectedPlan.token_count,
        note: `Membership purchased: ${selectedPlan.name}`,
      })

      navigate('/membership-confirmed', {
        state: { planName: selectedPlan.name, tokenCount: selectedPlan.token_count, email: email.trim().toLowerCase() },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong — please try again.'
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
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Order Summary</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{selectedPlan.name}</p>
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                    <Ticket className="h-3.5 w-3.5" />
                    {selectedPlan.token_count} {selectedPlan.token_count === 1 ? 'session' : 'sessions'}
                  </p>
                </div>
                <span className="text-xl font-extrabold text-gray-900">
                  {formatCurrency(selectedPlan.price)}
                </span>
              </div>
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
                Confirm Purchase — {formatCurrency(selectedPlan.price)}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
