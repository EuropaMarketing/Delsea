import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'

interface AuthStore {
  session: Session | null
  user: User | null
  isAdmin: boolean
  isStaff: boolean
  staffId: string | null
  initialized: boolean
  setSession: (session: Session | null) => void
  setAdmin: (isAdmin: boolean) => void
  setStaffInfo: (isStaff: boolean, staffId: string | null) => void
  setInitialized: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  user: null,
  isAdmin: false,
  isStaff: false,
  staffId: null,
  initialized: false,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setAdmin: (isAdmin) => set({ isAdmin }),
  setStaffInfo: (isStaff, staffId) => set({ isStaff, staffId }),
  setInitialized: () => set({ initialized: true }),
}))
