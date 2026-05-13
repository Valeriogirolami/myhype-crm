/**
 * Utility helpers — piccole funzioni riutilizzabili
 */
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * cn() — unisce classi Tailwind evitando conflitti.
 * Uso: cn('px-2 py-1', cond && 'bg-red', props.className)
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * formatEuro() — formato italiano SENZA decimali (preferenza Valerio, §0)
 * Esempio: 1234567 → "1.234.567 €"
 */
export function formatEuro(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('it-IT', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(n)) + ' €'
}

/**
 * formatInt() — intero con separatore italiano (1.234)
 */
export function formatInt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('it-IT').format(Math.round(n))
}

/**
 * formatDate() — data italiana gg/mm/aaaa
 */
export function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * formatMonth() — mese esteso italiano (es. "aprile 2026")
 */
export function formatMonth(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}
