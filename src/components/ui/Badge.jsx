/**
 * Badge — piccola pill colorata per stati / categorie / tipi.
 * Varianti allineate ai colori semantici del §0.
 */
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badge = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
  {
    variants: {
      tone: {
        neutral: 'bg-white/5 text-text-muted ring-border',
        accent:  'bg-accent/10 text-accent-2 ring-accent/30',
        success: 'bg-success/10 text-success ring-success/30',
        warning: 'bg-warning/10 text-warning ring-warning/30',
        danger:  'bg-danger/10 text-danger ring-danger/30',
        info:    'bg-info/10 text-info ring-info/30',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
)

export default function Badge({ tone, className, children, ...props }) {
  return (
    <span className={cn(badge({ tone }), className)} {...props}>
      {children}
    </span>
  )
}
