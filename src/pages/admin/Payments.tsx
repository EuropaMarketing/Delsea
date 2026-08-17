import { useEffect, useState } from 'react'
import { CreditCard, CheckCircle2, XCircle, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Input, PasswordInput } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

type Provider = 'none' | 'sumup'

export default function AdminPayments() {
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState<Provider>('none')
  const [apiKey, setApiKey] = useState('')
  const [merchantCode, setMerchantCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('business_payment_settings')
        .select('provider, sumup_api_key, sumup_merchant_code')
        .eq('business_id', BUSINESS_ID)
        .maybeSingle()
      if (data) {
        setProvider(data.provider as Provider)
        setApiKey(data.sumup_api_key ?? '')
        setMerchantCode(data.sumup_merchant_code ?? '')
      }
      setLoading(false)
    }
    load()
  }, [])

  const isConnected = provider === 'sumup' && apiKey.trim() !== '' && merchantCode.trim() !== ''

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    const { error } = await supabase
      .from('business_payment_settings')
      .upsert({
        business_id: BUSINESS_ID,
        provider,
        sumup_api_key: apiKey.trim() || null,
        sumup_merchant_code: merchantCode.trim() || null,
        updated_at: new Date().toISOString(),
      })
    setSaving(false)
    if (error) {
      console.error('business_payment_settings upsert failed:', error)
      setSaveError(error.message || 'Failed to save. Please try again.')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-gray-600 rounded-full" /></div>

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Payments</h1>
        <p className="text-sm text-gray-500 mt-0.5">Connect your own card payment provider. Each business uses its own account — nothing is shared.</p>
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">SumUp</h2>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
            isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {isConnected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        <label className="flex items-start gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={provider === 'sumup'}
            onChange={e => setProvider(e.target.checked ? 'sumup' : 'none')}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-(--color-primary) shrink-0"
          />
          <span className="text-sm text-gray-700">
            Take online card payments through SumUp
            <span className="block text-xs text-gray-400 mt-0.5">
              Find your API key and merchant code in your own SumUp dashboard under Settings → API.
            </span>
          </span>
        </label>

        {provider === 'sumup' && (
          <div className="space-y-3 mb-4">
            <PasswordInput
              label="API key"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setSaved(false) }}
              placeholder="sup_sk_••••••••••••••••"
            />
            <Input
              label="Merchant code"
              value={merchantCode}
              onChange={e => { setMerchantCode(e.target.value); setSaved(false) }}
              placeholder="e.g. MC12ABC34"
            />
          </div>
        )}

        {provider === 'none' && (
          <p className="text-xs text-gray-400 mb-4">
            Without a connected provider, customers can still book online — payment will simply be arranged directly with you instead of collected at checkout.
          </p>
        )}

        {saveError && <p className="text-xs text-red-500 mb-3">{saveError}</p>}

        <div className="flex items-center gap-3">
          <Button size="sm" loading={saving} onClick={handleSave}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
          {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
        </div>
      </Card>
    </div>
  )
}
