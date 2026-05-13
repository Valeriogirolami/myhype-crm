/**
 * Renderer globale delle toast — va montato una volta sola in Layout.
 * Ascolta gli eventi di toast.* e mostra le card in basso a destra.
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

const icons = {
  success: { Icon: CheckCircle2,   cls: 'text-success' },
  error:   { Icon: XCircle,        cls: 'text-danger' },
  warning: { Icon: AlertTriangle,  cls: 'text-warning' },
  info:    { Icon: Info,           cls: 'text-info' },
}

export default function Toaster() {
  const [items, setItems] = useState([])

  useEffect(() => {
    return toast.subscribe(evt => {
      if (evt.type === 'add') setItems(xs => [...xs, evt.toast])
      if (evt.type === 'remove') setItems(xs => xs.filter(t => t.id !== evt.id))
    })
  }, [])

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {items.map(t => {
          const { Icon, cls } = icons[t.tone] || icons.info
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 20, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'pointer-events-auto flex min-w-[260px] items-start gap-3 rounded-xl',
                'border border-border bg-surface px-4 py-3 shadow-soft',
              )}
            >
              <Icon size={18} className={cn('mt-0.5 shrink-0', cls)} />
              <p className="text-sm text-white">{t.message}</p>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
