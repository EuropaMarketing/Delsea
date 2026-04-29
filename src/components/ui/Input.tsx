import React from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full h-10 px-3 text-sm border bg-white transition-colors outline-none',
          '[border-radius:var(--border-radius-sm)]',
          'placeholder:text-gray-400',
          'focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-0 focus:border-[var(--color-primary)]',
          error ? 'border-red-400' : 'border-gray-200',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={3}
        className={cn(
          'w-full px-3 py-2 text-sm border bg-white transition-colors outline-none resize-none',
          '[border-radius:var(--border-radius-sm)]',
          'placeholder:text-gray-400',
          'focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-0 focus:border-[var(--color-primary)]',
          error ? 'border-red-400' : 'border-gray-200',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
