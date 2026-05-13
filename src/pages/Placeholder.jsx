/**
 * Placeholder riutilizzabile per tutte le pagine non ancora implementate.
 * Sarà rimpiazzato mano a mano che procediamo con la roadmap §15.
 */
import { Construction } from 'lucide-react'

export default function Placeholder({ title, description, step }) {
  return (
    <div>
      <h1 className="text-3xl font-light tracking-tight text-white">{title}</h1>
      {description && (
        <p className="mt-2 text-text-muted">{description}</p>
      )}

      <div className="mt-8 flex items-center gap-4 rounded-2xl border border-border bg-surface p-6 shadow-soft">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Construction size={22} />
        </div>
        <div>
          <p className="font-medium text-white">Pagina in costruzione</p>
          <p className="text-sm text-text-muted">
            Verrà implementata nello step <span className="text-accent">{step}</span> della roadmap.
          </p>
        </div>
      </div>
    </div>
  )
}
