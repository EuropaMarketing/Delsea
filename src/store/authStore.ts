import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'

interface AuthStore {
  session: Session | null
  user: User | null
  isAdmin: boolean
  initialized: boolean
  setSession: (session: Session | null) => void
  setAdmin: (isAdmin: boolean) => void
  setInitialized: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  user: null,
  isAdmin: false,
  initialized: false,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setAdmin: (isAdmin) => set({ isAdmin }),
  setInitialized: () => set({ initialized: true }),
}))
