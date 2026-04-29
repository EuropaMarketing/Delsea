export type BorderRadius = 'none' | 'sm' | 'md' | 'lg' | 'full'

export interface SocialLinks {
  instagram?: string
  facebook?: string
  tiktok?: string
}

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
