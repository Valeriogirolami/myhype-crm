/**
 * Pagina Punti Vendita (§2).
 * - Lista completa con filtri rapidi, ricerca per nome, conteggio
 * - Admin/BO: creano nuovi PdV e modificano esistenti (click su riga)
 * - Altri ruoli: lettura soltanto
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Loader2, Store, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { formatDate, cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import PdvDialog from './PdvDialog'

// Etichette italiane + toni badge
const labelTipo       = { sinergia: 'Sinergia', galleria: 'Galleria' }
const toneTipo        = { sinergia: 'accent',   galleria: 'info' }
const labelCategoria  = { A: 'A', B: 'B', C: 'C', D: 'D' }
const toneCategoria   = { A: 'success', B: 'accent', C: 'warning', D: 'neutral' }
const labelStato      = { aperto: 'Aperto', chiuso: 'Chiuso' }
const toneStato       = { aperto: 'success', chiuso: 'neutral' }

export default function Pdv() {
  const { profile } = useAuth()
  const canEdit = ['admin', 'bo'].includes(profile?.ruolo)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtri
  const [search, setSearch]       = useState('')
  const [filterTipo, setTipo]     = useState('tutti')
  const [filterArea, setArea]     = useState('tutte')
  const [filterCat, setCat]       = useState('tutte')
  const [filterStato, setStato]   = useState('aperto') // default: nascondi i chiusi

  // Dialog
  const [dlgOpen, setDlgOpen] = useState(false)
  const [selected, setSelected] = useState(null)

  async function fetchPdv() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pdv')
      .select('*')
      .order('nome', { ascending: true })
    if (error) {
      toast.error(`Errore caricamento PdV: ${error.message}`)
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchPdv()
  }, [])

  // Filtro lato client (dataset piccolo → OK)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterTipo !== 'tutti'  && r.tipo !== filterTipo) return false
      if (filterArea !== 'tutte'  && r.area !== Number(filterArea)) return false
      if (filterCat  !== 'tutte'  && r.categoria !== filterCat) return false
      if (filterStato !== 'tutti' && r.stato !== filterStato) return false
      if (q && !r.nome.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, search, filterTipo, filterArea, filterCat, filterStato])

  function openCreate() {
    setSelected(null)
    setDlgOpen(true)
  }

  function openEdit(pdv) {
    if (!canEdit) return
    setSelected(pdv)
    setDlgOpen(true)
  }

  return (
    <div>
      {/* Header pagina */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">
            Punti Vendita
          </h1>
          <p className="mt-1 text-text-muted">
            {filtered.length} di {rows.length}{' '}
            {rows.length === 1 ? 'punto vendita' : 'punti vendita'}
          </p>
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus size={16} />
            Nuovo PdV
          </Button>
        )}
      </div>

      {/* Barra filtri */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
        {/* Ricerca */}
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per nome…"
            className="w-full rounded-xl border border-border bg-bg py-2 pl-10 pr-3 text-sm text-white placeholder:text-text-muted/60 outline-none transition focus:border-accent"
          />
        </div>

        <FilterPill icon={Filter} label="Tipo" value={filterTipo} onChange={setTipo}
          options={[['tutti','Tutti'],['sinergia','Sinergia'],['galleria','Galleria']]}
        />
        <FilterPill label="Area" value={filterArea} onChange={setArea}
          options={[['tutte','Tutte'],['1','Area 1'],['2','Area 2'],['3','Area 3'],['4','Area 4']]}
        />
        <FilterPill label="Categoria" value={filterCat} onChange={setCat}
          options={[['tutte','Tutte'],['A','A'],['B','B'],['C','C'],['D','D']]}
        />
        <FilterPill label="Stato" value={filterStato} onChange={setStato}
          options={[['aperto','Aperti'],['chiuso','Chiusi'],['tutti','Tutti']]}
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
            canCreate={canEdit}
            empty={rows.length === 0}
            onCreate={openCreate}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg/50 text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-3 font-medium">Nome</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Area</th>
                  <th className="px-5 py-3 font-medium">Categoria</th>
                  <th className="px-5 py-3 font-medium">Aperto dal</th>
                  <th className="px-5 py-3 font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => openEdit(r)}
                    className={cn(
                      'border-t border-border transition-colors',
                      canEdit ? 'cursor-pointer hover:bg-white/5' : '',
                    )}
                  >
                    <td className="px-5 py-3 text-white">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent-2">
                          <Store size={14} />
                        </div>
                        <span className="font-medium">{r.nome}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={toneTipo[r.tipo]}>{labelTipo[r.tipo]}</Badge>
                    </td>
                    <td className="px-5 py-3 text-white tabular-nums">Area {r.area}</td>
                    <td className="px-5 py-3">
                      <Badge tone={toneCategoria[r.categoria]}>{labelCategoria[r.categoria]}</Badge>
                    </td>
                    <td className="px-5 py-3 text-text-muted tabular-nums">
                      {formatDate(r.data_apertura)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={toneStato[r.stato]}>{labelStato[r.stato]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog CRUD */}
      <PdvDialog
        open={dlgOpen}
        onClose={() => setDlgOpen(false)}
        pdv={selected}
        onSaved={fetchPdv}
      />
    </div>
  )
}

// ---------- Sub-componenti ----------

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
        <Store size={22} />
      </div>
      <p className="text-white">
        {empty ? 'Nessun Punto Vendita ancora presente' : 'Nessun PdV corrisponde ai filtri'}
      </p>
      <p className="text-sm text-text-muted max-w-md">
        {empty
          ? 'Crea il primo PdV per iniziare — basta pochi campi, le assegnazioni dei venditori le colleghiamo dopo.'
          : 'Prova a rimuovere qualche filtro o a cambiare la ricerca.'}
      </p>
      {empty && canCreate && (
        <Button onClick={onCreate} className="mt-2">
          <Plus size={16} />
          Crea primo PdV
        </Button>
      )}
    </div>
  )
}
