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
  ArrowUpRight, ArrowDownRight, Minus, Crown, Package,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import Dialog from '@/components/ui/Dialog'
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
import AugurioCompleanno from '@/components/AugurioCompleanno'
import { fetchCompleanniOggi } from '@/lib/compleanni'

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

  // Compleanni di oggi (solo collaboratori del mio PdV)
  const [festeggiati, setFesteggiati] = useState([])
  useEffect(() => {
    if (!profile?.id) return
    fetchCompleanniOggi(profile).then(setFesteggiati)
  }, [profile?.id])

  // Donut distribuzione prodotti (§2026-10): toggle contratti/punti + zoom
  // sottoprodotti al click sulla fetta — stesso pattern della Home admin.
  const [donutView, setDonutView] = useState('contratti')
  const [donutZoom, setDonutZoom] = useState(null)

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
          id, data_stipula, data_sottoscrizione, prodotto, stato,
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

  // Dati donut distribuzione prodotti (§2026-10)
  const PRODOTTI_COLORS = { mobile: '#2B6CFF', fisso: '#7A9BFF', energia: '#F5B042' }
  const datiPie = PRODOTTI_VIS
    .map(p => ({
      name: p.l,
      value: donutView === 'punti' ? aggr[p.v].punti : aggr[p.v].produzione,
      color: PRODOTTI_COLORS[p.v],
      prodottoKey: p.v,
    }))
    .filter(d => d.value > 0)

  // Spaccato sottoprodotti del prodotto zoomato
  const datiSottoprodotti = useMemo(() => {
    if (!donutZoom) return []
    const map = new Map()
    for (const c of contratti) {
      if (c.prodotto !== donutZoom) continue
      const sps = (c.contratto_sottoprodotti || [])
        .map(r => r.sottoprodotti)
        .filter(Boolean)
      for (const sp of sps) {
        const nome = sp.nome || '(senza nome)'
        const cur = map.get(nome) || { name: nome, contratti: 0, punti: 0 }
        cur.contratti += 1
        cur.punti += sp.punti || 0
        map.set(nome, cur)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.contratti - a.contratti)
  }, [contratti, donutZoom])
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

  // NB (§2026-09): il ContrattoNuovoDialog è renderizzato UNA SOLA VOLTA,
  // fuori dai rami condizionali, dentro un Fragment che avvolge anche
  // loading/errore/contenuto. Se lo mettessimo dentro ogni ramo, React lo
  // smonterebbe passando da un ramo all'altro (loading → contenuto durante
  // il refresh post-creazione) e perderemmo lo stato locale `justCreated`
  // → l'utente non vedrebbe più il success view "Nuovo contratto stesso
  // cliente". Vecchio fix (77464f7) NON funzionava perché il dialog era
  // duplicato in due rami: passare da uno all'altro rimonta.
  return (
    <>
      {/* Dialog nuovo contratto — SEMPRE MONTATO. Anche durante i refresh
          interni (setLoading true), non viene smontato → mantiene il
          success view del contratto appena creato. */}
      <ContrattoNuovoDialog
        open={nuovoOpen}
        onClose={() => setNuovoOpen(false)}
        onCreated={fetchAll}
      />

      {/* Sotto-donut sottoprodotti — si apre al click su una fetta della donut
          "Distribuzione prodotti". Sempre montato per non perdere lo stato. */}
      <DistribuzioneSottoprodottiDialog
        open={!!donutZoom}
        onClose={() => setDonutZoom(null)}
        prodotto={PRODOTTI_VIS.find(p => p.v === donutZoom)}
        dati={datiSottoprodotti}
        view={donutView}
        setView={setDonutView}
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
          <Loader2 size={18} className="animate-spin" /> Caricamento dashboard…
        </div>
      ) : !pdvMio ? (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-6 text-center">
          <p className="text-white">Il tuo account non è collegato a un Punto Vendita.</p>
          <p className="mt-1 text-sm text-text-muted">Contatta un amministratore.</p>
        </div>
      ) : (
    <div>
      {/* Banner compleanno pirotecnico — solo collaboratori del proprio PdV */}
      <AugurioCompleanno festeggiati={festeggiati} />

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

      {/* Riga: Distribuzione prodotti (donut cliccabile) + Ultimi contratti */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DistribuzioneProdottiCard
          dati={datiPie}
          view={donutView}
          setView={setDonutView}
          onZoom={(key) => setDonutZoom(key)}
        />
        <UltimiContrattiCard ultimi={ultimi10} />
      </div>

      {/* Riga: Top venditori interni */}
      <div className="mt-6">
        <TopVenditoriPdvCard righe={topVenditoriPdv} />
      </div>

    </div>
      )}
    </>
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
                    {formatDate(c.data_stipula || c.data_sottoscrizione)}
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

// -----------------------------------------------------------------------------
// Donut distribuzione prodotti (HomePdv, 2026-10) — stesso pattern di Home.jsx.
// Toggle contratti/punti + fetta cliccabile per aprire la sotto-donut.
// -----------------------------------------------------------------------------
function DistribuzioneProdottiCard({ dati, view, setView, onZoom }) {
  const tooltipStyle = {
    backgroundColor: '#141B3A',
    border: '1px solid #232A4A',
    borderRadius: 10,
    color: '#F5F7FF',
    fontSize: 12,
  }
  return (
    // flex column + h-full così la card riempie l'altezza della cella del grid
    // (uguale all'UltimiContrattiCard affiancata) e il grafico può occupare lo
    // spazio rimanente invece di stare in h-64 fisso.
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-wider text-white">
            Distribuzione prodotti
          </h3>
          <p className="mt-1 text-xs text-text-muted">
            {view === 'punti'
              ? 'Quota di punti per prodotto. Clicca una fetta per il dettaglio sottoprodotti.'
              : 'Quota di contratti per prodotto. Clicca una fetta per il dettaglio sottoprodotti.'}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-bg p-1">
          {[
            { v: 'contratti', l: 'Contratti' },
            { v: 'punti',     l: 'Punti' },
          ].map(o => (
            <button
              key={o.v}
              type="button"
              onClick={() => setView(o.v)}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-medium transition',
                view === o.v
                  ? 'bg-gradient-primary text-white shadow-soft'
                  : 'text-text-muted hover:text-white',
              )}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {dati.length === 0 ? (
        <div className="mt-6 flex flex-1 items-center justify-center text-sm text-text-muted">
          Nessun contratto ancora nel mese
        </div>
      ) : (
        // flex-1 fa prendere al grafico tutto lo spazio verticale rimanente
        // nella card; min-h evita che collassi se la card è bassa.
        <div className="mt-4 flex-1" style={{ minHeight: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 24, right: 12, bottom: 8, left: 12 }}>
              <Pie
                data={dati}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={3}
                className="cursor-pointer"
                onClick={(d) => d?.prodottoKey && onZoom(d.prodottoKey)}
                labelLine={{ stroke: '#A3ADC9', strokeWidth: 1 }}
                label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
              >
                {dati.map((d, i) => (
                  <Cell key={i} fill={d.color} style={{ cursor: 'pointer' }} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => {
                  const totale = dati.reduce((s, d) => s + d.value, 0)
                  const pct = totale > 0 ? (value / totale * 100).toFixed(1) : 0
                  const unit = view === 'punti' ? 'pt' : (value === 1 ? 'contratto' : 'contratti')
                  return [`${formatInt(value)} ${unit} (${pct}%) · clicca per dettaglio`, name]
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                verticalAlign="bottom"
                height={32}
                formatter={(value, entry) => (
                  <span className="text-text-muted">
                    {value} <span className="tabular-nums text-white">({formatInt(entry.payload.value)})</span>
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Sotto-donut sottoprodotti (HomePdv, 2026-10) — stessa UI di Home.jsx.
// -----------------------------------------------------------------------------
function DistribuzioneSottoprodottiDialog({ open, onClose, prodotto, dati, view, setView }) {
  if (!prodotto) return null
  const tooltipStyle = {
    backgroundColor: '#141B3A',
    border: '1px solid #232A4A',
    borderRadius: 10,
    color: '#F5F7FF',
    fontSize: 12,
  }
  const key = view === 'punti' ? 'punti' : 'contratti'
  const totale = (dati || []).reduce((s, d) => s + (d[key] || 0), 0)
  const prodColor = prodotto.v === 'mobile' ? '#2B6CFF'
    : prodotto.v === 'fisso' ? '#7A9BFF'
    : '#F5B042'
  const paletteBase = ['#2B6CFF', '#7A9BFF', '#F5B042', '#22c55e', '#a855f7', '#ec4899', '#facc15', '#10B981', '#EF4444', '#38BDF8']

  const datiChart = (dati || [])
    .map((d, i) => ({
      name: d.name,
      value: d[key] || 0,
      color: paletteBase[i % paletteBase.length],
      contratti: d.contratti,
      punti: d.punti,
    }))
    .filter(d => d.value > 0)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ background: `${prodColor}22`, color: prodColor }}
          >
            <Package size={16} />
          </span>
          Sottoprodotti · {prodotto.l}
        </span>
      }
      description={`Spaccato dei sottoprodotti · vista ${view === 'punti' ? 'punti' : 'contratti'}`}
    >
      <div className="mb-4 flex items-center justify-end">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-bg p-1">
          {[
            { v: 'contratti', l: 'Contratti' },
            { v: 'punti',     l: 'Punti' },
          ].map(o => (
            <button
              key={o.v}
              type="button"
              onClick={() => setView(o.v)}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-medium transition',
                view === o.v
                  ? 'bg-gradient-primary text-white shadow-soft'
                  : 'text-text-muted hover:text-white',
              )}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {datiChart.length === 0 ? (
        <div className="py-10 text-center text-sm text-text-muted">
          Nessun sottoprodotto {prodotto.l.toLowerCase()} nel mese.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={datiChart}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                  labelLine={{ stroke: '#A3ADC9', strokeWidth: 1 }}
                  label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
                >
                  {datiChart.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => {
                    const pct = totale > 0 ? (value / totale * 100).toFixed(1) : 0
                    const unit = view === 'punti' ? 'pt' : (value === 1 ? 'contratto' : 'contratti')
                    return [`${formatInt(value)} ${unit} (${pct}%)`, name]
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-bg/40 px-4 py-2 text-[11px] uppercase tracking-wider text-text-muted">
              <span>Sottoprodotto</span>
              <span>{view === 'punti' ? 'Punti' : 'Contratti'} · %</span>
            </div>
            <ul className="divide-y divide-border">
              {datiChart.map((d) => {
                const pct = totale > 0 ? (d.value / totale * 100) : 0
                return (
                  <li
                    key={d.name}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: d.color }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm text-white">{d.name}</div>
                        <div className="text-[11px] text-text-muted tabular-nums">
                          {view === 'punti'
                            ? `${formatInt(d.contratti)} contratti`
                            : `${formatInt(d.punti)} pt`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium tabular-nums text-white">
                        {formatInt(d.value)}
                      </div>
                      <div className="text-[11px] tabular-nums text-text-muted">
                        {pct.toFixed(1)}%
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-border bg-bg/30 px-4 py-2 text-sm">
              <span className="font-medium text-white">Totale</span>
              <span className="font-semibold tabular-nums text-white">
                {formatInt(totale)} {view === 'punti' ? 'pt' : 'ctr'}
              </span>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
