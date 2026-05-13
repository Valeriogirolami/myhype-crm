/**
 * PdvAssegnazioni — sezione "Persone" del dialog PdV.
 * Gestisce 4 gruppi: Venditori, Team Manager, Area Sales, Direttore Vendite.
 *
 * Per ogni gruppo:
 *  - Chip delle persone già assegnate (click ✕ → rimuove subito dal DB)
 *  - Dropdown "+ Aggiungi" con i collaboratori attivi non ancora assegnati
 *
 * Tecnica: mutazione immediata (upsert / delete) anziché attendere un Salva.
 * Così l'utente vede subito l'effetto e non rischia di perdere le modifiche.
 *
 * Per il DV vale la convenzione "1 solo per PdV" (§2.4): se ne aggiungi un
 * secondo, il precedente viene sostituito automaticamente.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Plus, X, Users, Briefcase, ShieldCheck, Crown, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

// Ogni gruppo indica anche QUALI ruoli di collaboratore sono compatibili.
// Match case-insensitive sul campo collaboratori.ruolo (text libero).
const GRUPPI = [
  {
    key: 'venditore', label: 'Venditori', icon: Users, multi: true, tone: 'accent',
    ruoliCompatibili: ['venditore'],           // match "Venditore" e "Venditore Senior"
    etichettaRuolo: 'Venditore',
  },
  {
    key: 'tm', label: 'Team Manager', icon: Briefcase, multi: true, tone: 'info',
    ruoliCompatibili: ['team manager'],
    etichettaRuolo: 'Team Manager',
  },
  {
    key: 'as', label: 'Area Sales', icon: ShieldCheck, multi: true, tone: 'warning',
    ruoliCompatibili: ['area sales'],
    etichettaRuolo: 'Area Sales',
  },
  {
    key: 'dv', label: 'Direttore Vendite', icon: Crown, multi: false, tone: 'danger',
    ruoliCompatibili: ['direttore vendite'],
    etichettaRuolo: 'Direttore Vendite',
  },
]

/**
 * Controlla se un collaboratore può essere assegnato a un certo gruppo del PdV.
 * Il match è case-insensitive e a "contiene" — così "Venditore Senior" matcha
 * il gruppo Venditori. I ruoli "Altro" o anomali non matchano nessun gruppo.
 */
function isRuoloCompatibile(ruoloCollab, ruoliCompatibili) {
  if (!ruoloCollab) return false
  const r = ruoloCollab.toLowerCase()
  return ruoliCompatibili.some(k => r.includes(k))
}

export default function PdvAssegnazioni({ pdvId }) {
  const [assegnazioni, setAssegnazioni] = useState([])   // [{collaboratore_id, ruolo_nel_pdv, collaboratori:{...}}]
  const [collaboratori, setCollaboratori] = useState([]) // tutti i collaboratori attivi
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [resAsg, resCol] = await Promise.all([
      supabase
        .from('pdv_collaboratori')
        .select('collaboratore_id, ruolo_nel_pdv, collaboratori(id, nome, cognome, ruolo, stato)')
        .eq('pdv_id', pdvId),
      supabase
        .from('collaboratori')
        .select('id, nome, cognome, ruolo, stato')
        .eq('stato', 'attivo')
        .order('cognome, nome'),
    ])
    if (resAsg.error) toast.error(`Errore assegnazioni: ${resAsg.error.message}`)
    if (resCol.error) toast.error(`Errore collaboratori: ${resCol.error.message}`)
    setAssegnazioni(resAsg.data || [])
    setCollaboratori(resCol.data || [])
    setLoading(false)
  }, [pdvId])

  useEffect(() => { if (pdvId) loadData() }, [pdvId, loadData])

  // Raggruppo gli assegnati per ruolo_nel_pdv
  const byRuolo = useMemo(() => {
    const out = { venditore: [], tm: [], as: [], dv: [] }
    for (const a of assegnazioni) {
      if (out[a.ruolo_nel_pdv] && a.collaboratori) {
        out[a.ruolo_nel_pdv].push({
          id: a.collaboratore_id,
          ...a.collaboratori,
        })
      }
    }
    return out
  }, [assegnazioni])

  async function aggiungi(collaboratoreId, ruoloNelPdv) {
    // Convenzione §2.4: 1 solo DV per PdV → sostituisci l'eventuale esistente
    if (ruoloNelPdv === 'dv' && byRuolo.dv.length > 0) {
      const attuale = byRuolo.dv[0]
      const { error: delErr } = await supabase
        .from('pdv_collaboratori')
        .delete()
        .eq('pdv_id', pdvId)
        .eq('collaboratore_id', attuale.id)
        .eq('ruolo_nel_pdv', 'dv')
      if (delErr) { toast.error(`Errore: ${delErr.message}`); return }
    }

    const { error } = await supabase
      .from('pdv_collaboratori')
      .insert([{ pdv_id: pdvId, collaboratore_id: collaboratoreId, ruolo_nel_pdv: ruoloNelPdv }])
    if (error) {
      toast.error(`Errore: ${error.message}`)
      return
    }
    toast.success('Persona assegnata.')
    await loadData()
  }

  async function rimuovi(collaboratoreId, ruoloNelPdv) {
    const { error } = await supabase
      .from('pdv_collaboratori')
      .delete()
      .eq('pdv_id', pdvId)
      .eq('collaboratore_id', collaboratoreId)
      .eq('ruolo_nel_pdv', ruoloNelPdv)
    if (error) {
      toast.error(`Errore: ${error.message}`)
      return
    }
    toast.success('Persona rimossa.')
    // §3.2: i contratti prodotti restano attaccati al PdV — non vengono toccati
    await loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-text-muted">
        <Loader2 size={16} className="animate-spin" />
        Caricamento assegnazioni…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        Ogni collaboratore può essere assegnato a PdV di aree diverse (§1.4). Alla
        rimozione di un venditore, i contratti già prodotti restano attaccati al
        PdV originario (§3.2).
      </p>

      {GRUPPI.map(g => {
        const assegnati = byRuolo[g.key] || []

        // Regola 1: un collaboratore già assegnato (a QUALSIASI ruolo) in questo
        // PdV non può essere riassegnato. Una persona = un solo ruolo per PdV.
        const idGiaAssegnati = new Set(assegnazioni.map(a => a.collaboratore_id))

        // Regola 2: solo collaboratori con un ruolo compatibile col gruppo.
        const disponibili = collaboratori
          .filter(c => isRuoloCompatibile(c.ruolo, g.ruoliCompatibili))
          .filter(c => !idGiaAssegnati.has(c.id))

        return (
          <GruppoAssegnazioni
            key={g.key}
            gruppo={g}
            assegnati={assegnati}
            disponibili={disponibili}
            onAdd={id => aggiungi(id, g.key)}
            onRemove={id => rimuovi(id, g.key)}
          />
        )
      })}
    </div>
  )
}

// ---------- sub-componenti ----------

function GruppoAssegnazioni({ gruppo, assegnati, disponibili, onAdd, onRemove }) {
  const Icon = gruppo.icon
  return (
    <section className="rounded-xl border border-border bg-bg/30 p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            gruppo.tone === 'accent'  && 'bg-accent/10 text-accent-2',
            gruppo.tone === 'info'    && 'bg-info/10 text-info',
            gruppo.tone === 'warning' && 'bg-warning/10 text-warning',
            gruppo.tone === 'danger'  && 'bg-danger/10 text-danger',
          )}>
            <Icon size={16} />
          </div>
          <div>
            <div className="text-sm font-medium text-white">{gruppo.label}</div>
            <div className="text-[11px] text-text-muted">
              {assegnati.length}{' '}
              {assegnati.length === 1 ? 'persona assegnata' : 'persone assegnate'}
              {!gruppo.multi && ' (max 1)'}
            </div>
          </div>
        </div>

        <AddDropdown
          disponibili={disponibili}
          onAdd={onAdd}
          etichettaRuolo={gruppo.etichettaRuolo}
          label={
            !gruppo.multi && assegnati.length > 0
              ? 'Sostituisci'
              : 'Aggiungi'
          }
        />
      </header>

      {/* Chip persone assegnate */}
      {assegnati.length === 0 ? (
        <p className="text-xs italic text-text-muted">Nessuna persona assegnata.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assegnati.map(p => (
            <span
              key={p.id}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-white"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-primary text-[9px] font-semibold">
                {(p.nome?.[0] ?? '') + (p.cognome?.[0] ?? '')}
              </span>
              <span className="font-medium">{p.nome} {p.cognome}</span>
              <span className="text-text-muted">· {p.ruolo}</span>
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                className="-mr-1 rounded-full p-0.5 text-text-muted hover:bg-white/5 hover:text-danger"
                title="Rimuovi"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function AddDropdown({ disponibili, onAdd, label = 'Aggiungi', etichettaRuolo }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return disponibili
    return disponibili.filter(c => {
      const blob = `${c.nome} ${c.cognome} ${c.ruolo}`.toLowerCase()
      return blob.includes(q)
    })
  }, [disponibili, search])

  // Chiudi quando si clicca fuori
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    setTimeout(() => document.addEventListener('click', close, { once: true }), 0)
  }, [open])

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disponibili.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-white transition hover:border-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus size={12} />
        {label}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per nome o ruolo…"
              className="w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-white placeholder:text-text-muted/60 outline-none focus:border-accent"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs italic text-text-muted">
                {disponibili.length === 0
                  ? etichettaRuolo
                    ? `Nessun collaboratore con ruolo "${etichettaRuolo}" disponibile (o sono tutti già assegnati in questo PdV).`
                    : 'Tutti i collaboratori disponibili sono già assegnati'
                  : 'Nessun risultato per la ricerca'}
              </li>
            ) : (
              filtered.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => { onAdd(c.id); setOpen(false); setSearch('') }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-primary text-[9px] font-semibold text-white">
                      {(c.nome?.[0] ?? '') + (c.cognome?.[0] ?? '')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-white">
                        {c.nome} {c.cognome}
                      </div>
                      <div className="truncate text-[10px] text-text-muted">{c.ruolo}</div>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
