import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO, isBefore, isPast } from 'date-fns'
import { Search, CalendarClock, User, Mail, Phone, TrendingUp, Ticket, ClipboardList, CheckCircle2, AlertCircle, Pencil, X, Ban, Trash2, ShieldOff, Cake, Plus, StickyNote, Save, UserCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Customer, MembershipExpiryType } from '@/types'
import type { FormField, Section, ResponseMap } from '@/components/FormFiller'

type ClientFormResponse = {
  id: string
  form_id: string
  completed_at: string
  expires_at: string
  responses: ResponseMap
  form: { title: string } | null
}

type ClientMembership = {
  id: string
  tokens_remaining: number
  purchased_at: string
  expires_at: string | null
  status: 'active' | 'paused' | 'suspended'
  pause_start: string | null
  pause_end: string | null
  pause_reason: string | null
  plan: { name: string; expiry_type: MembershipExpiryType } | null
}

function membershipExpiryText(m: ClientMembership): string {
  if (m.expires_at) return format(parseISO(m.expires_at), 'd MMM yyyy')
  if (m.plan?.expiry_type === 'until_cancelled') return 'Until cancelled'
  return 'No expiry'
}

// A 'paused' membership with a pause_end in the past has already lapsed back to normal use
function membershipOnHold(m: ClientMembership): boolean {
  if (m.status === 'suspended') return true
  if (m.status === 'paused') return !m.pause_end || isBefore(new Date(), parseISO(m.pause_end))
  return false
}

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type Booking = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  notes: string | null
  service: { name: string; price: number } | null
  staff: { name: string } | null
  price_override: number | null
}

type ClientRow = Customer & {
  bookings: Booking[]
  totalSpent: number
  upcomingCount: number
  pastCount: number
  lastVisit: string | null
  blocked: boolean
  blockedIds: string[]
}

export default function AdminClients() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ClientRow | null>(null)
  const [memberships, setMemberships] = useState<ClientMembership[]>([])
  const [membershipsLoading, setMembershipsLoading] = useState(false)
  const [membershipActionTarget, setMembershipActionTarget] = useState<ClientMembership | null>(null)
  const [pauseMode, setPauseMode] = useState<'pause' | 'suspend'>('pause')
  const [pauseEndDate, setPauseEndDate] = useState('')
  const [pauseReason, setPauseReason] = useState('')
  const [membershipActionSaving, setMembershipActionSaving] = useState(false)
  const [membershipActionError, setMembershipActionError] = useState('')
  const [detailTab, setDetailTab] = useState<'overview' | 'forms'>('overview')
  const [clientForms, setClientForms] = useState<ClientFormResponse[]>([])
  const [formsLoading, setFormsLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editDob, setEditDob] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockReason, setBlockReason] = useState('')
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState('')
  const [unblocking, setUnblocking] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientDob, setNewClientDob] = useState('')
  const [newClientSaving, setNewClientSaving] = useState(false)
  const [newClientError, setNewClientError] = useState('')
  // Staff-only notes — never shown to the customer
  const [staffNotesDraft, setStaffNotesDraft] = useState('')
  const [staffNotesSaving, setStaffNotesSaving] = useState(false)
  // Online account invite (sets them up to sign in / set a password themselves)
  const [accountInviteSending, setAccountInviteSending] = useState(false)
  const [accountInviteStatus, setAccountInviteStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [accountInviteError, setAccountInviteError] = useState('')
  // Read-only appointment / completed-form viewers
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null)
  const [viewingFormResponse, setViewingFormResponse] = useState<ClientFormResponse | null>(null)
  const [viewFormSections, setViewFormSections] = useState<Section[]>([])
  const [viewFormFields, setViewFormFields] = useState<FormField[]>([])
  const [viewFormLoading, setViewFormLoading] = useState(false)

  async function loadClients(): Promise<ClientRow[]> {
    const [custRes, bkRes, blockedRes] = await Promise.all([
      supabase
        .from('customers')
        .select('*')
        .eq('business_id', BUSINESS_ID)
        .order('name'),
      supabase
        .from('bookings')
        .select('id, customer_id, starts_at, ends_at, status, notes, price_override, service:services(name, price), staff:staff(name)')
        .eq('business_id', BUSINESS_ID)
        .order('starts_at', { ascending: false }),
      supabase
        .from('blocked_contacts')
        .select('id, email, phone')
        .eq('business_id', BUSINESS_ID),
    ])

    const customers = (custRes.data ?? []) as Customer[]
    const bookings = (bkRes.data ?? []) as unknown as (Booking & { customer_id: string })[]
    const blockedContacts = (blockedRes.data ?? []) as { id: string; email: string | null; phone: string | null }[]
    const now = new Date()

    const rows: ClientRow[] = customers.map((c) => {
      const cBks = bookings.filter((b) => b.customer_id === c.id)
      const nonCancelled = cBks.filter((b) => b.status !== 'cancelled')
      const totalSpent = nonCancelled.reduce((sum, b) => sum + (b.price_override ?? b.service?.price ?? 0), 0)
      const upcoming = nonCancelled.filter((b) => isBefore(now, parseISO(b.starts_at)))
      const past = nonCancelled.filter((b) => !isBefore(now, parseISO(b.starts_at)))
      const lastVisit = past[0]?.starts_at ?? null
      const matches = blockedContacts.filter(
        (bc) => (bc.email && bc.email.toLowerCase() === c.email.toLowerCase()) || (bc.phone && c.phone && bc.phone === c.phone),
      )
      return {
        ...c,
        bookings: cBks,
        totalSpent,
        upcomingCount: upcoming.length,
        pastCount: past.length,
        lastVisit,
        blocked: matches.length > 0,
        blockedIds: matches.map((m) => m.id),
      }
    })

    setClients(rows)
    return rows
  }

  useEffect(() => {
    loadClients().then(() => setLoading(false))
  }, [])

  // Deep link from elsewhere in the admin (e.g. clicking a customer name on the Calendar).
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId || clients.length === 0) return
    const client = clients.find(c => c.id === editId)
    if (client) setSelected(client)
    setSearchParams(params => { params.delete('edit'); return params }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, searchParams])

  useEffect(() => {
    if (!selected) {
      setMemberships([])
      setClientForms([])
      setDetailTab('overview')
      setEditMode(false)
      setBlockModalOpen(false)
      setBlockReason('')
      setBlockError('')
      setDeleteModalOpen(false)
      setDeleteConfirmText('')
      setDeleteError('')
      setMembershipActionTarget(null)
      setStaffNotesDraft('')
      setAccountInviteStatus('idle')
      setAccountInviteError('')
      return
    }
    setStaffNotesDraft(selected.internal_notes ?? '')
    setAccountInviteStatus('idle')
    setAccountInviteError('')
    setMembershipsLoading(true)
    loadMemberships(selected.id).then(() => setMembershipsLoading(false))
  }, [selected?.id])

  async function loadMemberships(customerId: string) {
    const { data } = await supabase
      .from('customer_memberships')
      .select('id, tokens_remaining, purchased_at, expires_at, status, pause_start, pause_end, pause_reason, plan:membership_plans(name, expiry_type)')
      .eq('customer_id', customerId)
      .order('purchased_at', { ascending: false })
    setMemberships((data ?? []) as unknown as ClientMembership[])
  }

  function openMembershipAction(m: ClientMembership) {
    setMembershipActionTarget(m)
    setPauseMode('pause')
    setPauseEndDate('')
    setPauseReason('')
    setMembershipActionError('')
  }

  async function handlePauseMembership() {
    if (!membershipActionTarget || !selected) return
    if (!pauseEndDate) { setMembershipActionError('Choose a resume date.'); return }
    setMembershipActionSaving(true)
    setMembershipActionError('')
    const { error } = await supabase.rpc('pause_membership', {
      p_membership_id: membershipActionTarget.id,
      p_pause_end: new Date(`${pauseEndDate}T23:59:59`).toISOString(),
      p_reason: pauseReason.trim() || null,
    })
    if (error) {
      setMembershipActionError(error.message)
      setMembershipActionSaving(false)
      return
    }
    await loadMemberships(selected.id)
    setMembershipActionTarget(null)
    setMembershipActionSaving(false)
  }

  async function handleSuspendMembership() {
    if (!membershipActionTarget || !selected) return
    setMembershipActionSaving(true)
    setMembershipActionError('')
    const { error } = await supabase.rpc('suspend_membership', {
      p_membership_id: membershipActionTarget.id,
      p_reason: pauseReason.trim() || null,
    })
    if (error) {
      setMembershipActionError(error.message)
      setMembershipActionSaving(false)
      return
    }
    await loadMemberships(selected.id)
    setMembershipActionTarget(null)
    setMembershipActionSaving(false)
  }

  async function handleResumeMembership(id: string) {
    if (!selected) return
    setMembershipActionSaving(true)
    await supabase.rpc('resume_membership', { p_membership_id: id })
    await loadMemberships(selected.id)
    setMembershipActionSaving(false)
  }

  useEffect(() => {
    if (!selected || detailTab !== 'forms') return
    setFormsLoading(true)
    supabase
      .from('form_responses')
      .select('id, form_id, completed_at, expires_at, responses, form:service_forms(title)')
      .eq('customer_id', selected.id)
      .order('completed_at', { ascending: false })
      .then(({ data }) => {
        setClientForms((data ?? []) as unknown as ClientFormResponse[])
        setFormsLoading(false)
      })
  }, [selected?.id, detailTab])

  function openNewClient() {
    setNewClientName('')
    setNewClientEmail('')
    setNewClientPhone('')
    setNewClientDob('')
    setNewClientError('')
    setNewClientOpen(true)
  }

  async function handleCreateClient() {
    if (!newClientName.trim() || !newClientEmail.trim()) {
      setNewClientError('Name and email are required.')
      return
    }
    setNewClientSaving(true)
    setNewClientError('')
    const { data, error } = await supabase
      .from('customers')
      .insert({
        business_id: BUSINESS_ID,
        name: newClientName.trim(),
        email: newClientEmail.trim().toLowerCase(),
        phone: newClientPhone.trim() || null,
        date_of_birth: newClientDob || null,
      })
      .select('id')
      .single()
    if (error) {
      setNewClientError(error.code === '23505' ? 'A client with that email already exists.' : error.message)
      setNewClientSaving(false)
      return
    }
    const rows = await loadClients()
    const created = rows.find(r => r.id === data.id) ?? null
    setSelected(created)
    setNewClientOpen(false)
    setNewClientSaving(false)
    if (created) handleSendAccountInvite(created)
  }

  async function handleSendAccountInvite(client: ClientRow) {
    setAccountInviteSending(true)
    setAccountInviteStatus('idle')
    setAccountInviteError('')
    const { data, error } = await supabase.functions.invoke('invite-customer', {
      body: {
        customer_id: client.id,
        email: client.email,
        redirect_to: `${window.location.origin}/reset-password`,
      },
    })
    if (error || !data?.success) {
      setAccountInviteStatus('error')
      setAccountInviteError((data as { error?: string } | null)?.error ?? error?.message ?? 'Failed to send invite')
    } else {
      setAccountInviteStatus('sent')
      if (data.user_id) {
        setClients(prev => prev.map(c => c.id === client.id ? { ...c, user_id: data.user_id } : c))
        setSelected(prev => prev && prev.id === client.id ? { ...prev, user_id: data.user_id } : prev)
      }
    }
    setAccountInviteSending(false)
  }

  function openEditClient() {
    if (!selected) return
    setEditName(selected.name)
    setEditEmail(selected.email)
    setEditPhone(selected.phone ?? '')
    setEditDob(selected.date_of_birth ?? '')
    setEditError('')
    setEditMode(true)
  }

  async function handleSaveClient() {
    if (!selected) return
    if (!editName.trim() || !editEmail.trim()) { setEditError('Name and email are required.'); return }
    setEditSaving(true)
    setEditError('')
    const patch = { name: editName.trim(), email: editEmail.trim().toLowerCase(), phone: editPhone.trim() || null, date_of_birth: editDob || null }
    const { error } = await supabase.from('customers').update(patch).eq('id', selected.id)
    if (error) {
      setEditError(error.code === '23505' ? 'That email is already used by another client.' : error.message)
    } else {
      setClients(prev => prev.map(c => c.id === selected.id ? { ...c, ...patch } : c))
      setSelected(prev => prev ? { ...prev, ...patch } : null)
      setEditMode(false)
    }
    setEditSaving(false)
  }

  async function handleSaveStaffNotes() {
    if (!selected) return
    setStaffNotesSaving(true)
    const value = staffNotesDraft.trim() || null
    const { error } = await supabase.from('customers').update({ internal_notes: value }).eq('id', selected.id)
    if (!error) {
      setClients(prev => prev.map(c => c.id === selected.id ? { ...c, internal_notes: value } : c))
      setSelected(prev => prev ? { ...prev, internal_notes: value } : null)
    }
    setStaffNotesSaving(false)
  }

  async function openFormResponseView(fr: ClientFormResponse) {
    setViewingFormResponse(fr)
    setViewFormLoading(true)
    const [secRes, fieldRes] = await Promise.all([
      supabase.from('form_sections').select('*').eq('form_id', fr.form_id).order('position'),
      supabase.from('form_fields').select('*').eq('form_id', fr.form_id).order('position'),
    ])
    setViewFormSections((secRes.data ?? []) as Section[])
    setViewFormFields((fieldRes.data ?? []) as FormField[])
    setViewFormLoading(false)
  }

  async function handleBlockClient() {
    if (!selected) return
    setBlocking(true)
    setBlockError('')
    const { error } = await supabase.rpc('block_customer', {
      p_customer_id: selected.id,
      p_reason: blockReason.trim() || null,
    })
    if (error) {
      setBlockError(error.message)
      setBlocking(false)
      return
    }
    const rows = await loadClients()
    setSelected(rows.find((r) => r.id === selected.id) ?? null)
    setBlockModalOpen(false)
    setBlockReason('')
    setBlocking(false)
  }

  async function handleUnblockClient() {
    if (!selected || selected.blockedIds.length === 0) return
    setUnblocking(true)
    const { error } = await supabase.from('blocked_contacts').delete().in('id', selected.blockedIds)
    if (!error) {
      const rows = await loadClients()
      setSelected(rows.find((r) => r.id === selected.id) ?? null)
    }
    setUnblocking(false)
  }

  async function handleDeleteClient() {
    if (!selected) return
    if (deleteConfirmText.trim() !== selected.name) {
      setDeleteError('Please type the client\'s name exactly to confirm.')
      return
    }
    setDeleting(true)
    setDeleteError('')
    const { error } = await supabase.from('customers').delete().eq('id', selected.id)
    if (error) {
      setDeleteError(error.message)
      setDeleting(false)
      return
    }
    setClients((prev) => prev.filter((c) => c.id !== selected.id))
    setSelected(null)
    setDeleteModalOpen(false)
    setDeleteConfirmText('')
    setDeleting(false)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return clients
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q),
    )
  }, [clients, search])

  if (loading) return <FullPageSpinner />

  const now = new Date()
  const selectedUpcoming = selected
    ? selected.bookings.filter((b) => b.status !== 'cancelled' && isBefore(now, parseISO(b.starts_at)))
    : []
  const selectedPast = selected
    ? selected.bookings.filter((b) => b.status === 'cancelled' || !isBefore(now, parseISO(b.starts_at)))
    : []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Clients</h1>
          <span className="text-sm text-gray-400">{clients.length} total</span>
        </div>
        <Button size="sm" onClick={openNewClient}>
          <Plus className="h-4 w-4" /> New Client
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or phone…"
          className="w-full h-10 pl-9 pr-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
        />
      </div>

      {filtered.length === 0 ? (
        <Card padding="md" className="text-center py-12">
          <User className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No clients found.</p>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((client) => (
            <Card
              key={client.id}
              padding="sm"
              hover
              onClick={() => setSelected(client)}
              className="flex items-center gap-4 cursor-pointer"
            >
              {/* Avatar */}
              <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-sm font-semibold text-gray-500">
                {client.name.charAt(0).toUpperCase()}
              </div>

              {/* Name + email */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 truncate">{client.name}</p>
                  {client.blocked && <Badge variant="danger">Blocked</Badge>}
                </div>
                <p className="text-xs text-gray-500 truncate">{client.email}</p>
              </div>

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-6 shrink-0 text-right">
                <div>
                  <p className="text-xs text-gray-400">Visits</p>
                  <p className="text-sm font-semibold text-gray-900">{client.pastCount}</p>
                </div>
                {client.upcomingCount > 0 && (
                  <div>
                    <p className="text-xs text-gray-400">Upcoming</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {client.upcomingCount}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-400">Total spent</p>
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(client.totalSpent)}</p>
                </div>
                {client.lastVisit && (
                  <div className="hidden lg:block">
                    <p className="text-xs text-gray-400">Last visit</p>
                    <p className="text-xs text-gray-600">{format(parseISO(client.lastVisit), 'd MMM yyyy')}</p>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Client detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          selected ? (
            <span className="flex items-center gap-2">
              {selected.name}
              {selected.blocked && <Badge variant="danger">Blocked</Badge>}
            </span>
          ) : ''
        }
        size="lg"
      >
        {selected && (
          <div className="space-y-5">
            {/* Tabs */}
            <div className="flex items-center justify-between border-b border-gray-200 -mt-1">
              <div className="flex gap-1">
                {(['overview', 'forms'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => { setDetailTab(t); setEditMode(false) }}
                    className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                      detailTab === t
                        ? 'border-(--color-primary) text-(--color-primary)'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t === 'overview' ? 'Overview' : 'Completed Forms'}
                  </button>
                ))}
              </div>
              {detailTab === 'overview' && !editMode && (
                <div className="flex items-center gap-1 mb-1">
                  <button
                    onClick={openEditClient}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1.5 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  {selected.blocked ? (
                    <button
                      onClick={handleUnblockClient}
                      disabled={unblocking}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1.5 transition-colors disabled:opacity-50"
                    >
                      <ShieldOff className="h-3.5 w-3.5" /> {unblocking ? 'Unblocking…' : 'Unblock'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setBlockModalOpen(true)}
                      className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1.5 transition-colors"
                    >
                      <Ban className="h-3.5 w-3.5" /> Block
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteModalOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 px-2 py-1.5 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>

            {/* Forms tab */}
            {detailTab === 'forms' && (
              formsLoading ? (
                <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>
              ) : clientForms.length === 0 ? (
                <div className="text-center py-8">
                  <ClipboardList className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No forms completed yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {clientForms.map(fr => {
                    const valid = !isPast(parseISO(fr.expires_at))
                    return (
                      <button
                        key={fr.id}
                        type="button"
                        onClick={() => openFormResponseView(fr)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 text-left transition-colors"
                      >
                        {valid
                          ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                          : <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{fr.form?.title ?? '—'}</p>
                          <p className="text-xs text-gray-500">
                            Completed {format(parseISO(fr.completed_at), 'd MMM yyyy')}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xs font-medium ${valid ? 'text-green-600' : 'text-amber-600'}`}>
                            {valid ? 'Valid' : 'Expired'}
                          </p>
                          <p className="text-xs text-gray-400">
                            {valid ? 'until' : 'was'} {format(parseISO(fr.expires_at), 'd MMM yyyy')}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            )}

            {/* Overview tab */}
            {detailTab === 'overview' && <>
            {editMode ? (
              <div className="space-y-3 border border-gray-200 rounded-xl p-3">
                <Input label="Name" value={editName} onChange={e => setEditName(e.target.value)} required />
                <Input label="Email" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} required />
                <Input label="Phone" type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+44 7700 900000" />
                <Input label="Date of birth" type="date" value={editDob} onChange={e => setEditDob(e.target.value)} />
                {editError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>}
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" size="sm" onClick={() => setEditMode(false)}>
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                  <Button size="sm" loading={editSaving} onClick={handleSaveClient}>Save</Button>
                </div>
              </div>
            ) : (
            /* Contact info */
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="truncate">{selected.email}</span>
              </div>
              {selected.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                  <span>{selected.phone}</span>
                </div>
              )}
              {selected.date_of_birth && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Cake className="h-4 w-4 text-gray-400 shrink-0" />
                  <span>{format(parseISO(selected.date_of_birth), 'd MMMM yyyy')}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <TrendingUp className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="font-semibold text-gray-900">{formatCurrency(selected.totalSpent)} total spent</span>
              </div>
            </div>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total visits', value: selected.pastCount },
                { label: 'Upcoming', value: selected.upcomingCount },
                { label: 'Lifetime value', value: formatCurrency(selected.totalSpent) },
              ].map((stat) => (
                <div key={stat.label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">{stat.label}</p>
                  <p className="font-bold text-gray-900">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Online account — lets the client sign in to My Bookings themselves */}
            <div className="border border-gray-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5" /> Online Account
              </p>
              {selected.user_id ? (
                <p className="text-sm text-green-700 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 shrink-0" /> Has an online account</p>
              ) : (
                <p className="text-sm text-gray-500">No online account yet — they can't sign in to view bookings themselves.</p>
              )}
              <div className="flex items-center gap-3">
                <Button size="sm" variant="secondary" loading={accountInviteSending} onClick={() => handleSendAccountInvite(selected)}>
                  <Mail className="h-3.5 w-3.5" /> {selected.user_id ? 'Resend Setup Email' : 'Send Account Invite'}
                </Button>
                {accountInviteStatus === 'sent' && <span className="text-xs text-green-600">Email sent</span>}
                {accountInviteStatus === 'error' && <span className="text-xs text-red-600">{accountInviteError}</span>}
              </div>
            </div>

            {/* Staff-only notes — never shown to the customer */}
            <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5" /> Staff Notes
              </p>
              <Textarea
                value={staffNotesDraft}
                onChange={(e) => setStaffNotesDraft(e.target.value)}
                placeholder="Only visible to staff — e.g. allergy alerts, preferences, behaviour notes…"
                rows={2}
                className="bg-white"
              />
              {staffNotesDraft !== (selected.internal_notes ?? '') && (
                <div className="flex justify-end">
                  <Button size="sm" loading={staffNotesSaving} onClick={handleSaveStaffNotes}>
                    <Save className="h-3.5 w-3.5" /> Save Note
                  </Button>
                </div>
              )}
            </div>

            {/* Memberships */}
            {membershipsLoading ? (
              <p className="text-xs text-gray-400">Loading memberships…</p>
            ) : memberships.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Memberships
                </h3>
                <div className="space-y-2">
                  {memberships.map((m) => {
                    const expired = !!m.expires_at && isPast(parseISO(m.expires_at))
                    const onHold = membershipOnHold(m)
                    return (
                      <div key={m.id} className={`px-3 py-2.5 rounded-lg border ${expired || onHold ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'} ${expired ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-4">
                          <Ticket className="h-4 w-4 text-gray-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{m.plan?.name ?? '—'}</p>
                            <p className="text-xs text-gray-500">
                              {expired ? 'Expired' : 'Expires'}: {membershipExpiryText(m)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-lg font-bold ${m.tokens_remaining === 0 ? 'text-red-500' : expired ? 'text-gray-400' : 'text-gray-900'}`}>
                              {m.tokens_remaining}
                            </p>
                            <p className="text-xs text-gray-400">sessions left</p>
                          </div>
                          {expired && <Badge variant="default">Expired</Badge>}
                          {!expired && onHold && <Badge variant="warning">{m.status === 'suspended' ? 'Suspended' : 'Paused'}</Badge>}
                        </div>
                        {!expired && (
                          <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
                            <p className="text-xs text-gray-400 truncate">
                              {onHold && m.status === 'paused' && m.pause_end && `Paused until ${format(parseISO(m.pause_end), 'd MMM yyyy')}`}
                              {onHold && m.status === 'suspended' && 'Suspended indefinitely'}
                              {onHold && m.pause_reason && ` · ${m.pause_reason}`}
                            </p>
                            {onHold ? (
                              <button
                                type="button"
                                onClick={() => handleResumeMembership(m.id)}
                                disabled={membershipActionSaving}
                                className="text-xs font-medium text-(--color-primary) hover:underline disabled:opacity-50 shrink-0"
                              >
                                Resume
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openMembershipAction(m)}
                                className="text-xs font-medium text-gray-500 hover:text-gray-700 shrink-0"
                              >
                                Pause / Suspend
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Upcoming bookings */}
            {selectedUpcoming.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Upcoming ({selectedUpcoming.length})
                </h3>
                <div className="space-y-2">
                  {selectedUpcoming.map((b) => (
                    <BookingRow key={b.id} booking={b} onClick={() => setViewingBooking(b)} />
                  ))}
                </div>
              </div>
            )}

            {/* Past bookings */}
            {selectedPast.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  History ({selectedPast.length})
                </h3>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {selectedPast.map((b) => (
                    <BookingRow key={b.id} booking={b} onClick={() => setViewingBooking(b)} />
                  ))}
                </div>
              </div>
            )}

            {selected.bookings.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No bookings yet.</p>
            )}
            </>}
          </div>
        )}
      </Modal>

      {/* Block client modal */}
      <Modal open={blockModalOpen} onClose={() => setBlockModalOpen(false)} title="Block Client" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {selected?.name} won't be able to book again with this email{selected?.phone ? ' or phone number' : ''}, and their upcoming bookings will be cancelled.
          </p>
          <Input label="Reason (optional)" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="e.g. repeated no-shows" />
          {blockError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{blockError}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" onClick={() => setBlockModalOpen(false)}>Cancel</Button>
            <Button size="sm" variant="danger" loading={blocking} onClick={handleBlockClient}>Block Client</Button>
          </div>
        </div>
      </Modal>

      {/* New client modal */}
      <Modal open={newClientOpen} onClose={() => setNewClientOpen(false)} title="New Client" size="sm">
        <div className="space-y-3">
          <Input label="Name" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} required />
          <Input label="Email" type="email" value={newClientEmail} onChange={(e) => setNewClientEmail(e.target.value)} required />
          <Input label="Phone" type="tel" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} placeholder="+44 7700 900000" />
          <Input label="Date of birth" type="date" value={newClientDob} onChange={(e) => setNewClientDob(e.target.value)} />
          {newClientError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{newClientError}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" onClick={() => setNewClientOpen(false)}>Cancel</Button>
            <Button size="sm" loading={newClientSaving} onClick={handleCreateClient}>Create Client</Button>
          </div>
        </div>
      </Modal>

      {/* Delete client modal */}
      <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Client" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            This permanently deletes <strong>{selected?.name}</strong> and all their data — bookings, forms and memberships. This cannot be undone.
          </p>
          <Input
            label={`Type "${selected?.name ?? ''}" to confirm`}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
          />
          {deleteError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              variant="danger"
              loading={deleting}
              disabled={deleteConfirmText.trim() !== selected?.name}
              onClick={handleDeleteClient}
            >
              Delete Permanently
            </Button>
          </div>
        </div>
      </Modal>

      {/* Pause / suspend membership modal */}
      <Modal open={!!membershipActionTarget} onClose={() => setMembershipActionTarget(null)} title="Pause / Suspend Membership" size="sm">
        {membershipActionTarget && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">{membershipActionTarget.plan?.name ?? 'Membership'}</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setPauseMode('pause')}
                className={`flex-1 py-2 font-medium transition-colors ${pauseMode === 'pause' ? 'bg-(--color-primary) text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Pause
              </button>
              <button
                type="button"
                onClick={() => setPauseMode('suspend')}
                className={`flex-1 py-2 font-medium transition-colors ${pauseMode === 'suspend' ? 'bg-(--color-primary) text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Suspend
              </button>
            </div>
            {pauseMode === 'pause' ? (
              <>
                <p className="text-xs text-gray-500">Set the period they won't be charged or able to use this membership — it resumes automatically once this date passes.</p>
                <Input label="Resume on" type="date" value={pauseEndDate} onChange={(e) => setPauseEndDate(e.target.value)} required />
              </>
            ) : (
              <p className="text-xs text-gray-500">Suspends indefinitely with no resume date — use Resume on the client record when it should become usable again.</p>
            )}
            <Input label="Reason (optional)" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} placeholder="e.g. Unwell, resuming in October" />
            {membershipActionError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{membershipActionError}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="secondary" size="sm" onClick={() => setMembershipActionTarget(null)}>Cancel</Button>
              {pauseMode === 'pause' ? (
                <Button size="sm" loading={membershipActionSaving} disabled={!pauseEndDate} onClick={handlePauseMembership}>Pause Membership</Button>
              ) : (
                <Button size="sm" variant="danger" loading={membershipActionSaving} onClick={handleSuspendMembership}>Suspend Membership</Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Read-only appointment detail */}
      <Modal open={!!viewingBooking} onClose={() => setViewingBooking(null)} title="Appointment" size="sm">
        {viewingBooking && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Status', value: <Badge variant={statusBadgeVariant(viewingBooking.status)} className="capitalize">{viewingBooking.status}</Badge> },
                { label: 'Service', value: viewingBooking.service?.name ?? '—' },
                { label: 'Staff', value: viewingBooking.staff?.name ?? '—' },
                { label: 'Date', value: format(parseISO(viewingBooking.starts_at), 'EEE d MMM yyyy') },
                { label: 'Time', value: `${format(parseISO(viewingBooking.starts_at), 'HH:mm')} – ${format(parseISO(viewingBooking.ends_at), 'HH:mm')}` },
                { label: 'Price', value: formatCurrency(viewingBooking.price_override ?? viewingBooking.service?.price ?? 0) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
            {viewingBooking.notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Customer Notes</p>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{viewingBooking.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Read-only completed-form viewer */}
      <Modal open={!!viewingFormResponse} onClose={() => setViewingFormResponse(null)} title={viewingFormResponse?.form?.title ?? 'Completed Form'} size="md">
        {viewingFormResponse && (
          viewFormLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                Completed {format(parseISO(viewingFormResponse.completed_at), "d MMM yyyy 'at' HH:mm")}
              </p>
              {[...viewFormSections].sort((a, b) => a.position - b.position).map(section => {
                const sectionFields = viewFormFields.filter(f => f.section_id === section.id).sort((a, b) => a.position - b.position)
                if (!sectionFields.length) return null
                return (
                  <div key={section.id} className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-1.5">{section.title}</h3>
                    {sectionFields.map(field => (
                      <ResponseValue key={field.id} field={field} responses={viewingFormResponse.responses} />
                    ))}
                  </div>
                )
              })}
            </div>
          )
        )}
      </Modal>
    </div>
  )
}

function ResponseValue({ field, responses }: { field: FormField; responses: ResponseMap }) {
  if (field.field_type === 'heading') {
    return <h4 className="font-semibold text-gray-800 text-sm pt-1">{field.label}</h4>
  }
  const val = responses[field.id]

  if (field.field_type === 'emergency_contact') {
    const ec = (val as { ec_name?: string; ec_phone?: string; ec_relationship?: string }) ?? {}
    return (
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">{field.label}</p>
        <p className="text-sm text-gray-800">
          {ec.ec_name || '—'} {ec.ec_phone && `· ${ec.ec_phone}`} {ec.ec_relationship && `· ${ec.ec_relationship}`}
        </p>
      </div>
    )
  }

  if (field.field_type === 'personal_details') {
    const pd = (val as { pd_name?: string; pd_phone?: string; pd_dob?: string; pd_email?: string }) ?? {}
    return (
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">{field.label}</p>
        <p className="text-sm text-gray-800">
          {pd.pd_name || '—'}
          {pd.pd_phone && ` · ${pd.pd_phone}`}
          {pd.pd_email && ` · ${pd.pd_email}`}
          {pd.pd_dob && ` · ${format(parseISO(pd.pd_dob), 'd MMM yyyy')}`}
        </p>
      </div>
    )
  }

  if (field.field_type === 'signature') {
    const sig = (val as { signature_name?: string; signed_at?: string }) ?? {}
    return (
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">{field.label}</p>
        <p className="text-lg text-gray-800" style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive" }}>{sig.signature_name || '—'}</p>
        {sig.signed_at && <p className="text-xs text-gray-400">Signed {format(parseISO(sig.signed_at), "d MMM yyyy 'at' HH:mm")}</p>}
      </div>
    )
  }

  if (field.field_type === 'multi_select') {
    const selected = Array.isArray(val) ? val : []
    return (
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">{field.label}</p>
        <p className="text-sm text-gray-800">{selected.length ? selected.join(', ') : '—'}</p>
      </div>
    )
  }

  if (field.field_type === 'checkbox') {
    return (
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">{field.label}</p>
        <p className="text-sm text-gray-800">{val ? 'Confirmed' : 'Not confirmed'}</p>
      </div>
    )
  }

  if (field.field_type === 'yes_no') {
    const followUp = responses[`${field.id}_followup`] as string | undefined
    return (
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">{field.label}</p>
        <p className="text-sm text-gray-800 capitalize">{(val as string) || '—'}</p>
        {followUp && <p className="text-xs text-gray-500 mt-0.5">{followUp}</p>}
      </div>
    )
  }

  if (field.field_type === 'date') {
    const raw = val as string | undefined
    return (
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">{field.label}</p>
        <p className="text-sm text-gray-800">{raw ? format(parseISO(raw), 'd MMM yyyy') : '—'}</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{field.label}</p>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{(val as string) || '—'}</p>
    </div>
  )
}

function BookingRow({ booking, onClick }: { booking: Booking; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 py-2 px-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-left transition-colors">
      <CalendarClock className="h-4 w-4 text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{booking.service?.name ?? '—'}</p>
        <p className="text-xs text-gray-500">
          {format(parseISO(booking.starts_at), 'EEE d MMM yyyy, HH:mm')}
          {booking.staff && ` · ${booking.staff.name}`}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-semibold text-gray-900">{formatCurrency(booking.price_override ?? booking.service?.price ?? 0)}</span>
        <Badge variant={statusBadgeVariant(booking.status)} className="capitalize">{booking.status}</Badge>
      </div>
    </button>
  )
}
