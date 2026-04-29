import brand from '@/config/brand'

export function formatCurrency(pence: number): string {
  return new Intl.NumberFormat(brand.locale, {
    style: 'currency',
    currency: brand.currency,
    minimumFractionDigits: 2,
  }).format(pence / 100)
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}min` : `${h}h`
}
