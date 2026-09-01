/**
 * Pagina Classifiche (§10).
 *
 * Layout:
 *  - Selettore mese in alto
 *  - Istogramma stacked: produzione di TUTTI i PdV (Mobile/Fisso/Energia)
 *  - Riga 3 classifiche PdV per prodotto (Mobile / Fisso / Energia) — globali
 *  - Tabella Top 10 Venditori per punti (con toggle ordinamento per prodotto)
 *  - Tabella classifica interna del proprio scope (PdV/AS/TM)
 *
 * Highlight (§10.3): se la riga corrisponde all'account loggato (proprio PdV
 * o proprio venditore) viene evidenziata con sfondo giallo.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Trophy, Loader2, Smartphone, Phone, Zap, Users as UsersIcon, Crown, BarChart3,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { cn, formatInt } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import MesePicker from '@/components/ui/MesePicker'
import {
  fetchContrattiPerClassifiche,
  classificaPdvPerProdotto,
  classificaVenditori,
  fetchProduzioneTuttiPdv,
  getPdvScopeIds,
} from '@/lib/classifiche'

const PRODOTTI_VIS = [
  { v: 'mobile',  l: 'Mobile',  icon: Smartphone, color: 'accent' },
  { v: 'fisso',   l: 'Fisso',   icon: Phone,      color: 'info' },
  { v: 'energia', l: 'Energia', icon: Zap,        color: 'warning' },
]

// Bottoni toggle ordinamento classifica venditori
const ORDINAMENTI = [
  { v: 'punti',   l: 'Punti totali' },
  { v: 'mobile',  l: 'Mobile' },
  { v: 'fisso',   l: 'Fisso' },
  { v: 'energia', l: 'Energia' },
]

export default function Classifiche() {
  const { profile } = useAuth()
  const isPdv = profile?.ruolo === 'pdv'
  const isAsTmPdv = ['as', 'tm', 'pdv'].includes(profile?.ruolo)

  const [meseSel, setMeseSel] = useState(currentYM())
  const [loading, setLoading] = useState(true)

  const [contrattiGlobali, setContrattiGlobali] = useState([])
  const [contrattiInterni, setContrattiInterni] = useState([])
  const [pdvScopeNomi, setPdvScopeNomi] = useState([])
  const [produzionePdv, setProduzionePdv] = useState([])

  // Toggle ordinamento per le 2 tabelle venditori (separati per indipendenza)
  const [ordineGlobale, setOrdineGlobale] = useState('punti')
  const [ordineInterna, setOrdineInterna] = useState('punti')

  async function fetchAll() {
    setLoading(true)
    try {
      const globali = await fetchContrattiPerClassifiche(meseSel)
      setContrattiGlobali(globali)

      const prod = await fetchProduzioneTuttiPdv(globali)
      setProduzionePdv(prod)

      if (isAsTmPdv) {
        const scopeIds = await getPdvScopeIds(profile)
        if (scopeIds && scopeIds.length > 0) {
          const interni = globali.filter(c => scopeIds.includes(c.pdv?.id))
          setContrattiInterni(interni)
          const nomi = Array.from(new Set(globali
            .filter(c => scopeIds.includes(c.pdv?.id))
            .map(c => c.pdv?.nome)))
          setPdvScopeNomi(nomi)
        } else {
          setContrattiInterni([])
          setPdvScopeNomi([])
        }
      } else {
        setContrattiInterni([])
        setPdvScopeNomi([])
      }
    } catch (err) {
      toast.error(`Errore classifiche: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [meseSel, profile?.id])

  const classifichePdv = useMemo(() => ({
    mobile:  classificaPdvPerProdotto(contrattiGlobali, 'mobile'),
    fisso:   classificaPdvPerProdotto(contrattiGlobali, 'fisso'),
    energia: classificaPdvPerProdotto(contrattiGlobali, 'energia'),
  }), [contrattiGlobali])

  const top10Venditori = useMemo(
    () => classificaVenditori(contrattiGlobali, 10, ordineGlobale),
    [contrattiGlobali, ordineGlobale]
  )

  const classificaInterna = useMemo(
    () => classificaVenditori(contrattiInterni, null, ordineInterna),
    [contrattiInterni, ordineInterna]
  )

  function isHighlightPdv(row) {
    return profile?.ruolo === 'pdv' && row.pdv_account_id === profile.id
  }
  function isHighlightVenditore(row) {
    if (!row.account_id) return false
    return row.account_id === profile?.id
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">Classifiche</h1>
          <p className="mt-1 text-text-muted">
            Aggiornate al mese selezionato · Produzione = contratti validati / gettonati / stornati.
          </p>
        </div>
        <div className="min-w-[260px]">
          <label className="mb-1.5 block text-xs font-medium text-text-muted">Mese</label>
          <MesePicker value={meseSel} onChange={v => v && setMeseSel(v)} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
          <Loader2 size={18} className="animate-spin" /> Caricamento classifiche…
        </div>
      ) : (
        <>
          {/* === Istogramma verticale: produzione di tutti i PdV === */}
          <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-accent-2" />
                <h3 className="text-sm font-medium uppercase tracking-wider text-white">
                  Produzione di tutti i PdV (punti)
                </h3>
                <span className="text-xs text-text-muted">
                  · {produzionePdv.length} {produzionePdv.length === 1 ? 'PdV' : 'PdV'} aperti
                </span>
              </div>
              {/* Mini-legenda sintetica */}
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#2B6CFF' }} /> Mobile
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#7A9BFF' }} /> Fisso
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#F5B042' }} /> Energia
                </span>
              </div>
            </div>

            {produzionePdv.length === 0 ? (
              <div className="flex h-56 items-center justify-center text-sm text-text-muted">
                Nessun PdV aperto.
              </div>
            ) : (
              <div className="mt-5 h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={produzionePdv}
                    margin={{ top: 24, right: 12, left: -10, bottom: 70 }}
                    barCategoryGap="22%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#232A4A" vertical={false} />
                    <XAxis
                      dataKey="nome"
                      stroke="#A3ADC9"
                      fontSize={11}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                      tickMargin={8}
                      axisLine={{ stroke: '#232A4A' }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#A3ADC9"
                      fontSize={12}
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: '#FFFFFF08' }}
                      formatter={(value, name) => [`${formatInt(value)} pt`, name]}
                      labelFormatter={(label, items) => {
                        const tot = (items || []).reduce((s, it) => s + (it.value || 0), 0)
                        return `${label} · totale ${formatInt(tot)} pt`
                      }}
                    />
                    <Bar dataKey="mobile"  name="Mobile"  stackId="a" fill="#2B6CFF" />
                    <Bar dataKey="fisso"   name="Fisso"   stackId="a" fill="#7A9BFF" />
                    <Bar dataKey="energia" name="Energia" stackId="a" fill="#F5B042"
                         radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* === Classifiche PdV per prodotto === */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {PRODOTTI_VIS.map(p => (
              <ClassificaPdvCard
                key={p.v}
                prodotto={p}
                righe={classifichePdv[p.v]}
                isHighlight={isHighlightPdv}
              />
            ))}
          </div>

          {/* === Tabella Top 10 venditori === */}
          <div className="mt-6">
            <ClassificaVenditoriTable
              titolo="Top 10 venditori (rete)"
              sottotitolo="Ordinabile per criterio (default punti totali)"
              icon={Trophy}
              righe={top10Venditori}
              isHighlight={isHighlightVenditore}
              ordine={ordineGlobale}
              onOrdineChange={setOrdineGlobale}
            />
          </div>

          {/* === Tabella classifica interna === */}
          {isAsTmPdv && (
            <div className="mt-6">
              <ClassificaVenditoriTable
                titolo={
                  isPdv
                    ? 'Classifica interna del tuo PdV'
                    : `Classifica interna · ${pdvScopeNomi.join(' / ') || 'PdV assegnati'}`
                }
                sottotitolo={`Tutti i venditori (${classificaInterna.length})`}
                icon={UsersIcon}
                righe={classificaInterna}
                isHighlight={isHighlightVenditore}
                ordine={ordineInterna}
                onOrdineChange={setOrdineInterna}
                empty={pdvScopeNomi.length === 0 ? 'Nessun PdV assegnato.' : null}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------- sub-componenti ----------

function ClassificaPdvCard({ prodotto, righe, isHighlight }) {
  const Icon = prodotto.icon
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
      <div className="flex items-center gap-2 border-b border-border bg-bg/30 px-5 py-3">
        <div className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl',
          prodotto.color === 'accent'  && 'bg-accent/10 text-accent-2',
          prodotto.color === 'info'    && 'bg-info/10 text-info',
          prodotto.color === 'warning' && 'bg-warning/10 text-warning',
        )}>
          <Icon size={16} />
        </div>
        <div>
          <div className="text-sm font-medium uppercase tracking-wider text-white">
            PdV · {prodotto.l}
          </div>
          <div className="text-[11px] text-text-muted">Per numero contratti</div>
        </div>
      </div>

      {righe.length === 0 ? (
        <div className="p-6 text-center text-sm text-text-muted">
          Nessun contratto {prodotto.l.toLowerCase()} nel mese.
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {righe.map((r, i) => (
            <li
              key={r.pdv_id}
              className={cn(
                'flex items-center gap-3 px-5 py-3',
                isHighlight(r) && 'bg-warning/10',
              )}
            >
              <PosBadge pos={i + 1} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{r.pdv_nome}</div>
                <div className="text-[11px] text-text-muted">
                  {r.pdv_tipo === 'sinergia' ? 'Sinergia' : 'Galleria'} · Area {r.pdv_area}
                </div>
              </div>
              <div className="text-right">
                <div className="text-base font-medium tabular-nums text-white">
                  {formatInt(r.contratti)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted">
                  {r.contratti === 1 ? 'contratto' : 'contratti'}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function ClassificaVenditoriTable({ titolo, sottotitolo, icon: Icon, righe, isHighlight, ordine, onOrdineChange, empty }) {
  // Etichetta dinamica della colonna "contratti" in base al criterio
  const isFiltrato = ordine !== 'punti'
  const labelProdotto = ({
    mobile: 'Mobile', fisso: 'Fisso', energia: 'Energia',
  })[ordine]

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/30 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent-2">
            <Icon size={16} />
          </div>
          <div>
            <div className="text-sm font-medium uppercase tracking-wider text-white">
              {titolo}
            </div>
            <div className="text-[11px] text-text-muted">
              {isFiltrato
                ? `Classifica ${labelProdotto} · solo contratti ${labelProdotto} (${righe.length})`
                : sottotitolo}
            </div>
          </div>
        </div>

        {/* Toggle criterio (cambia COMPLETAMENTE la classifica) */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-bg p-1">
          {ORDINAMENTI.map(o => (
            <button
              key={o.v}
              type="button"
              onClick={() => onOrdineChange(o.v)}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-medium transition',
                ordine === o.v
                  ? 'bg-gradient-primary text-white shadow-soft'
                  : 'text-text-muted hover:text-white',
              )}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <div className="p-6 text-center text-sm text-text-muted">{empty}</div>
      ) : righe.length === 0 ? (
        <div className="p-6 text-center text-sm text-text-muted">
          {isFiltrato
            ? `Nessun venditore con contratti ${labelProdotto} nel mese.`
            : 'Nessun venditore con punti nel mese.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg/50 text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3 font-medium w-14">Pos.</th>
                <th className="px-5 py-3 font-medium">Venditore</th>
                {isFiltrato ? (
                  <>
                    <th className="px-3 py-3 text-right font-medium">Contratti {labelProdotto}</th>
                    <th className="px-5 py-3 text-right font-medium">Punti {labelProdotto}</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-3 text-right font-medium">Mobile</th>
                    <th className="px-3 py-3 text-right font-medium">Fisso</th>
                    <th className="px-3 py-3 text-right font-medium">Energia</th>
                    <th className="px-3 py-3 text-right font-medium">Tot. ctr.</th>
                    <th className="px-5 py-3 text-right font-medium">Punti</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => (
                <tr
                  key={r.venditore_id}
                  className={cn(
                    'border-t border-border transition-colors hover:bg-white/5',
                    isHighlight(r) && 'bg-warning/10',
                  )}
                >
                  <td className="px-5 py-3">
                    <PosBadge pos={i + 1} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-primary text-[10px] font-semibold text-white shrink-0">
                        {(r.nome?.[0] || '') + (r.cognome?.[0] || '')}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-white font-medium">{r.nome} {r.cognome}</div>
                        <div className="text-[10px] text-text-muted">{r.ruolo}</div>
                      </div>
                    </div>
                  </td>

                  {isFiltrato ? (
                    <>
                      <td className="px-3 py-3 text-right tabular-nums text-white">
                        {formatInt(r.contratti)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-white font-bold text-base">
                        {formatInt(r.punti)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-3 text-right tabular-nums text-white">{formatInt(r.ctr_mobile)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-white">{formatInt(r.ctr_fisso)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-white">{formatInt(r.ctr_energia)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-text-muted">{formatInt(r.contratti)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-white font-bold text-base">
                        {formatInt(r.punti)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PosBadge({ pos }) {
  const top3 = pos <= 3
  const colore =
    pos === 1 ? 'bg-warning/15 text-warning ring-warning/30' :
    pos === 2 ? 'bg-accent/15 text-accent-2 ring-accent/30' :
    pos === 3 ? 'bg-info/15 text-info ring-info/30' :
                'bg-bg ring-border text-text-muted'
  return (
    <div className={cn(
      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 tabular-nums',
      colore,
    )}>
      {top3 ? <Crown size={14} /> : pos}
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
