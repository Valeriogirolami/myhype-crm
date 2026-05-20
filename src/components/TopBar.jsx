/**
 * Top bar — filtro temporale globale al centro, notifiche + menu utente a destra (§9.1)
 * Mostra nome e ruolo dell'utente loggato con dropdown per il logout.
 * Il bottone "+ Nuovo contratto" è visibile solo al ruolo PdV (§9.2) e apre
 * direttamente il dialog di creazione contratto.
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, LogOut, Menu } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import ContrattoNuovoDialog from '@/pages/ContrattoNuovoDialog'
import NotificheBell from './NotificheBell'

const mesi = [
  'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
]

const etichettaRuolo = {
  admin: 'Admin',
  bo: 'Back Office',
  dv: 'Direttore Vendite',
  as: 'Area Sales',
  tm: 'Team Manager',
  pdv: 'Punto Vendita',
}

export default function TopBar({ onOpenMenu }) {
  const { profile, signOut } = useAuth()
  const [openMenu, setOpenMenu] = useState(false)
  const [newContrattoOpen, setNewContrattoOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenu(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const oggi = new Date()
  const meseCorrente = mesi[oggi.getMonth()]
  const annoCorrente = oggi.getFullYear()

  const iniziali = profile
    ? `${profile.nome?.[0] || ''}${profile.cognome?.[0] || ''}`.toUpperCase()
    : '??'

  const isPdv = profile?.ruolo === 'pdv'

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-border bg-surface/80 px-3 backdrop-blur md:px-6">
      {/* Sinistra: hamburger (solo mobile) per aprire la sidebar */}
      <div className="flex items-center">
        <button
          onClick={onOpenMenu}
          className="rounded-lg p-2 text-text-muted transition-colors hover:bg-white/5 hover:text-white md:hidden"
          aria-label="Apri menu"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Centro: filtro periodo globale */}
      <div className="flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 text-sm md:px-4">
        <span className="hidden text-text-muted sm:inline">Periodo:</span>
        <button className="flex items-center gap-1 font-medium text-white transition-colors hover:text-accent-2">
          {meseCorrente} {annoCorrente}
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Destra */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* CTA nuovo contratto — solo PdV (§9.2) */}
        {isPdv && (
          <button
            onClick={() => setNewContrattoOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-primary px-3 py-2 text-sm font-semibold text-white shadow-soft transition hover:brightness-110 md:px-4"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nuovo contratto</span>
          </button>
        )}

        <NotificheBell />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpenMenu(o => !o)}
            className={cn(
              'flex items-center gap-2 rounded-full border bg-bg px-2 py-1 pr-3 transition-colors',
              openMenu ? 'border-accent/60' : 'border-border hover:border-accent/40'
            )}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-primary text-[11px] font-semibold text-white">
              {iniziali}
            </div>
            <div className="hidden text-left leading-tight md:block">
              <div className="text-sm font-medium text-white">
                {profile?.nome} {profile?.cognome}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-text-muted">
                {etichettaRuolo[profile?.ruolo] || profile?.ruolo}
              </div>
            </div>
            <ChevronDown size={14} className="text-text-muted" />
          </button>

          {openMenu && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
              <div className="border-b border-border px-4 py-3">
                <div className="truncate text-sm font-medium text-white">
                  {profile?.nome} {profile?.cognome}
                </div>
                <div className="truncate text-xs text-text-muted">{profile?.email}</div>
              </div>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-white transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <LogOut size={16} />
                Esci
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dialog nuovo contratto (globale — accessibile dalla topbar per PdV) */}
      <ContrattoNuovoDialog
        open={newContrattoOpen}
        onClose={() => setNewContrattoOpen(false)}
        onCreated={() => { /* la pagina Contratti si ricarica da sola quando viene aperta */ }}
      />
    </header>
  )
}
