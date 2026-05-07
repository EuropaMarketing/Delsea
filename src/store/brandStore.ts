import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import brand, { type BrandConfig } from '@/config/brand'
import { applyBrandTheme } from '@/lib/theme'

const STORAGE_KEY = 'brand-config'

// Read cache synchronously at module init — runs before first React render
const _hasCachedConfig = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.state?.config) {
        applyBrandTheme(parsed.state.config)
        return true
      }
    }
  } catch {}
  return false
})()

// Exported so App can skip the loading screen on repeat visits
export const hasCachedBrand = _hasCachedConfig

interface BrandStore {
  config: BrandConfig
  setConfig: (config: BrandConfig) => void
}

export const useBrandStore = create<BrandStore>()(
  persist(
    (set) => ({
      config: { ...brand },
      setConfig: (config) => set({ config }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ config: state.config }),
    },
  ),
)
