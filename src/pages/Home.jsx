/**
 * Home / Dashboard — entry point con branching per ruolo:
 *  - PdV → HomePdv (§9.5)
 *  - Admin / BO / DV / AS / TM → Dashboard "Admin" globale (§9.4)
 *
 * Le dashboard di DV/AS/TM/BO verranno raffinate nello Step 15 (per ora
 * vedono la stessa Admin globale). Lo scope RLS limita comunque ciò che vedono.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell,
} from 'recharts'
import {
  TrendingUp, FileCheck, Coins, Trophy, Target as TargetIcon,
  Loader2, ArrowUpRight, ArrowDownRight, Minus,
  Smartphone, Wifi, Zap, Users,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { formatEuro, formatInt, cn } from '@/lib/utils'
import MesePicker from '@/components/ui/MesePicker'
import {
  fetchContrattiMese, fetchTargetTotaliRete, aggregaPerProdotto,
  topPdvPerContratti, ymPrecedente, tipoMese, giorniTotaliMese, giorniConsumati,
  fetchMedieGlobali,
} from '@/lib/dashboard'
import { getPdvScopeIds } from '@/lib/classifiche'
import { checkContrattiFermiBO } from '@/lib/notifiche'
import HomePdv from './HomePdv'
import AugurioCompleanno from '@/components/AugurioCompleanno'
import { fetchCompleanniOggi } from '@/lib/compleanni'

const PRODOTTI = [
  { v: 'mobile',  l: 'Mobile',  color: '#2B6CFF' },
  { v: 'fisso',   l: 'Fisso',   color: '#7A9BFF' },
  { v: 'energia', l: 'Energia', color: '#F5B042' },
]

// Mappa veloce prodotto → colore (usata nei KPI "Medie globali rete"
// per dare alle card lo stesso colore dei grafici sopra).
const PRODOTTI_COLOR = {
  mobile:  '#2B6CFF',
  fisso:   '#7A9BFF',
  energia: '#F5B042',
}

export default function Home() {
  const { profile } = useAuth()

  // Branching: PdV ha la sua dashboard dedicata (§9.5)
  if (profile?.ruolo === 'pdv') {
    return <HomePdv />
  }
  // Admin / BO / DV / AS / TM → Dashboard globale (§9.4)
  return <HomeAdmin />
}

function HomeAdmin() {
  const { profile } = useAuth()
  const isAdmin = profile?.ruolo === 'admin'
  // HR: sola visualizzazione senza fatturati (2026-07)
  const isHr = profile?.ruolo === 'hr'
  const ruolo = profile?.ruolo

  const [meseSel, setMeseSel] = useState(currentYM())
  const [loading, setLoading] = useState(true)

  // Dati mese corrente
  const [contratti, setContratti] = useState([])
  const [targetRete, setTargetRete] = useState({ mobile: 0, fisso: 0, energia: 0 })
  const [contrattiPrev, setContrattiPrev] = useState([])
  // Scope: null = tutti (admin/bo/dv/hr) | array IDs (as/tm)
  const [scopeIds, setScopeIds] = useState(null)
  const [scopeReady, setScopeReady] = useState(false)

  // Medie globali (solo Admin): caricate una sola volta a init pagina
  const [medie, setMedie] = useState(null)

  // Compleanni di oggi (Admin/BO NON li vedono — handler lato helper)
  const [festeggiati, setFesteggiati] = useState([])
  useEffect(() => {
    if (!profile?.id) return
    fetchCompleanniOggi(profile).then(setFesteggiati)
  }, [profile?.id])

  async function fetchAll() {
    setLoading(true)
    try {
      // 1) Risolvo lo scope
      const ids = await getPdvScopeIds(profile)
      setScopeIds(ids)
      setScopeReady(true)

      // 2) Carico contratti e target con il filtro.
      //    Per gli Admin carico anche le medie globali in parallelo (usate
      //    nella sezione "Medie globali rete" sotto la dashboard mensile).
      const queries = [
        fetchContrattiMese(meseSel, ids),
        fetchTargetTotaliRete(meseSel, ids),
        fetchContrattiMese(ymPrecedente(meseSel), ids),
      ]
      if (isAdmin) queries.push(fetchMedieGlobali(ids))

      const res = await Promise.all(queries)
      setContratti(res[0])
      setTargetRete(res[1])
      setContrattiPrev(res[2])
      if (isAdmin) setMedie(res[3])
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

  // Check contratti fermi > 3 giorni — solo Admin/BO, max 1 notifica al giorno (§13)
  useEffect(() => {
    if (profile?.id && ['admin','bo'].includes(profile.ruolo)) {
      checkContrattiFermiBO(profile.id)
    }
  }, [profile?.id, profile?.ruolo])

  // Aggregazioni
  const aggrCorr = useMemo(() => aggregaPerProdotto(contratti, meseSel), [contratti, meseSel])
  const aggrPrev = useMemo(() => aggregaPerProdotto(contrattiPrev, ymPrecedente(meseSel)), [contrattiPrev, meseSel])

  // KPI totali correnti
  const totContratti = contratti.length
  const totPunti = contratti.reduce((s, c) => {
    const t = (c.stato === 'gettonato' || c.stato === 'stornato')
      ? (c.punti_snap || 0)
      : (c.contratto_sottoprodotti || []).reduce((ss, r) => ss + (r.sottoprodotti?.punti || 0), 0)
    return s + t
  }, 0)
  // Fatturato previsto: solo VALIDATI (non gettonati né stornati) — §6
  // Admin vede il fatturato AZIENDA (gettone, "quanto guadagna Hype");
  // gli altri ruoli vedono il fatturato PdV come prima (privacy).
  const fattPrevisto = contratti
    .filter(c => c.stato === 'validato')
    .reduce((s, c) => {
      const sps = (c.contratto_sottoprodotti || []).map(r => r.sottoprodotti).filter(Boolean)
      return s + sps.reduce((ss, sp) => {
        const v = isAdmin ? (sp.fatturato_azienda || 0) : (sp.fatturato_pdv || 0)
        return ss + v
      }, 0)
    }, 0)

  // Target totali (rete)
  const targetTot = targetRete.mobile + targetRete.fisso + targetRete.energia
  const scostamento = totContratti - targetTot
  const scostamentoPct = targetTot > 0 ? Math.round((scostamento / targetTot) * 100) : 0

  // Dati per bar chart "Andamento target"
  const datiTarget = PRODOTTI.map(p => ({
    nome: p.l,
    Produzione: aggrCorr[p.v].produzione,
    Previsione: aggrCorr[p.v].previsione,
    Target: targetRete[p.v],
    color: p.color,
  }))

  // Dati pie distribuzione prodotti
  const datiPie = PRODOTTI
    .map(p => ({ name: p.l, value: aggrCorr[p.v].produzione, color: p.color }))
    .filter(d => d.value > 0)

  // Top 5 PdV
  const topPdv = useMemo(() => topPdvPerContratti(contratti, 5), [contratti])

  // Confronto vs mese precedente (per prodotto)
  const confronto = PRODOTTI.map(p => {
    const corr = aggrCorr[p.v].produzione
    const prev = aggrPrev[p.v].produzione
    let pct = null
    if (prev === 0 && corr > 0) pct = 100
    else if (prev === 0 && corr === 0) pct = 0
    else pct = Math.round(((corr - prev) / prev) * 100)
    return { ...p, corr, prev, pct }
  })

  const giornoOggi = giorniConsumati(meseSel)
  const giorniTot = giorniTotaliMese(meseSel)

  // Etichetta titolo + sottotitolo in base al ruolo (§9.6)
  const titoliPerRuolo = {
    admin: { titolo: 'Dashboard Admin',                      scope: 'Panoramica intera rete' },
    bo:    { titolo: 'Dashboard Back Office',                scope: 'Panoramica intera rete' },
    dv:    { titolo: 'Dashboard Direzione Vendite',          scope: 'Panoramica intera rete' },
    hr:    { titolo: 'Dashboard Responsabile HR',            scope: 'Panoramica intera rete' },
    as:    { titolo: 'Dashboard Area Sales',                 scope: 'Solo i tuoi PdV' },
    tm:    { titolo: 'Dashboard Team Manager',               scope: 'Solo i tuoi PdV' },
  }
  const head = titoliPerRuolo[ruolo] || { titolo: 'Dashboard', scope: 'Panoramica' }
  const noScope = scopeReady && Array.isArray(scopeIds) && scopeIds.length === 0

  return (
    <div>
      {/* Banner compleanno pirotecnico — visibile solo se ci sono festeggiati oggi.
          Admin/BO sono esclusi lato helper (nessun fetch). */}
      <AugurioCompleanno festeggiati={festeggiati} />

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">
            {head.titolo}
          </h1>
          <p className="mt-1 text-text-muted">
            {head.scope}
            {tipoMese(meseSel) === 'corrente' && ` · giorno ${giornoOggi}/${giorniTot}`}
          </p>
        </div>
        <div className="min-w-[260px]">
          <label className="mb-1.5 block text-xs font-medium text-text-muted">Mese</label>
          <MesePicker value={meseSel} onChange={v => v && setMeseSel(v)} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
          <Loader2 size={18} className="animate-spin" /> Caricamento dashboard…
        </div>
      ) : noScope ? (
        <div className="mt-6 rounded-2xl border border-warning/40 bg-warning/10 p-6">
          <p className="text-white">Nessun PdV assegnato al tuo account.</p>
          <p className="mt-1 text-sm text-text-muted">
            Contatta un Admin/BO per essere associato come {ruolo === 'as' ? 'Area Sales' : 'Team Manager'} a uno o più PdV.
          </p>
        </div>
      ) : (
        <>
          {/* === KPI CARDS === */}
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={FileCheck}
              label="Contratti mese"
              value={formatInt(totContratti)}
              hint={`${formatInt(targetTot)} target ${Array.isArray(scopeIds) ? 'tuoi PdV' : 'rete'}`}
            />
            <KpiCard
              icon={TrendingUp}
              label="Punti totali"
              value={formatInt(totPunti)}
              hint="Validati / Gettonati / Stornati"
            />
            {/* HR vede il fatturato PdV come il DV (allineato 2026-07). */}
            <KpiCard
              icon={Coins}
              label={isAdmin ? 'Fatturato Azienda previsto' : 'Fatturato previsto'}
              value={formatEuro(fattPrevisto)}
              hint={isAdmin ? 'Somma fatturato Azienda dei validati' : 'Somma fatturato PdV dei validati'}
            />
            <KpiCard
              icon={TargetIcon}
              label="Scostamento target"
              value={`${scostamento >= 0 ? '+' : ''}${formatInt(scostamento)}`}
              hint={`${scostamentoPct >= 0 ? '+' : ''}${scostamentoPct}% sul target`}
              tone={scostamento >= 0 ? 'success' : 'danger'}
            />
          </div>

          {/* === Riga 2: Andamento target + Distribuzione prodotti === */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Andamento target */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft lg:col-span-2">
              <h3 className="text-sm font-medium uppercase tracking-wider text-white">
                Andamento verso target
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                Produzione (validati) · Previsione (proiezione fine mese) · Target (somma rete).
              </p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datiTarget} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232A4A" />
                    <XAxis dataKey="nome" stroke="#A3ADC9" fontSize={12} />
                    <YAxis stroke="#A3ADC9" fontSize={12} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#FFFFFF06' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Produzione" fill="#3DD68C" radius={[6,6,0,0]} />
                    <Bar dataKey="Previsione" fill="#5B8FFF" radius={[6,6,0,0]} />
                    <Bar dataKey="Target"     fill="#A3ADC9" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Distribuzione prodotti */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
              <h3 className="text-sm font-medium uppercase tracking-wider text-white">
                Distribuzione prodotti
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                Quota di contratti per prodotto.
              </p>
              {datiPie.length === 0 ? (
                <div className="mt-6 flex h-56 items-center justify-center text-sm text-text-muted">
                  Nessun contratto ancora nel mese
                </div>
              ) : (
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={datiPie}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        // Mostra direttamente la percentuale fuori dalla fetta,
                        // con una linea che la collega al settore.
                        labelLine={{ stroke: '#A3ADC9', strokeWidth: 1 }}
                        label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
                      >
                        {datiPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value, name) => {
                          const totale = datiPie.reduce((s, d) => s + d.value, 0)
                          const pct = totale > 0 ? (value / totale * 100).toFixed(1) : 0
                          return [`${formatInt(value)} contratti (${pct}%)`, name]
                        }}
                      />
                      {/* Legenda con totale per prodotto a fianco al nome */}
                      <Legend
                        wrapperStyle={{ fontSize: 12 }}
                        formatter={(value, entry) => (
                          <span className="text-text-muted">
                            {value} <span className="tabular-nums text-white">({entry.payload.value})</span>
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* === Riga 3: Top PdV + Confronto vs mese precedente === */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Top PdV */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft lg:col-span-2">
              <h3 className="text-sm font-medium uppercase tracking-wider text-white">
                Top 5 PdV per contratti
              </h3>
              {topPdv.length === 0 ? (
                <div className="mt-6 flex h-56 items-center justify-center text-sm text-text-muted">
                  Nessun PdV con contratti
                </div>
              ) : (
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topPdv} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#232A4A" horizontal={false} />
                      <XAxis type="number" stroke="#A3ADC9" fontSize={12} />
                      <YAxis dataKey="nome" type="category" stroke="#A3ADC9" fontSize={12} width={120} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#FFFFFF06' }} />
                      <Bar dataKey="count" fill="#2B6CFF" radius={[0,6,6,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Confronto mese precedente */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
              <h3 className="text-sm font-medium uppercase tracking-wider text-white">
                Vs mese precedente
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                Variazione produzione contratti per prodotto.
              </p>
              <div className="mt-4 space-y-3">
                {confronto.map(p => {
                  const positivo = p.pct > 0
                  const Icon = positivo ? ArrowUpRight : (p.pct < 0 ? ArrowDownRight : Minus)
                  const colorCls = positivo ? 'text-success' : (p.pct < 0 ? 'text-danger' : 'text-text-muted')
                  return (
                    <div key={p.v} className="flex items-center justify-between rounded-xl border border-border bg-bg/40 px-3 py-2">
                      <div>
                        <div className="text-sm text-white">{p.l}</div>
                        <div className="text-[11px] text-text-muted tabular-nums">
                          {formatInt(p.corr)} ora · {formatInt(p.prev)} prima
                        </div>
                      </div>
                      <div className={cn('flex items-center gap-1 text-sm font-medium tabular-nums', colorCls)}>
                        <Icon size={14} />
                        {p.pct > 0 ? '+' : ''}{p.pct}%
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* === Riga 4: Medie globali rete (solo Admin) ===
              KPI calcolati su TUTTI i contratti validi (validato/gettonato/stornato),
              indipendentemente dal mese, per avere il valore medio di
              gettone (= fatturato azienda) e punti per ogni prodotto e cliente.
              Colori: icone abbinate ai colori-prodotto del progetto
              (Mobile #2B6CFF · Fisso #7A9BFF · Energia #F5B042) per coerenza
              col bar chart "Andamento target" e con la donut "Distribuzione". */}
          {isAdmin && medie && (
            <div className="mt-10">
              {/* Header sezione, in stile coerente con gli altri box della home */}
              <div className="mb-5 flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-3">
                  {/* Barretta colorata di accento per separare visivamente la sezione */}
                  <div className="h-7 w-1 rounded bg-gradient-to-b from-[#2B6CFF] via-[#7A9BFF] to-[#F5B042]" />
                  <div>
                    <h2 className="text-lg font-medium tracking-tight text-white">
                      Medie globali rete
                    </h2>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Valori medi per contratto e per cliente, su tutti i contratti validi della rete
                      ({formatInt(medie.nContratti)} contratti totali · {formatInt(medie.nClienti)} clienti distinti).
                    </p>
                  </div>
                </div>
              </div>

              {/* --- Gettone medio per prodotto (fatturato azienda) --- */}
              <SottoTitoloMedia
                titolo="Gettone medio per contratto"
                sottotitolo="Fatturato azienda medio per ogni contratto di quel prodotto"
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <KpiCard
                  icon={Wifi}
                  accent={PRODOTTI_COLOR.fisso}
                  label="Fisso"
                  value={formatEuro(medie.mediaGettoneFisso)}
                  hint={`su ${formatInt(medie.nContrattiFisso)} contratti Fisso`}
                />
                <KpiCard
                  icon={Smartphone}
                  accent={PRODOTTI_COLOR.mobile}
                  label="Mobile"
                  value={formatEuro(medie.mediaGettoneMobile)}
                  hint={`su ${formatInt(medie.nContrattiMobile)} contratti Mobile`}
                />
                <KpiCard
                  icon={Zap}
                  accent={PRODOTTI_COLOR.energia}
                  label="Energia"
                  value={formatEuro(medie.mediaGettoneEnergia)}
                  hint={`su ${formatInt(medie.nContrattiEnergia)} contratti Energia`}
                />
              </div>

              {/* --- Punti medi per prodotto --- */}
              <div className="mt-6">
                <SottoTitoloMedia
                  titolo="Punti medi per contratto"
                  sottotitolo="Punti generati in media per ogni contratto di quel prodotto"
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <KpiCard
                    icon={Wifi}
                    accent={PRODOTTI_COLOR.fisso}
                    label="Fisso"
                    value={formatInt(medie.mediaPuntiFisso)}
                    hint={`su ${formatInt(medie.nContrattiFisso)} contratti Fisso`}
                  />
                  <KpiCard
                    icon={Smartphone}
                    accent={PRODOTTI_COLOR.mobile}
                    label="Mobile"
                    value={formatInt(medie.mediaPuntiMobile)}
                    hint={`su ${formatInt(medie.nContrattiMobile)} contratti Mobile`}
                  />
                  <KpiCard
                    icon={Zap}
                    accent={PRODOTTI_COLOR.energia}
                    label="Energia"
                    value={formatInt(medie.mediaPuntiEnergia)}
                    hint={`su ${formatInt(medie.nContrattiEnergia)} contratti Energia`}
                  />
                </div>
              </div>

              {/* --- Medie per cliente (totale generato / clienti distinti) --- */}
              <div className="mt-6">
                <SottoTitoloMedia
                  titolo="Valore medio per cliente"
                  sottotitolo={`Totale generato dalla rete diviso per ${formatInt(medie.nClienti)} clienti distinti`}
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <KpiCard
                    icon={Users}
                    label="Punti per cliente"
                    value={formatInt(medie.mediaPuntiCliente)}
                    hint="Quanti punti in media porta un cliente"
                  />
                  <KpiCard
                    icon={Users}
                    label="Gettone per cliente"
                    value={formatEuro(medie.mediaGettoneCliente)}
                    hint="Fatturato azienda medio per cliente"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------- sub-componenti ----------

// Intestazione di un sotto-blocco dentro "Medie globali rete".
// Tiene allineato lo stile (titolo bianco + sottotitolo grigio + margine).
function SottoTitoloMedia({ titolo, sottotitolo }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-medium uppercase tracking-wider text-white">
        {titolo}
      </h3>
      {sottotitolo && (
        <p className="mt-0.5 text-xs text-text-muted">{sottotitolo}</p>
      )}
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, hint, tone = 'neutral', accent }) {
  const valueColor =
    tone === 'success' ? 'text-success' :
    tone === 'danger'  ? 'text-danger'  :
                          'text-white'
  // Se passo un colore "accent" custom (es. il colore di un prodotto)
  // lo applico all'icona, al suo box di sfondo e al bordo hover.
  const iconStyle = accent ? { color: accent } : undefined
  const iconBoxStyle = accent ? { backgroundColor: `${accent}1A` } : undefined  // 1A = ~10% alpha
  const borderHover = accent
    ? { '--tw-hover-border': accent }
    : undefined
  return (
    <div
      className="group rounded-2xl border border-border bg-surface p-5 shadow-soft transition hover:border-accent/40"
      style={accent ? { ...borderHover } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">{label}</span>
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl',
            !accent && 'bg-accent/10',
          )}
          style={iconBoxStyle}
        >
          <Icon size={18} className={accent ? '' : 'text-accent-2'} style={iconStyle} />
        </div>
      </div>
      <div className={cn('mt-4 text-3xl font-medium tabular-nums', valueColor)}>
        {value}
      </div>
      <div className="mt-1 text-xs text-text-muted">{hint}</div>
    </div>
  )
}

const tooltipStyle = {
  backgroundColor: '#141B3A',
  border: '1px solid #232A4A',
  borderRadius: 12,
  color: '#FFFFFF',
  fontSize: 12,
  boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
}

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
