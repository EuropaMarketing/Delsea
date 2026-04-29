import React from 'react'
import { cn } from '@/lib/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  selected?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddings = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
}

export function Card({ hover, selected, padding = 'md', className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'brand-card bg-white border transition-all',
        hover && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5',
        selected
          ? 'border-[var(--color-primary)] shadow-sm ring-1 ring-[var(--color-primary)]'
          : 'border-gray-200',
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
