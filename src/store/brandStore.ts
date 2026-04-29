import { create } from 'zustand'
import brand, { type BrandConfig } from '@/config/brand'

interface BrandStore {
  config: BrandConfig
  setConfig: (config: BrandConfig) => void
}

export const useBrandStore = create<BrandStore>((set) => ({
  config: { ...brand },
  setConfig: (config) => set({ config }),
}))
