export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'

export interface Business {
  id: string
  name: string
  config: Record<string, unknown>
  created_at: string
}

export type CommissionType = 'percentage' | 'hourly'

export interface Staff {
  id: string
  business_id: string
  name: string
  role: string
  avatar_url: string | null
  bio: string | null
  on_holiday: boolean
  commission_type: CommissionType
  commission_rate: number
}

export type DepositType = 'none' | 'fixed' | 'percentage'

export interface ServiceVariant {
  id: string
  service_id: string
  name: string
  duration_minutes: number
  price: number
  is_active: boolean
  sort_order: number
}

export interface Service {
  id: string
  business_id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number
  category: string
  is_active: boolean
  is_self_service: boolean
  is_group_session: boolean
  max_capacity: number | null
  deposit_type: DepositType
  deposit_value: number
  resource_id: string | null
  pre_buffer_minutes: number
  post_buffer_minutes: number
  commission_type: CommissionType | null
  commission_rate: number | null
  variants?: ServiceVariant[]
  addons?: ServiceAddon[]
}

export interface ServiceAddon {
  id: string
  service_id: string
  name: string
  duration_minutes: number
  price: number
  is_active: boolean
  created_at: string
}

export interface ServiceSession {
  id: string
  business_id: string
  service_id: string
  day_of_week: number
  start_time: string
  is_active: boolean
  created_at: string
}

export interface Availability {
  id: string
  staff_id: string
  day_of_week: number
  start_time: string
  end_time: string
}

export interface Booking {
  id: string
  business_id: string
  customer_id: string
  staff_id: string | null
  service_id: string
  variant_id?: string | null
  starts_at: string
  ends_at: string
  status: BookingStatus
  notes: string | null
  spots_booked?: number
  resource_id?: string | null
  discount_code_id?: string | null
  discount_amount?: number
  gift_voucher_id?: string | null
  gift_voucher_amount?: number
  created_at: string
  staff?: Staff
  service?: Service
  customer?: Customer
}

export interface Customer {
  id: string
  business_id: string
  user_id: string | null
  name: string
  email: string
  phone: string | null
  created_at: string
}

export interface MembershipPlan {
  id: string
  business_id: string
  name: string
  description: string | null
  price: number
  token_count: number
  is_active: boolean
  service_category: string | null
  created_at: string
}

export interface CustomerMembership {
  id: string
  customer_id: string
  plan_id: string
  tokens_remaining: number
  purchased_at: string
  expires_at: string | null
  customer?: { id: string; name: string; email: string }
  plan?: { name: string; token_count: number }
}

export interface BlockedTime {
  id: string
  staff_id: string
  starts_at: string
  ends_at: string
  reason: string | null
}

export interface Resource {
  id: string
  business_id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface GiftVoucher {
  id: string
  business_id: string
  code: string
  initial_value: number
  remaining_value: number
  issued_to: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

export interface DiscountCode {
  id: string
  business_id: string
  code: string
  description: string | null
  type: 'percentage' | 'fixed'
  value: number
  min_order_value: number | null
  expires_at: string | null
  max_uses: number | null
  used_count: number
  is_active: boolean
  created_at: string
}

export interface BookingDraft {
  serviceId: string | null
  variantId: string | null
  variantName: string | null
  variantDuration: number | null
  variantPrice: number | null
  staffId: string | null
  date: Date | null
  timeSlot: string | null
  spotsBooked: number
  customerName: string
  customerEmail: string
  customerPhone: string
  notes: string
}
