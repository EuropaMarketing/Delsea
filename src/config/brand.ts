export type BorderRadius = 'none' | 'sm' | 'md' | 'lg' | 'full'

export interface SocialLinks {
  instagram?: string
  facebook?: string
  tiktok?: string
}

export interface OpeningHoursEntry {
  day: string
  open: string
  close: string
  closed: boolean
}

export const DEFAULT_OPENING_HOURS: OpeningHoursEntry[] = [
  { day: 'Monday',    open: '09:00', close: '17:00', closed: false },
  { day: 'Tuesday',   open: '09:00', close: '17:00', closed: false },
  { day: 'Wednesday', open: '09:00', close: '17:00', closed: false },
  { day: 'Thursday',  open: '09:00', close: '17:00', closed: false },
  { day: 'Friday',    open: '09:00', close: '17:00', closed: false },
  { day: 'Saturday',  open: '10:00', close: '16:00', closed: false },
  { day: 'Sunday',    open: '10:00', close: '16:00', closed: true  },
]

export interface BrandConfig {
  brandName: string
  logo: string
  primaryColour: string
  secondaryColour: string
  backgroundColour: string
  textColour: string
  fontFamily: string
  borderRadius: BorderRadius
  buttonRadius?: BorderRadius
  currency: string
  locale: string
  businessEmail: string
  heroImage?: string
  socialLinks?: SocialLinks
  cancellationPolicy?: string
  importantInfo?: string
  aboutText?: string
  openingHours?: OpeningHoursEntry[]
  address?: string
  mapEmbedUrl?: string
  googleReviewUrl?: string
  bookingWindowDays?: number
  minNoticeHours?: number
}

export const DEFAULT_BOOKING_WINDOW_DAYS = 60
export const DEFAULT_MIN_NOTICE_HOURS = 1

export const BOOKING_WINDOW_OPTIONS: { value: number; label: string }[] = [
  { value: 7,   label: '1 week' },
  { value: 14,  label: '2 weeks' },
  { value: 30,  label: '1 month' },
  { value: 42,  label: '6 weeks' },
  { value: 60,  label: '2 months' },
  { value: 90,  label: '3 months' },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year' },
]

export const MIN_NOTICE_OPTIONS: { value: number; label: string }[] = [
  { value: 0,  label: 'No minimum' },
  { value: 0.5, label: '30 minutes' },
  { value: 1,  label: '1 hour' },
  { value: 2,  label: '2 hours' },
  { value: 4,  label: '4 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
  { value: 48, label: '48 hours' },
]

const brand: BrandConfig = {
  brandName: 'Delséa',
  logo: '/logo.svg',
  primaryColour: '#7C3AED',
  secondaryColour: '#F59E0B',
  backgroundColour: '#FAFAFA',
  textColour: '#111827',
  fontFamily: "'Inter', system-ui, sans-serif",
  borderRadius: 'lg',
  currency: 'GBP',
  locale: 'en-GB',
  businessEmail: 'hello@luxestudios.com',
  socialLinks: {
    instagram: 'https://instagram.com/luxestudios',
    facebook: 'https://facebook.com/luxestudios',
  },
  bookingWindowDays: DEFAULT_BOOKING_WINDOW_DAYS,
  minNoticeHours: DEFAULT_MIN_NOTICE_HOURS,
}

export default brand
