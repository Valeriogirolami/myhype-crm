/**
 * Pagina Organigramma (§9.7) — vista ad ALBERO PdV-centrica.
 *
 *  Rete Hype
 *      |
 *  ┌───┼───┐
 * Area1 Area2 Area3...
 *  |     |     |
 * PdV1  PdV5  PdV8        (lista verticale per area)
 * PdV2  PdV6  ...
 * PdV3
 *
 * Click su un PdV → si esplode mostrando un sotto-albero con 4 ruoli
 * (DV / AS / TM / Venditori), ognuno con la lista delle persone.
 *
 * Scope per ruolo (§11):
 *  - Admin/BO/DV: tutti i PdV
 *  - AS/TM: solo i PdV in cui sono assegnati
 *  - PdV: solo il proprio
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Loader2, ChevronRight, Network, Store, Crown, ShieldCheck,
  Briefcase, Users as UsersIcon, Search, Building2,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { cn, formatDate } from '@/lib/utils'
import Badge from '@/components/ui/Badge'

const RUOLI_VIS = [
  { v: 'dv',        l: 'Direttore Vendite', icon: Crown,       tone: 'danger',  short: 'DV' },
  { v: 'as',        l: 'Area Sales',        icon: ShieldCheck, tone: 'warning', short: 'AS' },
  { v: 'tm',        l: 'Team Manager',      icon: Briefcase,   tone: 'info',    short: 'TM' },
  { v: 'venditore', l: 'Venditori',         icon: UsersIcon,   tone: 'accent',  short: 'V'  },
]

export default function Organigramma() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)

  const [pdvList, setPdvList] = useState([])
  const [associazioni, setAssociazioni] = useState({})

  const [search, setSearch] = useState('')
  const [filterArea, setFilterArea] = useState('tutte')
  const [aperti, setAperti] = useState(new Set())

  async function fetchAll() {
    setLoading(true)
    try {
      const ruolo = profile?.ruolo
      let pdvQuery = supabase
        .from('pdv')
        .select('id, nome, tipo, area, categoria, data_apertura, stato, account_id')
        .eq('stato', 'aperto')
        .order('area')
        .order('nome')

      if (ruolo === 'pdv') {
        pdvQuery = pdvQuery.eq('account_id', profile.id)
      } else if (['as', 'tm'].includes(ruolo)) {
        const { data: coll } = await supabase
          .from('collaboratori').select('id').eq('account_id', profile.id).maybeSingle()
        if (coll) {
          const { data: assoc } = await supabase
            .from('pdv_collaboratori')
            .select('pdv_id')
            .eq('collaboratore_id', coll.id)
            .eq('ruolo_nel_pdv', ruolo)
          const ids = (assoc || []).map(a => a.pdv_id)
          if (ids.length > 0) pdvQuery = pdvQuery.in('id', ids)
          else { setPdvList([]); setAssociazioni({}); setLoading(false); return }
        } else {
          setPdvList([]); setAssociazioni({}); setLoading(false); return
        }
      }

      const { data: pdvData, error: errPdv } = await pdvQuery
      if (errPdv) throw errPdv
      setPdvList(pdvData || [])

      const ids = (pdvData || []).map(p => p.id)
      if (ids.length === 0) { setAssociazioni({}); setLoading(false); return }

      const { data: assocData, error: errAssoc } = await supabase
        .from('pdv_collaboratori')
        .select(`pdv_id, ruolo_nel_pdv, collaboratori(id, nome, cognome, ruolo, stato)`)
        .in('pdv_id', ids)
      if (errAssoc) throw errAssoc

      const map = {}
      for (const id of ids) map[id] = { dv: [], as: [], tm: [], venditore: [] }
      for (const r of assocData || []) {
        if (!r.collaboratori || r.collaboratori.stato !== 'attivo') continue
        if (!map[r.pdv_id][r.ruolo_nel_pdv]) continue
        map[r.pdv_id][r.ruolo_nel_pdv].push({
          id: r.collaboratori.id,
          nome: r.collaboratori.nome,
          cognome: r.collaboratori.cognome,
          ruolo: r.collaboratori.ruolo,
        })
      }
      setAssociazioni(map)
    } catch (err) {
      toast.error(`Errore organigramma: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profile?.id) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Filtro + raggruppo per area
  const aree = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = pdvList.filter(p => {
      if (filterArea !== 'tutte' && p.area !== Number(filterArea)) return false
      if (q && !p.nome.toLowerCase().includes(q)) return false
      return true
    })
    const map = {}
    for (const p of filtered) {
      if (!map[p.area]) map[p.area] = []
      map[p.area].push(p)
    }
    return Object.entries(map)
      .map(([area, pdv]) => ({ area: Number(area), pdv }))
      .sort((a, b) => a.area - b.area)
  }, [pdvList, search, filterArea])

  function toggle(pdvId) {
    setAperti(prev => {
      const next = new Set(prev)
      if (next.has(pdvId)) next.delete(pdvId)
      else next.add(pdvId)
      return next
    })
  }
  function tuttiAperti() { setAperti(new Set(pdvList.map(p => p.id))) }
  function tuttiChiusi() { setAperti(new Set()) }

  const totalePdv = pdvList.length

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">Organigramma</h1>
          <p className="mt-1 text-text-muted">
            Albero rete Hype · clicca un PdV per esplodere le persone assegnate
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={tuttiAperti}
            className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-white hover:border-accent/40">
            Espandi tutto
          </button>
          <button onClick={tuttiChiusi}
            className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-text-muted hover:text-white">
            Comprimi
          </button>
        </div>
      </div>

      {/* Filtri */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <div className="relative min-w-[260px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca PdV per nome…"
            className="w-full rounded-xl border border-border bg-bg py-2 pl-10 pr-3 text-sm text-white placeholder:text-text-muted/60 outline-none focus:border-accent"
          />
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-1.5 text-sm">
          <span className="text-text-muted">Area:</span>
          <select
            value={filterArea}
            onChange={e => setFilterArea(e.target.value)}
            className="appearance-none bg-transparent pr-1 text-white outline-none"
          >
            <option value="tutte" className="bg-surface">Tutte</option>
            <option value="1" className="bg-surface">Area 1</option>
            <option value="2" className="bg-surface">Area 2</option>
            <option value="3" className="bg-surface">Area 3</option>
            <option value="4" className="bg-surface">Area 4</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
          <Loader2 size={18} className="animate-spin" /> Caricamento organigramma…
        </div>
      ) : pdvList.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-10 text-center text-sm text-text-muted">
          Nessun PdV nel tuo scope.
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto pb-6">
          <div className="mx-auto inline-flex flex-col items-center min-w-full">
            {/* === ROOT === */}
            <RootNode totalPdv={totalePdv} totalAree={aree.length} />

            {/* Connettore Root → Aree (verticale) */}
            <div className="conn-v-down" />

            {/* === ROW 4 AREE (fork orizzontale) === */}
            <div
              className="org-row"
              data-n={aree.length}
              style={{ '--n': aree.length, minWidth: `${Math.max(560, aree.length * 280)}px` }}
            >
              {aree.map(({ area, pdv }) => (
                <div key={area} className="org-col">
                  <AreaNode area={area} count={pdv.length} />
                  {/* Linea verticale che scende dall'Area alla lista PdV */}
                  <div className="conn-v-down" />
                  {/* Lista PdV in colonna verticale — ognuno collegato con stelo */}
                  <PdvBranch
                    pdvList={pdv}
                    associazioni={associazioni}
                    aperti={aperti}
                    onToggle={toggle}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- nodi ad albero ----------

function RootNode({ totalPdv, totalAree }) {
  return (
    <div className="rounded-2xl border border-accent bg-gradient-primary px-6 py-3 shadow-soft">
      <div className="flex items-center gap-3">
        <Building2 size={18} className="text-white" />
        <div>
          <div className="text-sm font-semibold text-white">Rete Hype</div>
          <div className="text-[11px] text-white/80 tabular-nums">
            {totalPdv} {totalPdv === 1 ? 'PdV' : 'PdV'} · {totalAree} {totalAree === 1 ? 'area' : 'aree'}
          </div>
        </div>
      </div>
    </div>
  )
}

function AreaNode({ area, count }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-2.5 shadow-soft">
      <div className="flex items-center gap-2">
        <Network size={14} className="text-accent-2" />
        <div>
          <div className="text-sm font-medium text-white">Area {area}</div>
          <div className="text-[10px] text-text-muted tabular-nums">
            {count} {count === 1 ? 'PdV' : 'PdV'}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * "Ramo" verticale dei PdV di un'area:
 *  - una linea verticale continua (border-left)
 *  - ogni PdV ha un piccolo "tick" orizzontale che si stacca dalla linea
 */
function PdvBranch({ pdvList, associazioni, aperti, onToggle }) {
  if (pdvList.length === 0) return null
  return (
    <div className="relative pl-6">
      {/* Linea verticale che corre per tutta la colonna PdV */}
      <div className="absolute left-3 top-0 bottom-2 w-[2px] bg-border" />
      <div className="space-y-3">
        {pdvList.map(p => (
          <div key={p.id} className="relative">
            {/* tick orizzontale dalla linea verticale alla card */}
            <div className="absolute -left-3 top-6 h-[2px] w-3 bg-border" />
            <PdvNode
              pdv={p}
              persone={associazioni[p.id]}
              aperto={aperti.has(p.id)}
              onToggle={() => onToggle(p.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function PdvNode({ pdv, persone, aperto, onToggle }) {
  const totalePersone = persone
    ? persone.dv.length + persone.as.length + persone.tm.length + persone.venditore.length
    : 0

  // Ruoli effettivamente popolati per il fork inferiore
  const ruoliPopolati = RUOLI_VIS.filter(r => (persone?.[r.v]?.length || 0) > 0)
  const nFork = Math.max(1, ruoliPopolati.length)

  return (
    <div className={cn(
      'flex flex-col items-stretch',
      aperto && 'rounded-2xl bg-bg/30 p-3 ring-1 ring-border',
    )}>
      {/* Card PdV (cliccabile) */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl border bg-surface px-3 py-2 text-left transition shadow-soft',
          aperto ? 'border-accent/60' : 'border-border hover:border-accent/40',
        )}
      >
        <ChevronRight
          size={14}
          className={cn('text-text-muted transition-transform shrink-0', aperto && 'rotate-90')}
        />
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent-2 shrink-0">
          <Store size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-white truncate">{pdv.nome}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-text-muted">
            <Badge tone={pdv.tipo === 'sinergia' ? 'accent' : 'info'} className="text-[9px]">
              {pdv.tipo === 'sinergia' ? 'Sinergia' : 'Galleria'}
            </Badge>
            <span>Cat {pdv.categoria}</span>
            <span>· {formatDate(pdv.data_apertura)}</span>
          </div>
        </div>
        {/* Pillole conteggio per ruolo (compatte) */}
        <div className="hidden items-center gap-1 shrink-0 lg:flex">
          {RUOLI_VIS.map(r => {
            const count = persone?.[r.v]?.length || 0
            if (count === 0) return null
            return (
              <span
                key={r.v}
                title={r.l}
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ring-1',
                  r.tone === 'accent'  && 'bg-accent/10 text-accent-2 ring-accent/30',
                  r.tone === 'info'    && 'bg-info/10 text-info ring-info/30',
                  r.tone === 'warning' && 'bg-warning/10 text-warning ring-warning/30',
                  r.tone === 'danger'  && 'bg-danger/10 text-danger ring-danger/30',
                )}
              >
                {r.short}{count}
              </span>
            )
          })}
        </div>
      </button>

      {/* Sotto-albero persone */}
      {aperto && (
        totalePersone === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border p-3 text-center text-xs italic text-text-muted">
            Nessuna persona assegnata.
          </div>
        ) : (
          <div className="mt-1">
            {/* Connettore verticale dalla card al fork dei ruoli */}
            <div className="conn-v-down" />
            {/* Fork orizzontale: una colonna per ogni ruolo popolato */}
            <div
              className="org-row"
              data-n={nFork}
              style={{ '--n': nFork }}
            >
              {ruoliPopolati.map(r => (
                <div key={r.v} className="org-col">
                  <RuoloNode ruolo={r} persone={persone[r.v]} />
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}

function RuoloNode({ ruolo, persone }) {
  const Icon = ruolo.icon
  return (
    <div className="flex w-full flex-col items-stretch">
      {/* Header ruolo */}
      <div className={cn(
        'flex items-center gap-2 rounded-xl border px-3 py-2 shadow-soft',
        ruolo.tone === 'accent'  && 'border-accent/40 bg-accent/5',
        ruolo.tone === 'info'    && 'border-info/40 bg-info/5',
        ruolo.tone === 'warning' && 'border-warning/40 bg-warning/5',
        ruolo.tone === 'danger'  && 'border-danger/40 bg-danger/5',
      )}>
        <div className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg',
          ruolo.tone === 'accent'  && 'bg-accent/15 text-accent-2',
          ruolo.tone === 'info'    && 'bg-info/15 text-info',
          ruolo.tone === 'warning' && 'bg-warning/15 text-warning',
          ruolo.tone === 'danger'  && 'bg-danger/15 text-danger',
        )}>
          <Icon size={12} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-white">{ruolo.l}</div>
          <div className="text-[10px] text-text-muted tabular-nums">{persone.length}</div>
        </div>
      </div>

      {/* Lista persone (verticale, con linea continua a sinistra come per i PdV) */}
      <div className="mt-2 relative pl-6">
        <div className="absolute left-3 top-0 bottom-2 w-[2px] bg-border" />
        <ul className="space-y-1.5">
          {persone.map(p => (
            <li key={p.id} className="relative">
              <div className="absolute -left-3 top-3 h-[2px] w-3 bg-border" />
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-[9px] font-semibold text-white">
                  {(p.nome?.[0] || '') + (p.cognome?.[0] || '')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-white">{p.nome} {p.cognome}</div>
                  <div className="truncate text-[9px] text-text-muted">{p.ruolo}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
