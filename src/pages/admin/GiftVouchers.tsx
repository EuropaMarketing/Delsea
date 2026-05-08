import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Gift, Copy, Check, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { GiftVoucher } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateCode() {
  return Array.from({ length: 10 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

function voucherStatus(v: GiftVoucher): { label: string; variant: 'success' | 'default' | 'danger' } {
  if (!v.is_active) return { label: 'Inactive', variant: 'default' }
  if (v.remaining_value === 0) return { label: 'Used', variant: 'default' }
  if (v.expires_at && new Date(v.expires_at) < new Date()) return { label: 'Expired', variant: 'danger' }
  return { label: 'Active', variant: 'success' }
}

export default function AdminGiftVouchers() {
  const [vouchers, setVouchers] = useState<GiftVoucher[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ code: '', value: '', issuedTo: '', expiresAt: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('gift_vouchers')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .order('created_at', { ascending: false })
    if (data) setVouchers(data as GiftVoucher[])
    setLoading(false)
  }

  function openCreate() {
    setForm({ code: generateCode(), value: '', issuedTo: '', expiresAt: '' })
    setFormError('')
    setCreateOpen(true)
  }

  async function handleCreate() {
    const valuePence = Math.round(parseFloat(form.value) * 100)
    if (!form.code.trim()) { setFormError('Code is required.'); return }
    if (!form.value || isNaN(valuePence) || valuePence <= 0) { setFormError('Enter a valid value greater than £0.'); return }
    setSaving(true)
    setFormError('')
    const { data, error } = await supabase
      .from('gift_vouchers')
      .insert({
        business_id: BUSINESS_ID,
        code: form.code.trim().toUpperCase(),
        initial_value: valuePence,
        remaining_value: valuePence,
        issued_to: form.issuedTo.trim() || null,
        expires_at: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      })
      .select()
      .single()
    if (error) {
      setFormError(error.message.includes('unique') ? 'That code already exists.' : error.message)
    } else {
      setVouchers((prev) => [data as GiftVoucher, ...prev])
      setCreateOpen(false)
    }
    setSaving(false)
  }

  async function toggleActive(v: GiftVoucher) {
    setTogglingId(v.id)
    const { error } = await supabase
      .from('gift_vouchers')
      .update({ is_active: !v.is_active })
      .eq('id', v.id)
    if (!error) setVouchers((prev) => prev.map((x) => x.id === v.id ? { ...x, is_active: !x.is_active } : x))
    setTogglingId(null)
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">Gift Vouchers</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Create Voucher
        </Button>
      </div>
      <p className="text-sm text-gray-500 mb-6">Issue vouchers with a fixed monetary value — redeemable against any booking until the balance reaches £0.</p>

      {vouchers.length === 0 ? (
        <Card padding="md" className="text-center py-16">
          <Gift className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-500 mb-1">No gift vouchers yet</p>
          <p className="text-sm text-gray-400 mb-4">Create your first voucher to get started.</p>
          <Button size="sm" onClick={openCreate}>Create Voucher</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {vouchers.map((v) => {
            const status = voucherStatus(v)
            const pct = v.initial_value > 0 ? Math.round((v.remaining_value / v.initial_value) * 100) : 0
            return (
              <Card key={v.id} padding="md">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Code + copy */}
                  <div className="flex items-center gap-2 min-w-0">
                    <Gift className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="font-mono text-lg font-bold text-gray-900 tracking-wider">{v.code}</span>
                    <button
                      onClick={() => copyCode(v.code)}
                      title="Copy code"
                      className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {copied === v.code ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  {/* Balance */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-500">Balance</span>
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(v.remaining_value)}
                        <span className="text-xs font-normal text-gray-400 ml-1">of {formatCurrency(v.initial_value)}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="text-xs text-gray-400 shrink-0 space-y-0.5 min-w-32">
                    {v.issued_to && <p>Issued to: <span className="text-gray-600">{v.issued_to}</span></p>}
                    {v.expires_at && <p>Expires: <span className="text-gray-600">{format(parseISO(v.expires_at), 'd MMM yyyy')}</span></p>}
                    <p>Created: <span className="text-gray-600">{format(parseISO(v.created_at), 'd MMM yyyy')}</span></p>
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => toggleActive(v)}
                    disabled={togglingId === v.id || v.remaining_value === 0}
                    className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-40 transition-colors shrink-0"
                  >
                    {v.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Gift Voucher" size="sm">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Voucher Code</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="flex-1 h-10 px-3 text-sm font-mono font-bold border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) uppercase tracking-widest"
                placeholder="GIFTCODE"
                maxLength={20}
              />
              <button
                onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                title="Generate random code"
                className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
          <Input
            label="Value (£)"
            type="number"
            min="0.01"
            step="0.01"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            placeholder="50.00"
            required
          />
          <Input
            label="Issued to (optional)"
            value={form.issuedTo}
            onChange={(e) => setForm((f) => ({ ...f, issuedTo: e.target.value }))}
            placeholder="Customer name or note"
          />
          <Input
            label="Expiry date (optional)"
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
          />
          {formError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{formError}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Create Voucher</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
