import { useEffect, useState } from 'react'
import { Eye, EyeOff, Plus, Star, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Staff } from '@/types'

const BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID as string

interface Review {
  id: string
  staff_id: string | null
  reviewer_name: string
  rating: number
  comment: string | null
  is_approved: boolean
  created_at: string
  staff: { name: string } | null
}

interface ReviewForm {
  reviewer_name: string
  staff_id: string
  rating: number
  comment: string
}

const emptyForm: ReviewForm = { reviewer_name: '', staff_id: '', rating: 5, comment: '' }

export default function AdminReviews() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [staffList, setStaffList] = useState<Pick<Staff, 'id' | 'name'>[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ReviewForm>(emptyForm)

  useEffect(() => { load() }, [])

  async function load() {
    const [rRes, sRes] = await Promise.all([
      supabase
        .from('staff_reviews')
        .select('*, staff:staff_id(name)')
        .eq('business_id', BUSINESS_ID)
        .order('created_at', { ascending: false }),
      supabase
        .from('staff')
        .select('id, name')
        .eq('business_id', BUSINESS_ID)
        .order('name'),
    ])
    if (rRes.data) setReviews(rRes.data as unknown as Review[])
    if (sRes.data) setStaffList(sRes.data as Pick<Staff, 'id' | 'name'>[])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.reviewer_name.trim()) return
    setSaving(true)
    const { data } = await supabase
      .from('staff_reviews')
      .insert({
        business_id: BUSINESS_ID,
        reviewer_name: form.reviewer_name,
        staff_id: form.staff_id || null,
        rating: form.rating,
        comment: form.comment || null,
        is_approved: true,
      })
      .select('*, staff:staff_id(name)')
      .single()
    if (data) setReviews((prev) => [data as unknown as Review, ...prev])
    setSaving(false)
    setModalOpen(false)
    setForm(emptyForm)
  }

  async function handleToggle(id: string, current: boolean) {
    await supabase.from('staff_reviews').update({ is_approved: !current }).eq('id', id)
    setReviews((prev) => prev.map((r) => r.id === id ? { ...r, is_approved: !current } : r))
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this review?')) return
    await supabase.from('staff_reviews').delete().eq('id', id)
    setReviews((prev) => prev.filter((r) => r.id !== id))
  }

  const avgRating = reviews.filter(r => r.is_approved).length
    ? (reviews.filter(r => r.is_approved).reduce((s, r) => s + r.rating, 0) / reviews.filter(r => r.is_approved).length).toFixed(1)
    : null

  if (loading) return <FullPageSpinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reviews</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {avgRating
              ? `${avgRating} ★ average across ${reviews.filter(r => r.is_approved).length} published review${reviews.filter(r => r.is_approved).length !== 1 ? 's' : ''}`
              : 'Shown on your public About page.'}
          </p>
        </div>
        <Button size="sm" onClick={() => { setForm(emptyForm); setModalOpen(true) }}>
          <Plus className="h-4 w-4" />
          Add Review
        </Button>
      </div>

      <div className="space-y-2">
        {reviews.length === 0 && (
          <p className="text-center text-gray-400 py-16 text-sm">No reviews yet. Add your first one.</p>
        )}
        {reviews.map((review) => (
          <Card
            key={review.id}
            padding="sm"
            className={`flex items-start gap-4 transition-opacity ${!review.is_approved ? 'opacity-50' : ''}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="font-semibold text-sm text-gray-900">{review.reviewer_name}</p>
                {review.staff && (
                  <span className="text-xs text-gray-400">for {review.staff.name}</span>
                )}
                {!review.is_approved && (
                  <span className="text-xs text-gray-400 italic">hidden</span>
                )}
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3 w-3 ${i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`}
                    />
                  ))}
                </div>
              </div>
              {review.comment && (
                <p className="text-xs text-gray-500 line-clamp-2">{review.comment}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleToggle(review.id, review.is_approved)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title={review.is_approved ? 'Hide from public' : 'Publish'}
              >
                {review.is_approved ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
              <button
                onClick={() => handleDelete(review.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Review">
        <div className="space-y-4">
          <Input
            label="Reviewer Name"
            required
            value={form.reviewer_name}
            onChange={(e) => setForm((f) => ({ ...f, reviewer_name: e.target.value }))}
            placeholder="Jane Smith"
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Team Member (optional)</label>
            <select
              value={form.staff_id}
              onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}
              className="w-full h-10 px-3 text-sm border border-gray-200 bg-white rounded-lg outline-none focus:ring-2 focus:ring-(--color-primary)"
            >
              <option value="">General / Business</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, rating: n }))}
                  className="p-0.5"
                >
                  <Star
                    className={`h-7 w-7 transition-colors ${
                      n <= form.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200 hover:text-amber-200'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="Comment (optional)"
            value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
            placeholder="What did they say about their experience?"
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave}>Add Review</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
