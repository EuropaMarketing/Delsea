import { useEffect, useState, useMemo } from 'react'
import { format, parseISO, isBefore, isPast } from 'date-fns'
import { Search, CalendarClock, User, Mail, Phone, TrendingUp, Ticket, ClipboardList, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Customer, MembershipExpiryType } from '@/types'

type ClientFormResponse = {
  id: string
  completed_at: string
  expires_at: string
  form: { title: string } | null
}

type ClientMembership = {
  id: string
  tokens_remaining: number
  purchased_at: string
  expires_at: string | null
  plan: { name: string; expiry_type: MembershipExpiryType } | null
}

function membershipExpiryText(m: ClientMembership): string {
  if (m.expires_at) return format(parseISO(m.expires_at), 'd MMM yyyy')
  if (m.plan?.expiry_type === 'until_cancelled') return 'Until cancelled'
  return 'No expiry'
}

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type Booking = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  service: { name: string; price: number } | null
  staff: { name: string } | null
}

type ClientRow = Customer & {
  bookings: Booking[]
  totalSpent: number
  upcomingCount: number
  pastCount: number
  lastVisit: string | null
}

export default function AdminClients() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ClientRow | null>(null)
  const [memberships, setMemberships] = useState<ClientMembership[]>([])
  const [membershipsLoading, setMembershipsLoading] = useState(false)
  const [detailTab, setDetailTab] = useState<'overview' | 'forms'>('overview')
  const [clientForms, setClientForms] = useState<ClientFormResponse[]>([])
  const [formsLoading, setFormsLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const [custRes, bkRes] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .eq('business_id', BUSINESS_ID)
          .order('name'),
        supabase
          .from('bookings')
          .select('id, customer_id, starts_at, ends_at, status, service:services(name, price), staff:staff(name)')
          .eq('business_id', BUSINESS_ID)
          .order('starts_at', { ascending: false }),
      ])

      const customers = (custRes.data ?? []) as Customer[]
      const bookings = (bkRes.data ?? []) as unknown as (Booking & { customer_id: string })[]
      const now = new Date()

      const rows: ClientRow[] = customers.map((c) => {
        const cBks = bookings.filter((b) => b.customer_id === c.id)
        const nonCancelled = cBks.filter((b) => b.status !== 'cancelled')
        const totalSpent = nonCancelled.reduce((sum, b) => sum + (b.service?.price ?? 0), 0)
        const upcoming = nonCancelled.filter((b) => isBefore(now, parseISO(b.starts_at)))
        const past = nonCancelled.filter((b) => !isBefore(now, parseISO(b.starts_at)))
        const lastVisit = past[0]?.starts_at ?? null
        return {
          ...c,
          bookings: cBks,
          totalSpent,
          upcomingCount: upcoming.length,
          pastCount: past.length,
          lastVisit,
        }
      })

      setClients(rows)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!selected) {
      setMemberships([])
      setClientForms([])
      setDetailTab('overview')
      return
    }
    setMembershipsLoading(true)
    supabase
      .from('customer_memberships')
      .select('id, tokens_remaining, purchased_at, expires_at, plan:membership_plans(name, expiry_type)')
      .eq('customer_id', selected.id)
      .order('purchased_at', { ascending: false })
      .then(({ data }) => {
        setMemberships((data ?? []) as unknown as ClientMembership[])
        setMembershipsLoading(false)
      })
  }, [selected?.id])

  useEffect(() => {
    if (!selected || detailTab !== 'forms') return
    setFormsLoading(true)
    supabase
      .from('form_responses')
      .select('id, completed_at, expires_at, form:service_forms(title)')
      .eq('customer_id', selected.id)
      .order('completed_at', { ascending: false })
      .then(({ data }) => {
        setClientForms((data ?? []) as unknown as ClientFormResponse[])
        setFormsLoading(false)
      })
  }, [selected?.id, detailTab])

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
        <h1 className="text-xl font-bold text-gray-900">Clients</h1>
        <span className="text-sm text-gray-400">{clients.length} total</span>
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
                <p className="font-semibold text-gray-900 truncate">{client.name}</p>
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
        title={selected?.name ?? ''}
        size="lg"
      >
        {selected && (
          <div className="space-y-5">
            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-200 -mt-1">
              {(['overview', 'forms'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setDetailTab(t)}
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
                      <div key={fr.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-white">
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
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {/* Overview tab */}
            {detailTab === 'overview' && <>
            {/* Contact info */}
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
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <TrendingUp className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="font-semibold text-gray-900">{formatCurrency(selected.totalSpent)} total spent</span>
              </div>
            </div>

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
                    return (
                      <div key={m.id} className={`flex items-center gap-4 px-3 py-2.5 rounded-lg border ${expired ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200'}`}>
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
                    <BookingRow key={b.id} booking={b} />
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
                    <BookingRow key={b.id} booking={b} />
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
    </div>
  )
}

function BookingRow({ booking }: { booking: Booking }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg text-sm">
      <CalendarClock className="h-4 w-4 text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{booking.service?.name ?? '—'}</p>
        <p className="text-xs text-gray-500">
          {format(parseISO(booking.starts_at), 'EEE d MMM yyyy, HH:mm')}
          {booking.staff && ` · ${booking.staff.name}`}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-semibold text-gray-900">{formatCurrency(booking.service?.price ?? 0)}</span>
        <Badge variant={statusBadgeVariant(booking.status)} className="capitalize">{booking.status}</Badge>
      </div>
    </div>
  )
}
