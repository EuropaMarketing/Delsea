import { useState, useEffect } from 'react'
import brand, { type BrandConfig, type BorderRadius } from '@/config/brand'
import { applyBrandTheme } from '@/lib/theme'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string
const RADIUS_OPTIONS: BorderRadius[] = ['none', 'sm', 'md', 'lg', 'full']

export default function AdminSettings() {
  const [config, setConfig] = useState<BrandConfig>({ ...brand })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Load saved config from the database on mount
  useEffect(() => {
    supabase
      .from('businesses')
      .select('config')
      .eq('id', BUSINESS_ID)
      .single()
      .then(({ data }) => {
        if (data?.config) setConfig({ ...brand, ...data.config })
      })
  }, [])

  function handleChange<K extends keyof BrandConfig>(key: K, value: BrandConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }))
    setSaved(false)
    setSaveError('')
  }

  function handlePreview() {
    applyBrandTheme(config)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    applyBrandTheme(config)

    const { error } = await supabase
      .from('businesses')
      .update({ config })
      .eq('id', BUSINESS_ID)

    setSaving(false)
    if (error) {
      setSaveError('Failed to save. Please try again.')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure your brand. Changes apply live — save to persist across all devices and deployments.
        </p>
      </div>

      <div className="space-y-6">
        {/* Business */}
        <Card padding="md">
          <h2 className="font-semibold text-gray-900 mb-4">Business Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Business Name" value={config.brandName} onChange={(e) => handleChange('brandName', e.target.value)} />
            <Input label="Business Email" type="email" value={config.businessEmail} onChange={(e) => handleChange('businessEmail', e.target.value)} />
            <Input label="Logo URL" value={config.logo} onChange={(e) => handleChange('logo', e.target.value)} placeholder="/logo.svg" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Currency" value={config.currency} onChange={(e) => handleChange('currency', e.target.value)} placeholder="GBP" />
              <Input label="Locale" value={config.locale} onChange={(e) => handleChange('locale', e.target.value)} placeholder="en-GB" />
            </div>
          </div>
        </Card>

        {/* Branding */}
        <Card padding="md">
          <h2 className="font-semibold text-gray-900 mb-4">Brand Colours & Typography</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Primary Colour</label>
              <div className="flex gap-2">
                <input type="color" value={config.primaryColour} onChange={(e) => handleChange('primaryColour', e.target.value)} className="h-10 w-14 cursor-pointer border border-gray-200 rounded-md p-0.5" />
                <Input value={config.primaryColour} onChange={(e) => handleChange('primaryColour', e.target.value)} className="flex-1" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Secondary Colour</label>
              <div className="flex gap-2">
                <input type="color" value={config.secondaryColour} onChange={(e) => handleChange('secondaryColour', e.target.value)} className="h-10 w-14 cursor-pointer border border-gray-200 rounded-md p-0.5" />
                <Input value={config.secondaryColour} onChange={(e) => handleChange('secondaryColour', e.target.value)} className="flex-1" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Background Colour</label>
              <div className="flex gap-2">
                <input type="color" value={config.backgroundColour} onChange={(e) => handleChange('backgroundColour', e.target.value)} className="h-10 w-14 cursor-pointer border border-gray-200 rounded-md p-0.5" />
                <Input value={config.backgroundColour} onChange={(e) => handleChange('backgroundColour', e.target.value)} className="flex-1" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Text Colour</label>
              <div className="flex gap-2">
                <input type="color" value={config.textColour} onChange={(e) => handleChange('textColour', e.target.value)} className="h-10 w-14 cursor-pointer border border-gray-200 rounded-md p-0.5" />
                <Input value={config.textColour} onChange={(e) => handleChange('textColour', e.target.value)} className="flex-1" />
              </div>
            </div>
            <Input label="Font Family" value={config.fontFamily} onChange={(e) => handleChange('fontFamily', e.target.value)} placeholder="'Inter', system-ui, sans-serif" />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Border Radius</label>
              <div className="flex gap-2 flex-wrap">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => handleChange('borderRadius', r)}
                    className={`px-3 py-1.5 text-xs font-medium border rounded-full transition-colors ${
                      config.borderRadius === r
                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Social */}
        <Card padding="md">
          <h2 className="font-semibold text-gray-900 mb-4">Social Links</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Instagram"
              value={config.socialLinks?.instagram ?? ''}
              onChange={(e) => handleChange('socialLinks', { ...config.socialLinks, instagram: e.target.value || undefined })}
              placeholder="https://instagram.com/…"
            />
            <Input
              label="Facebook"
              value={config.socialLinks?.facebook ?? ''}
              onChange={(e) => handleChange('socialLinks', { ...config.socialLinks, facebook: e.target.value || undefined })}
              placeholder="https://facebook.com/…"
            />
            <Input
              label="TikTok"
              value={config.socialLinks?.tiktok ?? ''}
              onChange={(e) => handleChange('socialLinks', { ...config.socialLinks, tiktok: e.target.value || undefined })}
              placeholder="https://tiktok.com/@…"
            />
          </div>
        </Card>

        {/* Preview */}
        <Card padding="md" className="bg-gray-50">
          <h2 className="font-semibold text-gray-900 mb-4">Live Preview</h2>
          <div className="flex flex-wrap gap-3 items-center">
            <button className="btn-primary px-5 py-2.5 text-sm font-medium">Primary Button</button>
            <button className="px-5 py-2.5 text-sm font-medium bg-white border border-gray-200 brand-card text-gray-700">Secondary</button>
            <Badge variant="brand">Category Tag</Badge>
            <span className="font-bold brand-text-primary">Accent Text</span>
          </div>
          <div className="mt-3 p-3 bg-white border border-gray-200 brand-card">
            <p className="text-sm" style={{ fontFamily: config.fontFamily, color: config.textColour }}>
              The quick brown fox jumps over the lazy dog.
            </p>
          </div>
        </Card>

        {saveError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{saveError}</p>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={handlePreview}>
            Preview Changes
          </Button>
          <Button loading={saving} onClick={handleSave}>
            {saved ? '✓ Saved!' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
