import { create } from 'zustand'
import type { BookingDraft, Service, Staff } from '@/types'

interface BookingStore {
  draft: BookingDraft
  services: Service[]
  staff: Staff[]
  setService: (serviceId: string) => void
  setStaff: (staffId: string | null) => void
  setDate: (date: Date) => void
  setTimeSlot: (slot: string) => void
  setCustomer: (fields: Partial<Pick<BookingDraft, 'customerName' | 'customerEmail' | 'customerPhone' | 'notes'>>) => void
  setServices: (services: Service[]) => void
  setStaffList: (staff: Staff[]) => void
  reset: () => void
}

const emptyDraft: BookingDraft = {
  serviceId: null,
  staffId: null,
  date: null,
  timeSlot: null,
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  notes: '',
}

export const useBookingStore = create<BookingStore>((set) => ({
  draft: { ...emptyDraft },
  services: [],
  staff: [],

  setService: (serviceId) =>
    set((s) => ({ draft: { ...s.draft, serviceId, staffId: null, date: null, timeSlot: null } })),

  setStaff: (staffId) =>
    set((s) => ({ draft: { ...s.draft, staffId, date: null, timeSlot: null } })),

  setDate: (date) =>
    set((s) => ({ draft: { ...s.draft, date, timeSlot: null } })),

  setTimeSlot: (timeSlot) =>
    set((s) => ({ draft: { ...s.draft, timeSlot } })),

  setCustomer: (fields) =>
    set((s) => ({ draft: { ...s.draft, ...fields } })),

  setServices: (services) => set({ services }),
  setStaffList: (staff) => set({ staff }),
  reset: () => set({ draft: { ...emptyDraft } }),
}))
