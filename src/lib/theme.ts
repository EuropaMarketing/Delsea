import type { BrandConfig, BorderRadius } from '@/config/brand'

const radiusMap: Record<BorderRadius, string> = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '9999px',
}

export function applyBrandTheme(config: BrandConfig) {
  const root = document.documentElement

  root.style.setProperty('--color-primary', config.primaryColour)
  root.style.setProperty('--color-secondary', config.secondaryColour)
  root.style.setProperty('--color-background', config.backgroundColour)
  root.style.setProperty('--color-text', config.textColour)
  root.style.setProperty('--font-family', config.fontFamily)
  root.style.setProperty('--border-radius', radiusMap[config.borderRadius])
  root.style.setProperty('--border-radius-sm', `calc(${radiusMap[config.borderRadius]} * 0.5)`)
  root.style.setProperty('--border-radius-lg', `calc(${radiusMap[config.borderRadius]} * 1.5)`)

  // Inject Google Font if needed
  const fontName = config.fontFamily.match(/'([^']+)'/)?.[1]
  if (fontName) {
    const existing = document.getElementById('brand-font')
    if (!existing) {
      const link = document.createElement('link')
      link.id = 'brand-font'
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;500;600;700&display=swap`
      document.head.appendChild(link)
    }
  }

  document.title = config.brandName
}
