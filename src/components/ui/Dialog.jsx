/**
 * Dialog (modale) portalizzato nel <body>.
 * Backdrop scuro + card centrata, animazione soft con Framer Motion.
 * - ESC chiude
 * - Click sul backdrop chiude
 * - Body non scrolla mentre è aperto
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md', // sm / md / lg
}) {
  // ESC chiude + blocca scroll body
  useEffect(() => {
    if (!open) return
    const onKey = e => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  const maxW = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size]

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'relative z-10 w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-soft',
              maxW,
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div className="min-w-0">
                {title && (
                  <h2 className="truncate text-lg font-medium text-white">{title}</h2>
                )}
                {description && (
                  <p className="mt-0.5 text-sm text-text-muted">{description}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="-mr-2 -mt-1 rounded-lg p-2 text-text-muted transition hover:bg-white/5 hover:text-white"
                aria-label="Chiudi"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-border bg-bg/30 px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
