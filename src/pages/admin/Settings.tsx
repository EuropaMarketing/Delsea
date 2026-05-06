import { useState, useEffect, useRef } from 'react'
import { Upload, ImageIcon } from 'lucide-react'
import { Textarea } from '@/components/ui/Input'
import brand, { type BrandConfig, type BorderRadius, type OpeningHoursEntry, DEFAULT_OPENING_HOURS } from '@/config/brand'
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
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load saved config from the database on mount
  useEffect(() => {
    supabase
      .from('businesses')
      .select('config')
      .eq('id', BUSINESS_ID)
      .single()
      .then(({ data }) => {
        if (data?.config) {
        const merged = { ...brand, ...data.config } as BrandConfig
        if (!merged.openingHours) merged.openingHours = DEFAULT_OPENING_HOURS
        setConfig(merged)
      }
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

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    setLogoError('')

    const ext = file.name.split('.').pop()
    const path = `logos/${BUSINESS_ID}/logo.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setLogoError(`Upload failed: ${uploadError.message}`)
      setLogoUploading(false)
      return
    }

    const { data } = supabase.storage.from('assets').getPublicUrl(path)
    handleChange('logo', data.publicUrl)
    setLogoUploading(false)
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
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Logo</label>
              <div className="flex items-center gap-3">
                <div className="h-12 w-20 border border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden">
                  {config.logo ? (
                    <img src={config.logo} alt="Logo" className="h-full w-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-gray-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={logoUploading}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    {logoUploading ? 'Uploading…' : 'Choose image'}
                  </button>
                  {config.logo && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{config.logo.split('/').pop()}</p>
                  )}
                  {logoError && <p className="text-xs text-red-500 mt-1">{logoError}</p>}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
            </div>
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
                        ? 'bg-(--color-primary) text-white border-(--color-primary)'
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

        {/* About */}
        <Card padding="md">
          <h2 className="font-semibold text-gray-900 mb-1">About</h2>
          <p className="text-xs text-gray-500 mb-4">Shown in the About section of your public page.</p>
          <Textarea
            label="About text"
            value={config.aboutText ?? ''}
            onChange={(e) => handleChange('aboutText', e.target.value || undefined)}
            placeholder="Tell clients about your business, your story, and what makes you special…"
            rows={5}
          />
        </Card>

        {/* Opening Hours */}
        <Card padding="md">
          <h2 className="font-semibold text-gray-900 mb-1">Opening Hours</h2>
          <p className="text-xs text-gray-500 mb-4">Displayed on your public About page.</p>
          <div className="space-y-2">
            {(config.openingHours ?? DEFAULT_OPENING_HOURS).map((entry, i) => (
              <div key={entry.day} className="grid grid-cols-[80px_1fr_1fr_auto] items-center gap-2">
                <span className="text-sm font-medium text-gray-700">{entry.day.slice(0, 3)}</span>
                <input
                  type="time"
                  value={entry.open}
                  disabled={entry.closed}
                  onChange={(e) => {
                    const hours = [...(config.openingHours ?? DEFAULT_OPENING_HOURS)]
                    hours[i] = { ...hours[i], open: e.target.value }
                    handleChange('openingHours', hours)
                  }}
                  className="h-9 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-40 disabled:bg-gray-50"
                />
                <input
                  type="time"
                  value={entry.close}
                  disabled={entry.closed}
                  onChange={(e) => {
                    const hours = [...(config.openingHours ?? DEFAULT_OPENING_HOURS)]
                    hours[i] = { ...hours[i], close: e.target.value }
                    handleChange('openingHours', hours)
                  }}
                  className="h-9 px-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-40 disabled:bg-gray-50"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={entry.closed}
                    onChange={(e) => {
                      const hours = [...(config.openingHours ?? DEFAULT_OPENING_HOURS)]
                      hours[i] = { ...hours[i], closed: e.target.checked }
                      handleChange('openingHours', hours)
                    }}
                    className="accent-(--color-primary)"
                  />
                  Closed
                </label>
              </div>
            ))}
          </div>
        </Card>

        {/* Location */}
        <Card padding="md">
          <h2 className="font-semibold text-gray-900 mb-1">Location</h2>
          <p className="text-xs text-gray-500 mb-4">Shown on your public About page.</p>
          <div className="space-y-4">
            <Textarea
              label="Address"
              value={config.address ?? ''}
              onChange={(e) => handleChange('address', e.target.value || undefined)}
              placeholder={'123 High Street\nLondon\nSW1A 1AA'}
              rows={3}
            />
            <Input
              label="Map embed URL"
              value={config.mapEmbedUrl ?? ''}
              onChange={(e) => handleChange('mapEmbedUrl', e.target.value || undefined)}
              placeholder="https://www.google.com/maps/embed?pb=…"
            />
            <p className="text-xs text-gray-400">
              In Google Maps: Share → Embed a map → copy the <code className="bg-gray-100 px-1 rounded">src</code> value from the iframe code.
            </p>
          </div>
        </Card>

        {/* Booking Policies */}
        <Card padding="md">
          <h2 className="font-semibold text-gray-900 mb-1">Booking Policies</h2>
          <p className="text-xs text-gray-500 mb-4">
            These appear on the checkout screen before every booking. Plain text only.
          </p>
          <div className="space-y-4">
            <Textarea
              label="Cancellation Policy"
              value={config.cancellationPolicy ?? ''}
              onChange={(e) => handleChange('cancellationPolicy', e.target.value || undefined)}
              placeholder="e.g. Cancellations made less than 24 hours before your appointment will incur a 50% charge."
              rows={3}
            />
            <Textarea
              label="Important Information"
              value={config.importantInfo ?? ''}
              onChange={(e) => handleChange('importantInfo', e.target.value || undefined)}
              placeholder="e.g. Please arrive 10 minutes early. Wear comfortable clothing. Avoid eating a heavy meal beforehand."
              rows={3}
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
