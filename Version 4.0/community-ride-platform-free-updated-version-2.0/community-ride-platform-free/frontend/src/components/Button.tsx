import React from 'react'
import { cn } from '../utils'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary'|'secondary'|'ghost'|'danger'
}
export function Button({ className, variant='primary', ...props }: Props) {
  const base = 'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed'
  const styles = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
    secondary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    ghost: 'bg-white/60 hover:bg-white border border-slate-200',
    danger: 'bg-rose-600 text-white hover:bg-rose-700'
  }[variant]
  return <button className={cn(base, styles, className)} {...props} />
}
