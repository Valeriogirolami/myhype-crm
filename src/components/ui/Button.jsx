/**
 * Button riutilizzabile con varianti coerenti col design system Hype (§0).
 *
 * Varianti:
 *  - primary   → gradiente accent (azioni principali)
 *  - secondary → ghost con border (azioni neutre)
 *  - danger    → rosso corallo (azioni distruttive)
 *  - success   → verde menta (conferme positive)
 *  - ghost     → solo testo con hover soft
 *
 * Dimensioni: sm / md (default) / lg
 */
import { cva } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition ' +
  'disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2',
  {
    variants: {
      variant: {
        primary:   'bg-gradient-primary text-white shadow-soft hover:brightness-110',
        secondary: 'border border-border bg-bg text-white hover:border-accent/40',
        danger:    'bg-danger text-white hover:brightness-110',
        success:   'bg-success text-bg hover:brightness-110',
        ghost:     'text-text-muted hover:bg-white/5 hover:text-white',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-5 py-2.5 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
)

export default function Button({
  variant,
  size,
  loading = false,
  disabled,
  className,
  children,
  ...props
}) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(button({ variant, size }), className)}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}
