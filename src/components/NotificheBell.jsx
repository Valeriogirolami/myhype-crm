/**
 * Campanella notifiche — usata in TopBar (§13).
 *
 * - Mostra pallino rosso se ci sono notifiche non lette
 * - Click → dropdown con elenco delle ultime 30
 * - Click su una notifica → marca come letta + naviga al link (se presente)
 * - "Segna tutte come lette" in cima
 * - Polling ogni 30 secondi per aggiornare il contatore
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Loader2, Inbox } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchNotifiche, contaNonLette, marcaLetta, marcaTutteLette,
} from '@/lib/notifiche'
import { cn } from '@/lib/utils'

const POLLING_MS = 30_000

export default function NotificheBell() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  // Polling contatore
  useEffect(() => {
    if (!profile?.id) return
    let active = true

    async function refreshCount() {
      try {
        const c = await contaNonLette(profile.id)
        if (active) setCount(c)
      } catch { /* ignore */ }
    }
    refreshCount()
    const id = setInterval(refreshCount, POLLING_MS)
    return () => { active = false; clearInterval(id) }
  }, [profile?.id])

  // Carica lista quando apro il dropdown
  useEffect(() => {
    if (!open || !profile?.id) return
    setLoading(true)
    fetchNotifiche(profile.id, { limit: 30 })
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [open, profile?.id])

  // Chiudi clic fuori
  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function handleClick(n) {
    try {
      if (!n.letta) {
        await marcaLetta(n.id)
        setList(prev => prev.map(x => x.id === n.id ? { ...x, letta: true } : x))
        setCount(c => Math.max(0, c - 1))
      }
      if (n.link) {
        navigate(n.link)
        setOpen(false)
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function handleSegnaTutte() {
    try {
      await marcaTutteLette(profile.id)
      setList(prev => prev.map(x => ({ ...x, letta: true })))
      setCount(0)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'relative rounded-full p-2 transition-colors',
          open ? 'bg-white/5 text-white' : 'text-text-muted hover:bg-white/5 hover:text-white',
        )}
        title="Notifiche"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white tabular-nums">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-accent-2" />
              <span className="text-sm font-medium text-white">Notifiche</span>
              {count > 0 && (
                <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-medium text-danger ring-1 ring-danger/30">
                  {count} {count === 1 ? 'non letta' : 'non lette'}
                </span>
              )}
            </div>
            {count > 0 && (
              <button
                onClick={handleSegnaTutte}
                className="flex items-center gap-1 text-xs text-accent-2 hover:underline"
              >
                <CheckCheck size={12} /> Segna tutte
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-text-muted">
                <Loader2 size={14} className="animate-spin" /> Caricamento…
              </div>
            ) : list.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-text-muted">
                <Inbox size={22} />
                <span className="text-sm">Nessuna notifica</span>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {list.map(n => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={cn(
                        'block w-full px-4 py-3 text-left transition-colors hover:bg-white/5',
                        !n.letta && 'bg-accent/5',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {!n.letta && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className={cn(
                            'text-sm leading-snug',
                            n.letta ? 'text-text-muted' : 'text-white font-medium',
                          )}>
                            {n.titolo}
                          </div>
                          <div className="mt-0.5 text-xs text-text-muted line-clamp-2">
                            {n.testo}
                          </div>
                          <div className="mt-1 text-[10px] text-text-muted/80 tabular-nums">
                            {formatRelative(n.created_at)}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Formato "data relativa" leggera: "ora", "5 min fa", "2 ore fa", "ieri", "3 giorni fa", "gg/mm"
function formatRelative(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const ora = new Date()
  const sec = Math.floor((ora - d) / 1000)
  if (sec < 60) return 'ora'
  if (sec < 3600) return `${Math.floor(sec / 60)} min fa`
  if (sec < 86400) return `${Math.floor(sec / 3600)} ore fa`
  if (sec < 172800) return 'ieri'
  if (sec < 604800) return `${Math.floor(sec / 86400)} giorni fa`
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
