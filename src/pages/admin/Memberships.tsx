import { useEffect, useState } from 'react'
import { Plus, Pencil, Ticket, Users, Search, PlusCircle, MinusCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { MembershipPlan, CustomerMembership } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

interface PlanForm { name: string; description: string; price: string; token_count: string; service_category: string }
const emptyPlanForm: PlanForm = { name: '', description: '', price: '', token_count: '1', service_category: '' }

export default function AdminMemberships() {
  const [tab, setTab] = useState<'plans' | 'members'>('plans')
  const [categories, setCategories] = useState<string[]>([])

  // Plans
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [planModal, setPlanModal] = useState(false)
  const [editPlan, setEditPlan] = useState<MembershipPlan | null>(null)
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlanForm)
  const [planErrors, setPlanErrors] = useState<Record<string, string>>({})
  const [planSaving, setPlanSaving] = useState(false)
  const [planSaveError, setPlanSaveError] = useState<string | null>(null)

  // Members
  const [memberships, setMemberships] = useState<CustomerMembership[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [assignModal, setAssignModal] = useState(false)
  const [assignEmail, setAssignEmail] = useState('')
  const [assignPlanId, setAssignPlanId] = useState('')
  const [assignError, setAssignError] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<CustomerMembership | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  useEffect(() => {
    loadPlans()
    supabase
      .from('services')
      .select('category')
      .eq('business_id', BUSINESS_ID)
      .then(({ data }) => {
        if (data) setCategories([...new Set(data.map((s) => s.category as string).filter(Boolean))])
      })
  }, [])
  useEffect(() => { if (tab === 'members') loadMemberships() }, [tab])

  async function loadPlans() {
    const { data } = await supabase
      .from('membership_plans')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .order('created_at')
    if (data) setPlans(data as MembershipPlan[])
    setPlansLoading(false)
  }

  async function loadMemberships() {
    setMembersLoading(true)
    const planIds = plans.map((p) => p.id)
    if (!planIds.length) { setMembersLoading(false); return }
    const { data } = await supabase
      .from('customer_memberships')
      .select('*, customer:customers(id, name, email), plan:membership_plans(name, token_count)')
      .in('plan_id', planIds)
      .order('purchased_at', { ascending: false })
    if (data) setMemberships(data as CustomerMembership[])
    setMembersLoading(false)
  }

  // Plans CRUD
  function openCreatePlan() {
    setEditPlan(null)
    setPlanForm(emptyPlanForm)
    setPlanErrors({})
    setPlanModal(true)
  }

  function openEditPlan(plan: MembershipPlan) {
    setEditPlan(plan)
    setPlanForm({
      name: plan.name,
      description: plan.description ?? '',
      price: String(plan.price / 100),
      token_count: String(plan.token_count),
      service_category: plan.service_category ?? '',
    })
    setPlanErrors({})
    setPlanModal(true)
  }

  function validatePlan() {
    const e: Record<string, string> = {}
    if (!planForm.name.trim()) e.name = 'Name required'
    if (isNaN(Number(planForm.price)) || Number(planForm.price) < 0) e.price = 'Enter a valid price'
    if (!Number.isInteger(Number(planForm.token_count)) || Number(planForm.token_count) < 1) e.token_count = 'Must be at least 1'
    return e
  }

  async function handleSavePlan() {
    const e = validatePlan()
    if (Object.keys(e).length) { setPlanErrors(e); return }
    setPlanSaving(true)
    setPlanSaveError(null)
    const payload = {
      name: planForm.name.trim(),
      description: planForm.description.trim() || null,
      price: Math.round(parseFloat(planForm.price) * 100) || 0,
      token_count: Number(planForm.token_count),
      service_category: planForm.service_category.trim() || null,
    }
    if (editPlan) {
      const { data, error } = await supabase.from('membership_plans').update(payload).eq('id', editPlan.id).select().single()
      if (error) { setPlanSaveError(error.message); setPlanSaving(false); return }
      if (data) setPlans((prev) => prev.map((p) => (p.id === editPlan.id ? data as MembershipPlan : p)))
    } else {
      const { data, error } = await supabase.from('membership_plans')
        .insert({ ...payload, business_id: BUSINESS_ID }).select().single()
      if (error) { setPlanSaveError(error.message); setPlanSaving(false); return }
      if (data) setPlans((prev) => [...prev, data as MembershipPlan])
    }
    setPlanSaving(false)
    setPlanModal(false)
  }

  async function handleTogglePlan(plan: MembershipPlan) {
    const is_active = !plan.is_active
    await supabase.from('membership_plans').update({ is_active }).eq('id', plan.id)
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, is_active } : p)))
  }

  // Assign membership to customer
  async function handleAssign() {
    if (!assignEmail.trim()) { setAssignError('Enter a customer email'); return }
    if (!assignPlanId) { setAssignError('Select a membership plan'); return }
    setAssigning(true)
    setAssignError('')

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', assignEmail.trim().toLowerCase())
      .eq('business_id', BUSINESS_ID)
      .maybeSingle()

    if (!customer) {
      setAssignError('No customer found with that email. They need to have made a booking first.')
      setAssigning(false)
      return
    }

    const plan = plans.find((p) => p.id === assignPlanId)!
    const { data: membership, error } = await supabase
      .from('customer_memberships')
      .insert({ customer_id: customer.id, plan_id: assignPlanId, tokens_remaining: plan.token_count })
      .select('*, customer:customers(id, name, email), plan:membership_plans(name, token_count)')
      .single()

    if (error) { setAssignError('Failed to assign — please try again.'); setAssigning(false); return }

    await supabase.from('membership_transactions').insert({
      membership_id: (membership as CustomerMembership).id,
      type: 'purchase',
      amount: plan.token_count,
      note: `Membership assigned: ${plan.name}`,
    })

    setMemberships((prev) => [membership as CustomerMembership, ...prev])
    setAssignModal(false)
    setAssignEmail('')
    setAssignPlanId('')
    setAssigning(false)
  }

  // Manual token adjustment
  async function handleAdjust(direction: 'add' | 'remove') {
    if (!adjustTarget) return
    const amount = parseInt(adjustAmount)
    if (isNaN(amount) || amount < 1) return
    const delta = direction === 'add' ? amount : -amount
    const newBalance = adjustTarget.tokens_remaining + delta
    if (newBalance < 0) return
    setAdjusting(true)
    await supabase
      .from('customer_memberships')
      .update({ tokens_remaining: newBalance })
      .eq('id', adjustTarget.id)
    await supabase.from('membership_transactions').insert({
      membership_id: adjustTarget.id,
      type: 'manual_adjust',
      amount: delta,
      note: adjustNote.trim() || null,
    })
    setMemberships((prev) =>
      prev.map((m) => (m.id === adjustTarget.id ? { ...m, tokens_remaining: newBalance } : m))
    )
    setAdjustTarget(null)
    setAdjustAmount('')
    setAdjustNote('')
    setAdjusting(false)
  }

  const filteredMemberships = memberships.filter((m) => {
    if (!memberSearch.trim()) return true
    const q = memberSearch.toLowerCase()
    return (
      m.customer?.name?.toLowerCase().includes(q) ||
      m.customer?.email?.toLowerCase().includes(q)
    )
  })

  if (plansLoading) return <FullPageSpinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Memberships</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['plans', 'members'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
              tab === t
                ? 'border-(--color-primary) text-(--color-primary)'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'plans' ? 'Plans' : 'Members'}
          </button>
        ))}
      </div>

      {/* Plans tab */}
      {tab === 'plans' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={openCreatePlan}>
              <Plus className="h-4 w-4" />
              New Plan
            </Button>
          </div>
          {plans.length === 0 ? (
            <Card padding="md" className="text-center py-12">
              <Ticket className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No membership plans yet</p>
              <p className="text-xs text-gray-400 mt-1">Create a plan to start selling memberships.</p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card key={plan.id} padding="md" className={`flex flex-col gap-2 ${!plan.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{plan.name}</p>
                      {plan.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{plan.description}</p>}
                    </div>
                    <Badge variant={plan.is_active ? 'success' : 'default'}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="font-bold text-gray-900">{formatCurrency(plan.price)}</span>
                    <span className="text-gray-400">·</span>
                    <span className="flex items-center gap-1 text-gray-600">
                      <Ticket className="h-3.5 w-3.5" />
                      {plan.token_count} {plan.token_count === 1 ? 'session' : 'sessions'}
                    </span>
                    {plan.service_category && (
                      <>
                        <span className="text-gray-400">·</span>
                        <Badge variant="default">{plan.service_category} only</Badge>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    <Button variant="secondary" size="sm" onClick={() => openEditPlan(plan)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant={plan.is_active ? 'danger' : 'secondary'}
                      size="sm"
                      onClick={() => handleTogglePlan(plan)}
                    >
                      {plan.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full h-10 pl-9 pr-3 text-sm border border-gray-200 bg-white rounded-(--border-radius-sm) outline-none focus:ring-2 focus:ring-(--color-primary)"
              />
            </div>
            <Button size="sm" onClick={() => { setAssignModal(true); setAssignEmail(''); setAssignPlanId(''); setAssignError('') }}>
              <Plus className="h-4 w-4" />
              Assign
            </Button>
          </div>

          {membersLoading ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
          ) : filteredMemberships.length === 0 ? (
            <Card padding="md" className="text-center py-12">
              <Users className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No members yet</p>
              <p className="text-xs text-gray-400 mt-1">Assign a membership plan to a customer to get started.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredMemberships.map((m) => (
                <Card key={m.id} padding="sm" className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{m.customer?.name ?? '—'}</p>
                    <p className="text-xs text-gray-500 truncate">{m.customer?.email}</p>
                  </div>
                  <div className="text-center shrink-0 hidden sm:block">
                    <p className="text-xs text-gray-400">Plan</p>
                    <p className="text-sm font-medium text-gray-700">{m.plan?.name}</p>
                  </div>
                  <div className="text-center shrink-0">
                    <p className="text-xs text-gray-400">Tokens</p>
                    <p className={`text-lg font-bold ${m.tokens_remaining === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                      {m.tokens_remaining}
                    </p>
                  </div>
                  <button
                    onClick={() => { setAdjustTarget(m); setAdjustAmount(''); setAdjustNote('') }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors shrink-0"
                    title="Adjust tokens"
                  >
                    <Ticket className="h-4 w-4" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Plan create/edit modal */}
      <Modal
        open={planModal}
        onClose={() => setPlanModal(false)}
        title={editPlan ? 'Edit Plan' : 'New Membership Plan'}
        size="md"
      >
        <div className="space-y-4">
          <Input label="Plan Name" required value={planForm.name}
            onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Monthly 10-Pack" error={planErrors.name} />
          <Textarea label="Description" value={planForm.description}
            onChange={(e) => setPlanForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Brief description shown to customers…" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Price (£)" required type="number" min={0} step="0.01" value={planForm.price}
              onChange={(e) => setPlanForm((f) => ({ ...f, price: e.target.value }))}
              placeholder="0.00" error={planErrors.price} />
            <Input label="Sessions (tokens)" required type="number" min={1} value={planForm.token_count}
              onChange={(e) => setPlanForm((f) => ({ ...f, token_count: e.target.value }))}
              placeholder="10" error={planErrors.token_count} />
          </div>
          {/* Category restriction */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Service Category <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={planForm.service_category}
              onChange={(e) => setPlanForm((f) => ({ ...f, service_category: e.target.value }))}
              className="h-10 px-3 text-sm border border-gray-200 bg-white rounded-(--border-radius-sm) outline-none focus:ring-2 focus:ring-(--color-primary)"
            >
              <option value="">Any category — works for all services</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400">
              Restrict this membership so tokens can only be redeemed against services in this category.
            </p>
          </div>

          {planSaveError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {planSaveError}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => { setPlanModal(false); setPlanSaveError(null) }}>Cancel</Button>
            <Button loading={planSaving} onClick={handleSavePlan}>Save Plan</Button>
          </div>
        </div>
      </Modal>

      {/* Assign membership modal */}
      <Modal open={assignModal} onClose={() => setAssignModal(false)} title="Assign Membership" size="md">
        <div className="space-y-4">
          <Input label="Customer Email" type="email" value={assignEmail}
            onChange={(e) => { setAssignEmail(e.target.value); setAssignError('') }}
            placeholder="customer@example.com" />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Membership Plan</label>
            <select
              value={assignPlanId}
              onChange={(e) => setAssignPlanId(e.target.value)}
              className="h-10 px-3 text-sm border border-gray-200 bg-white rounded-(--border-radius-sm) outline-none focus:ring-2 focus:ring-(--color-primary)"
            >
              <option value="">Select a plan…</option>
              {plans.filter((p) => p.is_active).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.token_count} sessions ({formatCurrency(p.price)})
                </option>
              ))}
            </select>
          </div>
          {assignError && <p className="text-xs text-red-500">{assignError}</p>}
          <p className="text-xs text-gray-400">
            This will immediately credit the customer with the plan's full session count.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setAssignModal(false)}>Cancel</Button>
            <Button loading={assigning} onClick={handleAssign}>Assign</Button>
          </div>
        </div>
      </Modal>

      {/* Token adjustment modal */}
      <Modal open={!!adjustTarget} onClose={() => setAdjustTarget(null)} title="Adjust Tokens" size="sm">
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-gray-500">{adjustTarget?.customer?.name}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{adjustTarget?.tokens_remaining}</p>
            <p className="text-xs text-gray-400">current balance</p>
          </div>
          <Input
            label="Number of tokens"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
            placeholder="1"
          />
          <Input
            label="Note (optional)"
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
            placeholder="e.g. Complimentary session"
          />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth loading={adjusting} onClick={() => handleAdjust('remove')}>
              <MinusCircle className="h-4 w-4" />
              Remove
            </Button>
            <Button fullWidth loading={adjusting} onClick={() => handleAdjust('add')}>
              <PlusCircle className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
