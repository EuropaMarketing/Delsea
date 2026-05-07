import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Tag, Plus, ToggleLeft, ToggleRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/currency'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { DiscountCode } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

const emptyForm = {
  code: '',
  description: '',
  type: 'percentage' as 'percentage' | 'fixed',
  value: '',
  min_order_value: '',
  expires_at: '',
  max_uses: '',
}

export default function AdminDiscounts() {
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('discount_codes')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setCodes(data as DiscountCode[])
        setLoading(false)
      })
  }, [])

  function openCreate() {
    setForm({ ...emptyForm })
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.code.trim()) { setError('Code is required'); return }
    if (!form.value || isNaN(Number(form.value)) || Number(form.value) <= 0) { setError('Value must be a positive number'); return }
    if (form.type === 'percentage' && Number(form.value) > 100) { setError('Percentage cannot exceed 100'); return }

    setSaving(true)
    setError('')
    const { data, error: err } = await supabase
      .from('discount_codes')
      .insert({
        business_id: BUSINESS_ID,
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || null,
        type: form.type,
        value: Number(form.value),
        min_order_value: form.min_order_value ? Number(form.min_order_value) : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
      })
      .select()
      .single()
    if (err) {
      setError(err.message.includes('unique') ? 'That code already exists.' : err.message)
    } else {
      setCodes(prev => [data as DiscountCode, ...prev])
      setModalOpen(false)
    }
    setSaving(false)
  }

  async function toggleActive(code: DiscountCode) {
    const { error: err } = await supabase
      .from('discount_codes')
      .update({ is_active: !code.is_active })
      .eq('id', code.id)
    if (!err) setCodes(prev => prev.map(c => c.id === code.id ? { ...c, is_active: !code.is_active } : c))
  }

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discount Codes</h1>
          <p className="text-sm text-gray-500 mt-1">Create codes that clients can apply at checkout.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Code
        </Button>
      </div>

      {codes.length === 0 ? (
        <Card padding="md" className="text-center py-16">
          <Tag className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-gray-500">No discount codes yet.</p>
          <Button className="mt-4" onClick={openCreate}>Create your first code</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {codes.map(code => (
            <Card key={code.id} padding="md">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-gray-900 text-sm tracking-wide">{code.code}</span>
                    <Badge variant={code.is_active ? 'success' : 'neutral'}>
                      {code.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                      {code.type === 'percentage' ? `${code.value}% off` : `${formatCurrency(code.value)} off`}
                    </span>
                  </div>
                  {code.description && <p className="text-xs text-gray-500 mt-1">{code.description}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                    {code.min_order_value && <span>Min order: {formatCurrency(code.min_order_value)}</span>}
                    {code.max_uses && <span>Uses: {code.used_count}/{code.max_uses}</span>}
                    {!code.max_uses && <span>Uses: {code.used_count} (unlimited)</span>}
                    {code.expires_at && (
                      <span>Expires: {format(parseISO(code.expires_at), 'd MMM yyyy')}</span>
                    )}
                    {!code.expires_at && <span>No expiry</span>}
                    <span>Created {format(parseISO(code.created_at), 'd MMM yyyy')}</span>
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(code)}
                  className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                  title={code.is_active ? 'Deactivate' : 'Activate'}
                >
                  {code.is_active
                    ? <ToggleRight className="h-6 w-6" style={{ color: 'var(--color-primary)' }} />
                    : <ToggleLeft className="h-6 w-6" />
                  }
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Discount Code" size="md">
        <div className="space-y-4">
          <Input
            label="Code"
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="SUMMER20"
            required
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Summer promotion"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as 'percentage' | 'fixed' }))}
                className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed amount (£)</option>
              </select>
            </div>
            <Input
              label={form.type === 'percentage' ? 'Discount %' : 'Discount £'}
              type="number"
              min="0.01"
              max={form.type === 'percentage' ? '100' : undefined}
              step="0.01"
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              required
              placeholder={form.type === 'percentage' ? '20' : '10.00'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Minimum order (£, optional)"
              type="number"
              min="0"
              step="0.01"
              value={form.min_order_value}
              onChange={e => setForm(f => ({ ...f, min_order_value: e.target.value }))}
              placeholder="50.00"
            />
            <Input
              label="Max uses (optional)"
              type="number"
              min="1"
              step="1"
              value={form.max_uses}
              onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
              placeholder="Unlimited"
            />
          </div>

          <Input
            label="Expiry date (optional)"
            type="date"
            value={form.expires_at}
            onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
          />

          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>Create Code</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
