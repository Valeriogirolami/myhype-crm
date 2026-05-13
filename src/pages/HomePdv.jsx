/**
 * Dashboard Home — versione PdV (§9.5).
 *
 * Widget:
 *  - KPI: Contratti mese / Punti / Fatturato PdV previsto / Scostamento target
 *  - CTA "+ Inserisci nuovo contratto" (visibile e in evidenza)
 *  - Card Target 3 prodotti (Mobile/Fisso/Energia) con Produzione/Previsione/Target
 *  - Card "Ultimi 10 contratti inseriti"
 *  - Card "Top venditori del PdV" (classifica interna, ordinata per punti)
 *
 * Nota: il fatturato mostrato è quello PREVISTO (validati nel mese), NON
 * l'attualizzato (§9.5). Il PdV vede sempre solo il fatturato PdV, mai
 * quello azienda.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Plus, FileCheck, TrendingUp, Coins, Target as TargetIcon, Loader2,
  Smartphone, Phone, Zap, Trophy, Users as UsersIcon, FileText,
  ArrowUpRight, ArrowDownRight, Minus, Crown,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { cn, formatEuro, formatInt, formatDate } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import MesePicker from '@/components/ui/MesePicker'
import { STATI, PRODOTTI } from '@/lib/contratti'
import {
  fetchContrattiMese, fetchTargetPdv, aggregaPerProdotto,
  tipoMese, giorniTotaliMese, giorniConsumati,
} from '@/lib/dashboard'
import { classificaVenditori } from '@/lib/classifiche'
import ContrattoNuovoDialog from './ContrattoNuovoDialog'

const PRODOTTI_VIS = [
  { v: 'mobile',  l: 'Mobile',  icon: Smartphone, color: 'accent' },
  { v: 'fisso',   l: 'Fisso',   icon: Phone,      color: 'info' },
  { v: 'energia', l: 'Energia', icon: Zap,        color: 'warning' },
]

export default function HomePdv() {
  const { profile } = useAuth()
  const [meseSel, setMeseSel] = useState(currentYM())
  const [loading, setLoading] = useState(true)
  const [nuovoOpen, setNuovoOpen] = useState(false)

  const [pdvMio, setPdvMio] = useState(null)
  const [contratti, setContratti] = useState([])
  const [ultimi10, setUltimi10] = useState([])
  const [target, setTarget] = useState({ mobile: 0, fisso: 0, energia: 0 })

  async function fetchAll() {
    setLoading(true)
    try {
      // 1) Trovo il PdV dell'utente
      const { data: pdv, error: errPdv } = await supabase
        .from('pdv')
        .select('id, nome, tipo, area, categoria, data_apertura, stato')
        .eq('account_id', profile.id)
        .maybeSingle()
      if (errPdv) throw errPdv
      if (!pdv) {
        setPdvMio(null)
        setLoading(false)
        return
      }
      setPdvMio(pdv)

      // 2) Contratti del mese — solo del proprio PdV (filtro app, RLS già consente)
      const tutti = await fetchContrattiMese(meseSel)
      const miei = tutti.filter(c => c.pdv?.id === pdv.id)
      setContratti(miei)

      // 3) Target del PdV (override o base)
      const t = await fetchTargetPdv(pdv, meseSel)
      setTarget(t)

      // 4) Ultimi 10 contratti inseriti (qualsiasi stato, ordinati per data)
      const { data: ultimi, error: errUlt } = await supabase
        .from('contratti')
        .select(`
          id, data_sottoscrizione, prodotto, stato,
          fatturato_pdv_snap, punti_snap,
          cliente:clienti(id, nome, cognome, ragione_sociale, categoria, codice_fiscale),
          venditore:collaboratori(id, nome, cognome),
          contratto_sottoprodotti(sottoprodotti(punti, fatturato_pdv))
        `)
        .eq('pdv_id', pdv.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (errUlt) throw errUlt
      setUltimi10(ultimi || [])
    } catch (err) {
      toast.error(`Errore caricamento dashboard: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profile?.id) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meseSel, profile?.id])

  // ===== KPI =====
  const aggr = useMemo(() => aggregaPerProdotto(contratti, meseSel), [contratti, meseSel])
  const totContratti = contratti.length
  const totPunti = contratti.reduce((s, c) => {
    const t = (c.stato === 'gettonato' || c.stato === 'stornato')
      ? (c.punti_snap || 0)
      : (c.contratto_sottoprodotti || []).reduce((ss, r) => ss + (r.sottoprodotti?.punti || 0), 0)
    return s + t
  }, 0)
  const fattPrevisto = contratti
    .filter(c => c.stato === 'validato')
    .reduce((s, c) => {
      const sps = (c.contratto_sottoprodotti || []).map(r => r.sottoprodotti).filter(Boolean)
      return s + sps.reduce((ss, sp) => ss + (sp.fatturato_pdv || 0), 0)
    }, 0)
  const targetTot = target.mobile + target.fisso + target.energia
  const scostamento = totContratti - targetTot
  const scostamentoPct = targetTot > 0 ? Math.round((scostamento / targetTot) * 100) : 0

  // ===== Classifica venditori interna del PdV =====
  const topVenditoriPdv = useMemo(
    () => classificaVenditori(contratti, null, 'punti'),
    [contratti]
  )

  const giornoOggi = giorniConsumati(meseSel)
  const giorniTot = giorniTotaliMese(meseSel)

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
        <Loader2 size={18} className="animate-spin" /> Caricamento dashboard…
      </div>
    )
  }

  if (!pdvMio) {
    return (
      <div className="rounded-2xl border border-warning/40 bg-warning/10 p-6 text-center">
        <p className="text-white">Il tuo account non è collegato a un Punto Vendita.</p>
        <p className="mt-1 text-sm text-text-muted">Contatta un amministratore.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">
            Benvenuto, <span className="font-medium">{pdvMio.nome}</span>
          </h1>
          <p className="mt-1 text-text-muted">
            {pdvMio.tipo === 'sinergia' ? 'Sinergia' : 'Galleria'} ·{' '}
            Categoria {pdvMio.categoria} · Area {pdvMio.area}
            {tipoMese(meseSel) === 'corrente' && ` · giorno ${giornoOggi}/${giorniTot}`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px]">
            <label className="mb-1.5 block text-xs font-medium text-text-muted">Mese</label>
            <MesePicker value={meseSel} onChange={v => v && setMeseSel(v)} />
          </div>
          <Button onClick={() => setNuovoOpen(true)}>
            <Plus size={16} /> Inserisci contratto
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={FileCheck} label="Contratti mese" value={formatInt(totContratti)}
          hint={`${formatInt(targetTot)} target del tuo PdV`} />
        <KpiCard icon={TrendingUp} label="Punti totali" value={formatInt(totPunti)}
          hint="Validati / Gettonati / Stornati" />
        <KpiCard icon={Coins} label="Fatturato PdV previsto" value={formatEuro(fattPrevisto)}
          hint="Solo contratti validati" />
        <KpiCard icon={TargetIcon} label="Scostamento target"
          value={`${scostamento >= 0 ? '+' : ''}${formatInt(scostamento)}`}
          hint={`${scostamentoPct >= 0 ? '+' : ''}${scostamentoPct}% sul target`}
          tone={scostamento >= 0 ? 'success' : 'danger'} />
      </div>

      {/* Riga: Target 3 prodotti */}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <TargetIcon size={16} className="text-accent-2" />
          <h3 className="text-sm font-medium uppercase tracking-wider text-white">
            Target del mese · {pdvMio.nome}
          </h3>
          <span className="text-xs text-text-muted">
            ({target.origine === 'override' ? 'override personalizzato' : 'da combo Tipo×Categoria'})
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {PRODOTTI_VIS.map(p => (
            <TargetProdottoCard
              key={p.v}
              prodotto={p}
              produzione={aggr[p.v].produzione}
              previsione={aggr[p.v].previsione}
              target={target[p.v]}
            />
          ))}
        </div>
      </div>

      {/* Riga: Ultimi contratti + Top venditori interni */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UltimiContrattiCard ultimi={ultimi10} />
        <TopVenditoriPdvCard righe={topVenditoriPdv} />
      </div>

      {/* Dialog nuovo contratto */}
      <ContrattoNuovoDialog
        open={nuovoOpen}
        onClose={() => setNuovoOpen(false)}
        onCreated={fetchAll}
      />
    </div>
  )
}

// ---------- sub-componenti ----------

function KpiCard({ icon: Icon, label, value, hint, tone = 'neutral' }) {
  const valueColor =
    tone === 'success' ? 'text-success' :
    tone === 'danger'  ? 'text-danger'  :
                          'text-white'
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft transition hover:border-accent/40">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">{label}</span>
        <Icon size={18} className="text-accent-2" />
      </div>
      <div className={cn('mt-4 text-3xl font-medium tabular-nums', valueColor)}>
        {value}
      </div>
      <div className="mt-1 text-xs text-text-muted">{hint}</div>
    </div>
  )
}

function TargetProdottoCard({ prodotto, produzione, previsione, target }) {
  const Icon = prodotto.icon
  const pct = target > 0 ? Math.min(100, Math.round((produzione / target) * 100)) : 0
  const previsionePct = target > 0 ? Math.min(100, Math.round((previsione / target) * 100)) : 0
  const colorByTone = {
    accent:  '#2B6CFF',
    info:    '#7A9BFF',
    warning: '#F5B042',
  }
  const barColor = colorByTone[prodotto.color] || '#2B6CFF'

  return (
    <div className="rounded-xl border border-border bg-bg/30 p-4">
      <div className="flex items-center gap-2">
        <div className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg',
          prodotto.color === 'accent'  && 'bg-accent/10 text-accent-2',
          prodotto.color === 'info'    && 'bg-info/10 text-info',
          prodotto.color === 'warning' && 'bg-warning/10 text-warning',
        )}>
          <Icon size={14} />
        </div>
        <div className="text-sm font-medium text-white">{prodotto.l}</div>
      </div>

      {/* Barra produzione vs target */}
      <div className="mt-3">
        <div className="mb-1 flex items-end justify-between gap-2 text-xs">
          <div>
            <span className="text-2xl font-semibold tabular-nums text-white">{formatInt(produzione)}</span>
            <span className="ml-1 text-text-muted">/ {formatInt(target)}</span>
          </div>
          <div className="text-right">
            <div className="text-text-muted">Previsione fine mese</div>
            <div className="tabular-nums text-white font-medium">{formatInt(previsione)}</div>
          </div>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg">
          {/* Barra produzione (piena) */}
          <div className="h-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-text-muted">
          <span>{pct}% raggiunto</span>
          <span>Proiezione: {previsionePct}%</span>
        </div>
      </div>
    </div>
  )
}

function UltimiContrattiCard({ ultimi }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
      <div className="flex items-center gap-2 border-b border-border bg-bg/30 px-5 py-3">
        <FileText size={16} className="text-accent-2" />
        <h3 className="text-sm font-medium uppercase tracking-wider text-white">
          Ultimi 10 contratti
        </h3>
      </div>
      {ultimi.length === 0 ? (
        <div className="p-6 text-center text-sm text-text-muted">
          Nessun contratto inserito.
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {ultimi.map(c => {
            const statoMeta = STATI[c.stato]
            const prodMeta = PRODOTTI[c.prodotto]
            const cli = c.cliente
            const nomeCli = cli?.categoria === 'azienda'
              ? cli?.ragione_sociale
              : `${cli?.nome || ''} ${cli?.cognome || ''}`.trim() || '—'
            return (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{nomeCli}</span>
                    {prodMeta && <Badge tone={prodMeta.tone} className="text-[9px]">{prodMeta.label}</Badge>}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {formatDate(c.data_sottoscrizione)}
                    {c.venditore && ` · ${c.venditore.nome} ${c.venditore.cognome}`}
                  </div>
                </div>
                {statoMeta && <Badge tone={statoMeta.tone} className="text-[10px]">{statoMeta.label}</Badge>}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function TopVenditoriPdvCard({ righe }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
      <div className="flex items-center gap-2 border-b border-border bg-bg/30 px-5 py-3">
        <Trophy size={16} className="text-accent-2" />
        <h3 className="text-sm font-medium uppercase tracking-wider text-white">
          Classifica venditori del PdV
        </h3>
        <span className="ml-auto text-xs text-text-muted">{righe.length}</span>
      </div>
      {righe.length === 0 ? (
        <div className="p-6 text-center text-sm text-text-muted">
          Nessun venditore con punti nel mese.
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {righe.map((r, i) => {
            const top3 = i + 1 <= 3
            return (
              <li key={r.venditore_id} className="flex items-center gap-3 px-5 py-3">
                <div className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 tabular-nums',
                  i === 0 ? 'bg-warning/15 text-warning ring-warning/30' :
                  i === 1 ? 'bg-accent/15 text-accent-2 ring-accent/30' :
                  i === 2 ? 'bg-info/15 text-info ring-info/30' :
                            'bg-bg ring-border text-text-muted',
                )}>
                  {top3 ? <Crown size={14} /> : i + 1}
                </div>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-primary text-[10px] font-semibold text-white shrink-0">
                  {(r.nome?.[0] || '') + (r.cognome?.[0] || '')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">
                    {r.nome} {r.cognome}
                  </div>
                  <div className="text-[11px] text-text-muted">{r.ruolo}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-medium tabular-nums text-white">{formatInt(r.punti)}</div>
                  <div className="text-[10px] text-text-muted">
                    pt · {formatInt(r.contratti)} ctr
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
