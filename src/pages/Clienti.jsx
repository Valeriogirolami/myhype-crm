/**
 * Pagina Clienti — anagrafica clienti con filtri, ricerca, dettaglio (§4.1).
 *
 * Scope (§11):
 *  - Admin/BO/DV: vedono tutti i clienti
 *  - PdV/AS/TM: vedono solo i clienti che hanno almeno un contratto sui PdV
 *    in scope. (Filtro lato app dopo aver caricato i contratti del scope)
 */
import { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, Users as UsersIcon, Filter, User2, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { cn, formatDate } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import { getPdvScopeIds } from '@/lib/classifiche'
import { nomeCliente } from '@/lib/contratti'
import ClienteDialog from './ClienteDialog'

export default function Clienti() {
  const { profile } = useAuth()
  const ruolo = profile?.ruolo
  const hasScope = ['pdv', 'as', 'tm'].includes(ruolo)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState('tutti')

  const [selectedId, setSelectedId] = useState(null)

  async function fetchAll() {
    setLoading(true)
    try {
      // Se scope ristretto: prima trovo i clienti che hanno contratti sui PdV in scope
      let clienteIdsInScope = null
      if (hasScope) {
        const pdvIds = await getPdvScopeIds(profile)
        if (!pdvIds || pdvIds.length === 0) {
          setRows([])
          setLoading(false)
          return
        }
        const { data: ctr } = await supabase
          .from('contratti')
          .select('cliente_id')
          .in('pdv_id', pdvIds)
        clienteIdsInScope = Array.from(new Set((ctr || []).map(c => c.cliente_id)))
        if (clienteIdsInScope.length === 0) {
          setRows([])
          setLoading(false)
          return
        }
      }

      // Carico clienti
      let q = supabase.from('clienti').select('*').order('cognome').order('ragione_sociale')
      if (clienteIdsInScope) q = q.in('id', clienteIdsInScope)
      const { data: clienti, error } = await q
      if (error) throw error

      // Carico count contratti per cliente (una sola query batch)
      const ids = (clienti || []).map(c => c.id)
      let countMap = new Map()
      let lastDateMap = new Map()
      if (ids.length > 0) {
        const { data: ctr } = await supabase
          .from('contratti')
          .select('cliente_id, data_stipula, data_sottoscrizione')
          .in('cliente_id', ids)
        for (const c of ctr || []) {
          countMap.set(c.cliente_id, (countMap.get(c.cliente_id) || 0) + 1)
          // "Ultimo contratto" del cliente = quello con la data stipula
          // più recente (fallback su registrazione per contratti storici)
          const dataConfronto = c.data_stipula || c.data_sottoscrizione
          const prev = lastDateMap.get(c.cliente_id)
          if (!prev || dataConfronto > prev) {
            lastDateMap.set(c.cliente_id, dataConfronto)
          }
        }
      }

      const enriched = (clienti || []).map(c => ({
        ...c,
        n_contratti: countMap.get(c.id) || 0,
        ultima_data: lastDateMap.get(c.id) || null,
      }))
      setRows(enriched)
    } catch (err) {
      toast.error(`Errore caricamento clienti: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profile?.id) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterTipo !== 'tutti' && r.categoria !== filterTipo) return false
      if (q) {
        const blob = [
          r.nome, r.cognome, r.ragione_sociale, r.codice_fiscale,
          r.p_iva, r.email, r.telefono, r.telefono_fisso,
        ].join(' ').toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [rows, search, filterTipo])

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">Clienti</h1>
          <p className="mt-1 text-text-muted">
            {filtered.length} di {rows.length}{' '}
            {rows.length === 1 ? 'cliente' : 'clienti'}
            {hasScope && ' · solo clienti con contratti sui tuoi PdV'}
          </p>
        </div>
      </div>

      {/* Filtri */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <div className="relative min-w-[260px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per nome, cognome, CF, P.IVA, email…"
            className="w-full rounded-xl border border-border bg-bg py-2 pl-10 pr-3 text-sm text-white placeholder:text-text-muted/60 outline-none focus:border-accent"
          />
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-1.5 text-sm">
          <Filter size={12} className="text-text-muted" />
          <span className="text-text-muted">Tipologia:</span>
          <select
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value)}
            className="appearance-none bg-transparent pr-1 text-white outline-none"
          >
            <option value="tutti" className="bg-surface">Tutti</option>
            <option value="privato" className="bg-surface">Privati</option>
            <option value="azienda" className="bg-surface">Aziende</option>
          </select>
        </label>
      </div>

      {/* Tabella */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
            <Loader2 size={18} className="animate-spin" /> Caricamento…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent-2">
              <UsersIcon size={22} />
            </div>
            <p className="text-white">
              {rows.length === 0 ? 'Nessun cliente nel tuo scope' : 'Nessun cliente corrisponde ai filtri'}
            </p>
            <p className="text-sm text-text-muted max-w-md">
              I clienti vengono creati automaticamente quando inserisci un contratto.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg/50 text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-3 font-medium">Nominativo</th>
                  <th className="px-5 py-3 font-medium">CF / P.IVA</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Telefono</th>
                  <th className="px-5 py-3 font-medium text-right">Contratti</th>
                  <th className="px-5 py-3 font-medium">Ultimo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const isAzienda = c.categoria === 'azienda'
                  const Icon = isAzienda ? Building2 : User2
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-white/5"
                    >
                      <td className="px-5 py-3 text-white">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full',
                            isAzienda ? 'bg-info/15 text-info' : 'bg-accent/15 text-accent-2',
                          )}>
                            <Icon size={14} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium">{nomeCliente(c)}</div>
                            <Badge tone={isAzienda ? 'info' : 'accent'} className="mt-0.5 text-[9px]">
                              {isAzienda ? 'Azienda' : 'Privato'}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-xs tabular-nums text-white">{c.codice_fiscale}</div>
                        {c.p_iva && (
                          <div className="text-[10px] tabular-nums text-text-muted">P.IVA: {c.p_iva}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-text-muted truncate max-w-[220px]">
                        {c.email || '—'}
                      </td>
                      <td className="px-5 py-3 text-text-muted tabular-nums">
                        {c.telefono || '—'}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-white">
                        <span className="font-medium">{c.n_contratti}</span>
                      </td>
                      <td className="px-5 py-3 text-text-muted tabular-nums">
                        {c.ultima_data ? formatDate(c.ultima_data) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog dettaglio + modifica */}
      <ClienteDialog
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        clienteId={selectedId}
        onSaved={fetchAll}
      />
    </div>
  )
}
