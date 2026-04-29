import React from 'react'
import { cn } from '@/lib/cn'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

const variants: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  danger:  'bg-red-100 text-red-700',
  info:    'bg-blue-100 text-blue-700',
  brand:   'bg-[color-mix(in_srgb,var(--color-primary)_15%,white)] text-[var(--color-primary)]',
}

export function Badge({
  variant = 'default',
  children,
  className,
}: {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'confirmed': return 'success'
    case 'pending':   return 'warning'
    case 'cancelled': return 'danger'
    case 'completed': return 'info'
    default:          return 'default'
  }
}
