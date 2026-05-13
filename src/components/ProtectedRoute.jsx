/**
 * ProtectedRoute — blocca l'accesso alle pagine autenticate.
 *
 * - Se stiamo ancora caricando la sessione → mostra un loader
 * - Se l'utente NON è loggato → redirect a /login
 * - Se l'utente è loggato MA non ha profilo in public.utenti → mostra errore
 * - Altrimenti renderizza la pagina richiesta
 *
 * Opzionale: passa `roles={['admin','bo']}` per limitare a certi ruoli.
 */
import { Navigate, Outlet } from 'react-router-dom'
import { Loader2, ShieldX } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function ProtectedRoute({ roles }) {
  const { user, profile, loading, signOut } = useAuth()

  // 1) Sessione in caricamento
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg">
        <div className="flex items-center gap-2 text-text-muted">
          <Loader2 size={18} className="animate-spin" />
          Caricamento sessione…
        </div>
      </div>
    )
  }

  // 2) Non loggato → login
  if (!user) return <Navigate to="/login" replace />

  // 3) Loggato ma senza profilo applicativo (riga utenti mancante)
  if (!profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg">
        <div className="max-w-md rounded-2xl border border-warning/40 bg-surface p-6 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <ShieldX size={22} />
          </div>
          <h2 className="mt-4 text-lg font-medium text-white">
            Profilo non configurato
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Il tuo account è stato autenticato ma non ha un profilo
            applicativo associato. Contatta un amministratore.
          </p>
          <button
            onClick={signOut}
            className="mt-4 rounded-xl border border-border bg-bg px-4 py-2 text-sm text-white hover:border-accent/40"
          >
            Esci
          </button>
        </div>
      </div>
    )
  }

  // 4) Filtro per ruolo (se specificato)
  if (roles && !roles.includes(profile.ruolo)) {
    return (
      <div className="flex h-[calc(100vh-8rem)] w-full items-center justify-center">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <ShieldX size={22} />
          </div>
          <h2 className="mt-4 text-lg font-medium text-white">Accesso negato</h2>
          <p className="mt-2 text-sm text-text-muted">
            Il tuo ruolo non ha i permessi per questa pagina.
          </p>
        </div>
      </div>
    )
  }

  // 5) Tutto ok → passa il controllo alle pagine figlie
  return <Outlet />
}
