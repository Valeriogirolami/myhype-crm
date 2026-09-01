/**
 * Pagina Admin — gestione utenti dell'app (§5e roadmap, §11 SPEC).
 *
 * - Lista utenti con avatar, ruolo, stato
 * - Filtri per ruolo e stato + ricerca testuale
 * - Bottone "+ Nuovo utente" (apre dialog → Edge Function create-user)
 * - Click riga → dialog modifica (cambia ruolo/nome/cognome/stato + reset pwd)
 *
 * Visibile solo ad Admin e BO (rotta protetta in App.jsx).
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Loader2, ShieldCheck, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { formatDate, cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import UtenteDialog from './UtenteDialog'

const labelRuolo = {
  admin: 'Admin',
  bo:    'Back Office',
  hr:    'Responsabile HR',
  dv:    'Direttore Vendite',
  as:    'Area Sales',
  tm:    'Team Manager',
  pdv:   'Punto Vendita',
}

const toneRuolo = {
  admin: 'danger',
  bo:    'accent',
  hr:    'info',
  dv:    'warning',
  as:    'info',
  tm:    'accent',
  pdv:   'success',
}

export default function Admin() {
  const { profile } = useAuth()
  const myId = profile?.id

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filterRuolo, setRuolo] = useState('tutti')
  const [filterStato, setStato] = useState('tutti')

  const [dlgOpen, setDlgOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  async function fetchAll() {
    setLoading(true)
    const { data, error } = await supabase
      .from('utenti')
      .select('*')
      .order('cognome, nome')
    if (error) {
      toast.error(`Errore caricamento: ${error.message}`)
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterRuolo !== 'tutti' && r.ruolo !== filterRuolo) return false
      if (filterStato === 'attivi'      && !r.attivo) return false
      if (filterStato === 'disattivati' && r.attivo)  return false
      if (q) {
        const blob = `${r.nome ?? ''} ${r.cognome ?? ''} ${r.email ?? ''}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [rows, search, filterRuolo, filterStato])

  function openCreate() {
    setSelected(null)
    setDlgOpen(true)
  }
  function openEdit(row) {
    setSelected(row)
    setDlgOpen(true)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">
            Gestione utenti
          </h1>
          <p className="mt-1 text-text-muted">
            {filtered.length} di {rows.length}{' '}
            {rows.length === 1 ? 'account' : 'account'}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          Nuovo utente
        </Button>
      </div>

      {/* Filtri */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <div className="relative min-w-[260px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per nome, cognome o email…"
            className="w-full rounded-xl border border-border bg-bg py-2 pl-10 pr-3 text-sm text-white placeholder:text-text-muted/60 outline-none transition focus:border-accent"
          />
        </div>

        <FilterPill icon={Filter} label="Ruolo" value={filterRuolo} onChange={setRuolo}
          options={[
            ['tutti','Tutti'],
            ['admin','Admin'], ['bo','Back Office'], ['hr','Responsabile HR'],
            ['dv','Direttore Vendite'],
            ['as','Area Sales'], ['tm','Team Manager'], ['pdv','Punto Vendita'],
          ]}
        />
        <FilterPill label="Stato" value={filterStato} onChange={setStato}
          options={[['tutti','Tutti'],['attivi','Attivi'],['disattivati','Disattivati']]}
        />
      </div>

      {/* Tabella */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
            <Loader2 size={18} className="animate-spin" />
            Caricamento…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent-2">
              <ShieldCheck size={22} />
            </div>
            <p className="text-white">
              {rows.length === 0 ? 'Nessun utente ancora presente' : 'Nessun utente corrisponde ai filtri'}
            </p>
            {rows.length === 0 && (
              <Button onClick={openCreate} className="mt-2">
                <Plus size={16} />
                Crea primo utente
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg/50 text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-3 font-medium">Nominativo</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Ruolo</th>
                  <th className="px-5 py-3 font-medium">Stato</th>
                  <th className="px-5 py-3 font-medium">Creato il</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const iniziali = `${u.nome?.[0] ?? ''}${u.cognome?.[0] ?? ''}`.toUpperCase()
                  const isMe = u.id === myId
                  return (
                    <tr
                      key={u.id}
                      onClick={() => openEdit(u)}
                      className={cn(
                        'cursor-pointer border-t border-border transition-colors hover:bg-white/5',
                        !u.attivo && 'opacity-60',
                      )}
                    >
                      <td className="px-5 py-3 text-white">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary text-[11px] font-semibold text-white">
                            {iniziali || '??'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-medium">
                              {u.nome} {u.cognome}
                              {isMe && (
                                <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
                                  tu
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-text-muted truncate max-w-[260px]">
                        {u.email}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={toneRuolo[u.ruolo]}>{labelRuolo[u.ruolo]}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={u.attivo ? 'success' : 'neutral'}>
                          {u.attivo ? 'Attivo' : 'Disattivato'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-text-muted tabular-nums">
                        {formatDate(u.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UtenteDialog
        open={dlgOpen}
        onClose={() => setDlgOpen(false)}
        utente={selected}
        onSaved={fetchAll}
      />
    </div>
  )
}

// ---------- sub-componenti ----------

function FilterPill({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-1.5 text-sm">
      <span className="text-text-muted">{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-transparent pr-1 text-white outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v} className="bg-surface">{l}</option>
        ))}
      </select>
    </label>
  )
}
