/**
 * AugurioCompleanno — banner "pirotecnico" per i festeggiati di oggi.
 *
 * Rendering:
 *  - Gradient animato di sfondo (rainbow) che scorre
 *  - Torta 🎂 con animazione bounce/rotate infinita
 *  - Testo "BUON COMPLEANNO" con effetto shimmer + nome del festeggiato grande
 *  - Confetti caduti dall'alto (particelle CSS animate in loop)
 *  - Entrance con framer-motion (scale + fade)
 *  - Se ci sono più festeggiati, li elenca a capo
 *
 * Nasconde tutto se `festeggiati.length === 0`.
 */
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

// Palette colori per confetti (armonica con la palette del progetto)
const COLORI = ['#2B6CFF', '#7A9BFF', '#F5B042', '#22c55e', '#ef4444', '#a855f7', '#ec4899', '#facc15']
const EMOJI_DECOR = ['🎂', '🎉', '🎈', '🎁', '✨', '🍾', '🎊']

/**
 * Genera un array di N confetti con proprietà random deterministiche
 * (uso Math.random ma non serve riproducibilità: si ricarica ad ogni mount)
 */
function useConfetti(n = 40) {
  return useMemo(() => {
    return Array.from({ length: n }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,           // %
      delay: Math.random() * 4,            // s
      duration: 4 + Math.random() * 4,     // s (4-8s per caduta)
      color: COLORI[Math.floor(Math.random() * COLORI.length)],
      size: 6 + Math.random() * 8,         // px
      rotateStart: Math.random() * 360,
      rotateEnd: (Math.random() * 720) - 360,
      isEmoji: Math.random() < 0.15,
      emoji: EMOJI_DECOR[Math.floor(Math.random() * EMOJI_DECOR.length)],
    }))
  }, [n])
}

export default function AugurioCompleanno({ festeggiati = [] }) {
  const confetti = useConfetti(40)
  const [chiuso, setChiuso] = useState(false)
  if (!festeggiati.length || chiuso) return null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: -12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className="relative mb-6 overflow-hidden rounded-3xl border-2 border-white/10 shadow-2xl"
      style={{ minHeight: 180 }}
    >
      {/* Gradient animato di sfondo */}
      <div className="absolute inset-0 bg-[length:400%_400%] animate-augurio-gradient"
        style={{
          backgroundImage: 'linear-gradient(120deg, #2B6CFF, #a855f7, #ec4899, #F5B042, #22c55e, #2B6CFF)',
        }}
      />
      {/* Overlay sottile per leggibilità testo */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Alone luminoso pulsante attorno al bordo */}
      <div className="pointer-events-none absolute inset-0 animate-augurio-glow rounded-3xl" />

      {/* Confetti che cadono */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map(c => (
          <span
            key={c.id}
            className="absolute top-[-20px] animate-augurio-fall"
            style={{
              left: `${c.left}%`,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              // eslint-disable-next-line
              ['--rotStart']: `${c.rotateStart}deg`,
              ['--rotEnd']: `${c.rotateEnd}deg`,
            }}
          >
            {c.isEmoji ? (
              <span style={{ fontSize: c.size + 8 }}>{c.emoji}</span>
            ) : (
              <span
                className="block rounded-sm"
                style={{
                  width: c.size,
                  height: c.size * 1.6,
                  background: c.color,
                  boxShadow: `0 0 6px ${c.color}`,
                }}
              />
            )}
          </span>
        ))}
      </div>

      {/* Bottone chiudi (in alto a destra) */}
      <button
        onClick={() => setChiuso(true)}
        aria-label="Chiudi augurio"
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X size={16} />
      </button>

      {/* Contenuto centrale */}
      <div className="relative z-[1] flex flex-col items-center gap-3 px-6 py-8 text-center text-white sm:flex-row sm:justify-center sm:gap-6 sm:text-left">
        {/* Torta grande con animazione */}
        <motion.div
          animate={{
            rotate: [-8, 8, -8],
            scale: [1, 1.08, 1],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex-shrink-0 drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]"
          style={{ fontSize: 72, lineHeight: 1 }}
        >
          🎂
        </motion.div>

        {/* Testo */}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold uppercase tracking-widest text-white/85 animate-augurio-shimmer">
            🎉 Tanti auguri 🎉
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-center gap-x-2 sm:justify-start">
            {festeggiati.map((f, i) => (
              <span key={f.id} className="text-2xl font-bold sm:text-3xl">
                {f.nome} {f.cognome}
                {i < festeggiati.length - 1 && (
                  <span className="mx-1 text-white/60">·</span>
                )}
              </span>
            ))}
          </div>
          <div className="mt-1 text-xs text-white/80">
            {festeggiati.length === 1
              ? `Oggi compie gli anni ${festeggiati[0].ruolo || 'un collaboratore'}. Buon compleanno! 🎈`
              : `Oggi festeggiano il compleanno ${festeggiati.length} persone. Auguri a tutti! 🎈`}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
