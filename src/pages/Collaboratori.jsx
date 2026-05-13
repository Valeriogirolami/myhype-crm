/**
 * Pagina Collaboratori (§3).
 * Anagrafica venditori + tutte le altre figure operative (TM, AS, DV, ecc.).
 *
 * - Lista con filtri Ruolo / Regime fiscale / Stato + ricerca testuale (nome, cognome, CF)
 * - Click riga → dialog modifica
 * - Admin/BO creano e modificano (§11)
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Loader2, UserCog, ExternalLink, Filter, KeyRound, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import CollaboratoreDialog from './CollaboratoreDialog'
import UtenteDialog from './UtenteDialog'
import { getPdvScopeIds } from '@/lib/classifiche'

const labelRegime = {
  ritenuta_acconto: 'Ritenuta d\'acconto',
  cococo: 'Co.co.co.',
  p_iva: 'P.IVA',
  assunto: 'Assunto',
}

const labelStato = { attivo: 'Attivo', disattivato: 'Disattivato' }
const toneStato  = { attivo: 'success', disattivato: 'neutral' }

// Tono badge in base al ruolo (best effort)
function toneRuolo(ruolo) {
  if (!ruolo) return 'neutral'
  const r = ruolo.toLowerCase()
  if (r.includes('direttore'))   return 'danger'
  if (r.includes('area'))        return 'info'
  if (r.includes('team'))        return 'accent'
  if (r.includes('senior'))      return 'warning'
  return 'neutral'
}

/**
 * Solo TM/AS/DV possono avere account utente (§1.2: i venditori NON hanno account).
 */
function puoAvereAccount(ruolo) {
  if (!ruolo) return false
  const r = ruolo.toLowerCase()
  return r.includes('direttore') || r.includes('area') || r.includes('team')
}

export default function Collaboratori() {
  const { profile } = useAuth()
  const canEdit = ['admin', 'bo'].includes(profile?.ruolo)
  const isAsTm = ['as', 'tm'].includes(profile?.ruolo)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  // Set di id collaboratori "in scope" (per AS/TM) — null = nessun filtro (admin/bo/dv)
  const [scopeIds, setScopeIds] = useState(null)

  const [search, setSearch] = useState('')
  const [filterRuolo, setRuolo] = useState('tutti')
  const [filterRegime, setRegime] = useState('tutti')
  const [filterStato, setStato] = useState('attivo')  // default: nascondi disattivati

  const [dlgOpen, setDlgOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  // Dialog "Crea account per collaboratore"
  const [accountFor, setAccountFor] = useState(null)

  async function fetchAll() {
    setLoading(true)

    // Per AS/TM: trovo i collaboratori_id associati ai miei PdV via pdv_collaboratori
    let collaboratoriIds = null
    if (isAsTm) {
      const pdvScope = await getPdvScopeIds(profile)
      if (!pdvScope || pdvScope.length === 0) {
        setRows([])
        setScopeIds([])
        setLoading(false)
        return
      }
      const { data: assoc } = await supabase
        .from('pdv_collaboratori')
        .select('collaboratore_id')
        .in('pdv_id', pdvScope)
      collaboratoriIds = Array.from(new Set((assoc || []).map(a => a.collaboratore_id)))
      setScopeIds(collaboratoriIds)
      if (collaboratoriIds.length === 0) {
        setRows([])
        setLoading(false)
        return
      }
    } else {
      setScopeIds(null)
    }

    let q = supabase
      .from('collaboratori')
      .select('*')
      .order('cognome', { ascending: true })
      .order('nome', { ascending: true })
    if (collaboratoriIds) q = q.in('id', collaboratoriIds)

    const { data, error } = await q
    if (error) {
      toast.error(`Errore caricamento: ${error.message}`)
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  // Lista ruoli effettivamente presenti, per popolare il filtro dinamicamente
  const ruoliPresenti = useMemo(() => {
    return Array.from(new Set(rows.map(r => r.ruolo).filter(Boolean))).sort()
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterRuolo  !== 'tutti' && r.ruolo !== filterRuolo) return false
      if (filterRegime !== 'tutti' && r.regime_fiscale !== filterRegime) return false
      if (filterStato  !== 'tutti' && r.stato !== filterStato) return false
      if (q) {
        const blob = `${r.nome ?? ''} ${r.cognome ?? ''} ${r.codice_fiscale ?? ''}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [rows, search, filterRuolo, filterRegime, filterStato])

  function openCreate() {
    setSelected(null)
    setDlgOpen(true)
  }
  function openEdit(row) {
    if (!canEdit) return
    setSelected(row)
    setDlgOpen(true)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">Collaboratori</h1>
          <p className="mt-1 text-text-muted">
            {filtered.length} di {rows.length}{' '}
            {rows.length === 1 ? 'collaboratore' : 'collaboratori'}
            {isAsTm && ' · solo persone associate ai tuoi PdV'}
          </p>
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus size={16} />
            Nuovo collaboratore
          </Button>
        )}
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
            placeholder="Cerca per nome, cognome o CF…"
            className="w-full rounded-xl border border-border bg-bg py-2 pl-10 pr-3 text-sm text-white placeholder:text-text-muted/60 outline-none transition focus:border-accent"
          />
        </div>

        <FilterPill icon={Filter} label="Ruolo" value={filterRuolo} onChange={setRuolo}
          options={[['tutti','Tutti'], ...ruoliPresenti.map(r => [r, r])]}
        />
        <FilterPill label="Regime" value={filterRegime} onChange={setRegime}
          options={[
            ['tutti','Tutti'],
            ['ritenuta_acconto', 'Ritenuta d\'acconto'],
            ['cococo','Co.co.co.'],
            ['p_iva','P.IVA'],
            ['assunto','Assunto'],
          ]}
        />
        <FilterPill label="Stato" value={filterStato} onChange={setStato}
          options={[['attivo','Attivi'],['disattivato','Disattivati'],['tutti','Tutti']]}
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
          <EmptyState
            empty={rows.length === 0}
            canCreate={canEdit}
            onCreate={openCreate}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg/50 text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-3 font-medium">Nominativo</th>
                  <th className="px-5 py-3 font-medium">Ruolo</th>
                  <th className="px-5 py-3 font-medium">Regime</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Telefono</th>
                  <th className="px-5 py-3 font-medium">Stato</th>
                  <th className="px-5 py-3 font-medium">Account</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const iniziali = `${c.nome?.[0] ?? ''}${c.cognome?.[0] ?? ''}`.toUpperCase()
                  return (
                    <tr
                      key={c.id}
                      onClick={() => openEdit(c)}
                      className={cn(
                        'border-t border-border transition-colors',
                        canEdit ? 'cursor-pointer hover:bg-white/5' : '',
                        c.stato === 'disattivato' && 'opacity-60',
                      )}
                    >
                      <td className="px-5 py-3 text-white">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary text-[11px] font-semibold text-white">
                            {iniziali || '??'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium">{c.nome} {c.cognome}</div>
                            {c.codice_fiscale && (
                              <div className="text-[11px] tabular-nums text-text-muted">
                                {c.codice_fiscale}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={toneRuolo(c.ruolo)}>{c.ruolo || '—'}</Badge>
                      </td>
                      <td className="px-5 py-3 text-text-muted">
                        {c.regime_fiscale ? labelRegime[c.regime_fiscale] : '—'}
                      </td>
                      <td className="px-5 py-3 text-white truncate max-w-[200px]">
                        {c.email || <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-5 py-3 text-text-muted tabular-nums">
                        {c.telefono || '—'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={toneStato[c.stato]}>{labelStato[c.stato]}</Badge>
                      </td>
                      <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                        {c.account_id ? (
                          <Badge tone="success" className="text-[10px]">
                            <CheckCircle2 size={10} className="mr-0.5" />
                            Collegato
                          </Badge>
                        ) : canEdit && puoAvereAccount(c.ruolo) ? (
                          <button
                            onClick={() => setAccountFor(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-2.5 py-1 text-[11px] font-medium text-white hover:border-accent/40"
                            title="Crea account utente"
                          >
                            <KeyRound size={11} className="text-accent-2" />
                            Crea account
                          </button>
                        ) : (
                          <span className="text-[11px] text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {c.link_drive && (
                          <a
                            href={c.link_drive}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            title="Apri cartella Drive"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-white/5 hover:text-accent-2"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CollaboratoreDialog
        open={dlgOpen}
        onClose={() => setDlgOpen(false)}
        collaboratore={selected}
        onSaved={fetchAll}
      />

      {/* Dialog "Crea account" per il collaboratore selezionato */}
      <UtenteDialog
        open={!!accountFor}
        onClose={() => setAccountFor(null)}
        utente={null}
        linkCollaboratore={accountFor}
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

function EmptyState({ empty, canCreate, onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent-2">
        <UserCog size={22} />
      </div>
      <p className="text-white">
        {empty ? 'Nessun collaboratore ancora presente' : 'Nessun collaboratore corrisponde ai filtri'}
      </p>
      <p className="text-sm text-text-muted max-w-md">
        {empty
          ? 'Aggiungi venditori, Team Manager, Area Sales e Direttore Vendite — l\'assegnazione ai PdV avviene dalla pagina dei punti vendita.'
          : 'Prova a cambiare ricerca o filtri.'}
      </p>
      {empty && canCreate && (
        <Button onClick={onCreate} className="mt-2">
          <Plus size={16} />
          Crea primo collaboratore
        </Button>
      )}
    </div>
  )
}
