import React from 'react'
import { cn } from '@/lib/cn'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  fullWidth?: boolean
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer'

const variants: Record<Variant, string> = {
  primary: 'btn-primary focus-visible:ring-[var(--color-primary)]',
  secondary:
    'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 [border-radius:var(--border-radius)]',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 [border-radius:var(--border-radius)]',
  danger: 'bg-red-600 text-white hover:bg-red-700 [border-radius:var(--border-radius)] focus-visible:ring-red-600',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}
