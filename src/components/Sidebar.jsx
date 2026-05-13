/**
 * Sidebar sinistra — sempre visibile (§9.1)
 * Sfondo #141B3A, voci con icona + label, stato attivo con accent blu e barra laterale.
 * Le voci sono filtrate in base al ruolo loggato (§11).
 */
import { NavLink } from 'react-router-dom'
import {
  Home, FileText, Users, Store, UserCog, BarChart3, Target,
  Trophy, Package, Network, Settings,
} from 'lucide-react'
import { motion } from 'framer-motion'
import HypeLogo from './HypeLogo'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// Voci sidebar (§9.1) — `roles` indica chi può vederla.
// Se `roles` non è presente, la voce è visibile a tutti i loggati.
//
// Scelte di scope (§11):
//  - PdV NON vede "Punti Vendita" né "Collaboratori": gestisce solo i contratti
//    del proprio negozio dalle pagine principali.
const items = [
  { to: '/',             label: 'Home',          icon: Home },
  { to: '/contratti',    label: 'Contratti',     icon: FileText },
  { to: '/clienti',      label: 'Clienti',       icon: Users },
  { to: '/pdv',          label: 'Punti Vendita', icon: Store,    roles: ['admin','bo','dv','as','tm'] },
  { to: '/collaboratori',label: 'Collaboratori', icon: UserCog,  roles: ['admin','bo','dv','as','tm'] },
  { to: '/classifiche',  label: 'Classifiche',   icon: BarChart3 },
  { to: '/target',       label: 'Target',        icon: Target },
  { to: '/gara-gallery', label: 'Gara Gallery',  icon: Trophy,   roles: ['admin'] }, // solo admin (§11)
  { to: '/prodotti',     label: 'Prodotti',      icon: Package,  roles: ['admin','bo'] },
  { to: '/organigramma', label: 'Organigramma',  icon: Network },
  { to: '/admin',        label: 'Admin',         icon: Settings, roles: ['admin','bo'] },
]

export default function Sidebar() {
  const { profile } = useAuth()
  const ruolo = profile?.ruolo

  const visibili = items.filter(i => !i.roles || i.roles.includes(ruolo))

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface">
      {/* Header con logo */}
      <div className="flex h-16 items-center px-5">
        <HypeLogo size={28} />
      </div>

      {/* Voci di navigazione */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {visibili.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} end={to === '/'}>
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
                    <span className="font-medium">{label}</span>
                  </div>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer sidebar: versione */}
      <div className="border-t border-border px-5 py-3 text-xs text-text-muted">
        MyHype v0.1 — Aprile 2026
      </div>
    </aside>
  )
}
