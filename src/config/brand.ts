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
  currency: string
  locale: string
  businessEmail: string
  socialLinks?: SocialLinks
  cancellationPolicy?: string
  importantInfo?: string
  aboutText?: string
  openingHours?: OpeningHoursEntry[]
  address?: string
  mapEmbedUrl?: string
}

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
}

export default brand
