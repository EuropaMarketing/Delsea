import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

interface Photo {
  id: string
  url: string
  caption: string | null
  sort_order: number
}

export default function AdminPortfolio() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('portfolio_photos')
      .select('id, url, caption, sort_order')
      .eq('business_id', BUSINESS_ID)
      .eq('is_active', true)
      .order('sort_order')
    if (data) setPhotos(data as Photo[])
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    setUploadError('')

    for (const file of files) {
      const ext = file.name.split('.').pop()
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const path = `portfolio/${BUSINESS_ID}/${filename}`

      const { error: upErr } = await supabase.storage
        .from('assets')
        .upload(path, file, { upsert: false })

      if (upErr) { setUploadError(`Upload failed: ${upErr.message}`); continue }

      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(path)

      const { data: photo } = await supabase
        .from('portfolio_photos')
        .insert({ business_id: BUSINESS_ID, url: urlData.publicUrl, sort_order: photos.length })
        .select()
        .single()

      if (photo) setPhotos((prev) => [...prev, photo as Photo])
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this photo from the gallery?')) return
    await supabase.from('portfolio_photos').update({ is_active: false }).eq('id', id)
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Portfolio</h1>
          <p className="text-sm text-gray-500 mt-0.5">Photos shown on your public About page.</p>
        </div>
        <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="h-4 w-4" />
          {uploading ? 'Uploading…' : 'Upload Photos'}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {uploadError && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {uploadError}
        </p>
      )}

      {photos.length === 0 ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center py-20 text-center hover:border-gray-300 transition-colors"
        >
          <Upload className="h-8 w-8 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">Upload your first photos</p>
          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — multiple files supported</p>
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative aspect-square bg-gray-100 rounded-xl overflow-hidden">
              <img src={photo.url} alt={photo.caption ?? ''} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
                <button
                  onClick={() => handleDelete(photo.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 bg-red-600 text-white rounded-full transition-all hover:bg-red-700"
                  aria-label="Remove photo"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center hover:border-gray-300 transition-colors"
            aria-label="Upload more photos"
          >
            <Plus className="h-6 w-6 text-gray-300" />
          </button>
        </div>
      )}
    </div>
  )
}
