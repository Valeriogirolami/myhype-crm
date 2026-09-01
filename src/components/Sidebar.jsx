/**
 * Sidebar sinistra — sempre visibile (§9.1)
 * Sfondo #141B3A, voci con icona + label, stato attivo con accent blu e barra laterale.
 * Le voci sono filtrate in base al ruolo loggato (§11).
 */
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Home, FileText, Users, Store, UserCog, BarChart3, Target,
  Trophy, Package, Network, Settings, X, Calculator, CalendarClock,
} from 'lucide-react'
import { motion } from 'framer-motion'
import HypeLogo from './HypeLogo'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { classificaScadenza } from '@/pages/ContrattiScadenza'

// Voci sidebar (§9.1) — `roles` indica chi può vederla.
// Se `roles` non è presente, la voce è visibile a tutti i loggati.
//
// Scelte di scope (§11):
//  - PdV NON vede "Punti Vendita" né "Collaboratori": gestisce solo i contratti
//    del proprio negozio dalle pagine principali.
// HR (Responsabile HR — dal 2026-07): sola visualizzazione simile al DV;
// NON vede Gara Gallery, Simulatore, Prodotti; PUÒ gestire account (Admin).
const items = [
  { to: '/',             label: 'Home',          icon: Home },
  { to: '/contratti',    label: 'Contratti',     icon: FileText },
  { to: '/clienti',      label: 'Clienti',       icon: Users },
  { to: '/pdv',          label: 'Punti Vendita', icon: Store,    roles: ['admin','bo','dv','as','tm','hr'] },
  { to: '/collaboratori',label: 'Collaboratori', icon: UserCog,  roles: ['admin','bo','dv','as','tm','hr'] },
  { to: '/contratti-scadenza', label: 'Contratti in scadenza', icon: CalendarClock, roles: ['admin','bo','dv','as','tm','hr'], badge: 'scadenzeMese' },
  { to: '/classifiche',  label: 'Classifiche',   icon: BarChart3 },
  { to: '/target',       label: 'Target',        icon: Target },
  { to: '/gara-gallery', label: 'Gara Gallery',  icon: Trophy,   roles: ['admin'] }, // solo admin (§11) — HR NON vede
  { to: '/simulatore',   label: 'Simulatore',    icon: Calculator, roles: ['admin'] }, // solo admin — HR NON vede
  { to: '/prodotti',     label: 'Prodotti',      icon: Package,  roles: ['admin','bo'] }, // HR NON vede (non deve poterli modificare)
  { to: '/organigramma', label: 'Organigramma',  icon: Network },
  { to: '/admin',        label: 'Admin',         icon: Settings, roles: ['admin','bo','hr'] },
]

export default function Sidebar({ mobileOpen = false, onClose }) {
  const { profile } = useAuth()
  const ruolo = profile?.ruolo

  const visibili = items.filter(i => !i.roles || i.roles.includes(ruolo))

  // Badge "Contratti in scadenza": count di contratti scaduti + in scadenza
  // in questo mese (giallo/arancio/rosso). Il verde (mese prossimo) non accende
  // la notifica (richiesta Valerio §2026-07).
  const [scadenzeMese, setScadenzeMese] = useState(0)
  useEffect(() => {
    if (!profile?.id) return
    // La query gira solo per i ruoli che vedono la pagina
    if (!['admin','bo','dv','as','tm','hr'].includes(ruolo)) return
    let cancelled = false
    supabase
      .from('collaboratori')
      .select('data_scadenza_contratto')
      .eq('stato', 'attivo')
      .not('data_scadenza_contratto', 'is', null)
      .then(({ data }) => {
        if (cancelled || !data) return
        const count = data.filter(c => {
          const s = classificaScadenza(c.data_scadenza_contratto)
          return s === 'scaduti' || s === 'questaSettimana' || s === 'questoMese'
        }).length
        setScadenzeMese(count)
      })
    return () => { cancelled = true }
  }, [profile?.id, ruolo])

  return (
    <>
      {/* Overlay scuro dietro al drawer — solo mobile, chiude al tap */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface transition-transform duration-200 ease-out',
          'md:relative md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header con logo + chiusura (X solo su mobile) */}
        <div className="flex h-16 items-center justify-between px-5">
          <HypeLogo size={28} />
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/5 hover:text-white md:hidden"
            aria-label="Chiudi menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Voci di navigazione */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {visibili.map(({ to, label, icon: Icon, badge }) => {
              // Recupero il valore numerico del badge se richiesto
              const badgeCount = badge === 'scadenzeMese' ? scadenzeMese : 0
              return (
                <li key={to}>
                  <NavLink to={to} end={to === '/'} onClick={onClose}>
                    {({ isActive }) => (
                      <div
                        className={cn(
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                          isActive
                            ? 'bg-accent/15 text-white'
                            : 'text-text-muted hover:bg-white/5 hover:text-white',
                        )}
                      >
                        {/* Barra laterale di attivo */}
                        {isActive && (
                          <motion.span
                            layoutId="sidebar-active"
                            className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-gradient-primary"
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          />
                        )}
                        <Icon size={18} strokeWidth={2} />
                        <span className="flex-1 font-medium">{label}</span>
                        {/* Badge notifica (contratti in scadenza questo mese) */}
                        {badgeCount > 0 && (
                          <span
                            className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white"
                            title={`${badgeCount} contratti in scadenza questo mese o scaduti`}
                          >
                            {badgeCount}
                          </span>
                        )}
                      </div>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer sidebar: versione */}
        <div className="border-t border-border px-5 py-3 text-xs text-text-muted">
          MyHype v0.1 — Aprile 2026
        </div>
      </aside>
    </>
  )
}
