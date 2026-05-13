/**
 * Sistema di notifiche "toast" ultra-leggero — niente dipendenze extra.
 * Le toast appaiono in basso a destra, si chiudono da sole dopo 3s.
 *
 * Uso:  import { toast } from '@/lib/toast'
 *       toast.success('Salvato.')
 *       toast.error('Qualcosa è andato storto.')
 *       toast.info('Attenzione.')
 */

const listeners = new Set()
let counter = 0

export const toast = {
  success: (msg, opts) => push('success', msg, opts),
  error:   (msg, opts) => push('error',   msg, opts),
  info:    (msg, opts) => push('info',    msg, opts),
  warning: (msg, opts) => push('warning', msg, opts),
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}

function push(tone, message, { duration = 3000 } = {}) {
  const id = ++counter
  const t = { id, tone, message }
  listeners.forEach(fn => fn({ type: 'add', toast: t }))
  setTimeout(() => {
    listeners.forEach(fn => fn({ type: 'remove', id }))
  }, duration)
}
