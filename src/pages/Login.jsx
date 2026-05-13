/**
 * Pagina di Login — accesso unico all'app (§12).
 * Design premium coerente col §0: dark, gradiente accent, vetro smerigliato.
 */
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Loader2, Mail, Lock } from 'lucide-react'
import HypeLogo from '@/components/HypeLogo'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

// Validazione form con Zod — messaggi in italiano
const schema = z.object({
  email: z.string().min(1, 'Email obbligatoria').email('Email non valida'),
  password: z.string().min(1, 'Password obbligatoria'),
})

export default function Login() {
  const { user, signIn, loading: authLoading } = useAuth()
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) })

  // Se è già loggato, vai direttamente alla home
  if (!authLoading && user) return <Navigate to="/" replace />

  async function onSubmit(values) {
    setServerError('')
    setSubmitting(true)
    try {
      await signIn(values.email, values.password)
      // Il redirect avviene automaticamente perché user diventa non-null
    } catch (err) {
      // DEBUG: mostro il messaggio originale completo per capire il problema
      setServerError(`${err?.message || 'errore sconosciuto'} [status: ${err?.status || 'n/a'}, code: ${err?.code || 'n/a'}]`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-bg">
      {/* Aloni decorativi di sfondo — gradient soft, coerenti col brand */}
      <div
        className="pointer-events-none absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, #2B6CFF, transparent)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, #5B8FFF, transparent)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md px-6"
      >
        {/* Logo in cima */}
        <div className="mb-8 flex justify-center">
          <HypeLogo size={40} />
        </div>

        {/* Card login */}
        <div className="rounded-2xl border border-border bg-surface/80 p-8 shadow-soft backdrop-blur">
          <h1 className="text-2xl font-light tracking-tight text-white">
            Accedi al tuo account
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Inserisci le credenziali fornite dal tuo amministratore.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-muted">
                Email
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="nome@hypesrl.eu"
                  {...register('email')}
                  className={cn(
                    'w-full rounded-xl border bg-bg py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-text-muted/60',
                    'outline-none transition focus:border-accent',
                    errors.email ? 'border-danger' : 'border-border'
                  )}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-danger">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-muted">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                  className={cn(
                    'w-full rounded-xl border bg-bg py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-text-muted/60',
                    'outline-none transition focus:border-accent',
                    errors.password ? 'border-danger' : 'border-border'
                  )}
                />
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
              )}
            </div>

            {/* Errore server */}
            {serverError && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {serverError}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Accesso in corso…
                </>
              ) : (
                'Accedi'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-text-muted">
          © {new Date().getFullYear()} Hype — Uso interno
        </p>
        {/* DEBUG temporaneo: verifica che le env vars siano caricate */}
        <p className="mt-2 text-center text-[10px] text-text-muted/40 break-all">
          API: {import.meta.env.VITE_SUPABASE_URL || '⚠️ URL MANCANTE'}
          {' · '}
          Key: {import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? `${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY.slice(0, 25)}…` : '⚠️ KEY MANCANTE'}
        </p>
      </motion.div>
    </div>
  )
}
