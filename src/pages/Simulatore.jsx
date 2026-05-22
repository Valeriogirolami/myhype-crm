/**
 * Pagina "Simulatore di Sostenibilità" (solo Admin).
 *
 * Dato un set di parametri economici (tabella simulatore_parametri) e degli
 * input dal form, calcola quanti contratti un PdV Galleria deve produrre in un
 * mese per raggiungere 3 target di profitto (Break-even / +30% / +80%), in 2
 * modalità (Startup primi 3 mesi / Presidio dal 4°). Totale: 6 scenari.
 *
 * La feature è puramente ADDITIVA: non tocca nulla del gestionale esistente.
 */
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Calculator, Settings, ChevronDown, Save, Rocket, Loader2,
  Sprout, Landmark, Target as TargetIcon, TrendingUp, Trophy, AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { cn, formatEuro, formatInt } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { fetchSoglieAttualmenteAttive } from '@/lib/garaGallery'
import { calcolaTuttiGliScenari } from '@/lib/simulatoreLogic'

// Valori delle select del form di simulazione
const OPZIONI_AFFITTO = Array.from({ length: 22 }, (_, i) => 1500 + i * 500) // 1500..12000
const OPZIONI_VENDITORI = [1, 2, 3, 4, 5]
const OPZIONI_CENTRI = Array.from({ length: 20 }, (_, i) => i + 1)            // 1..20
const OPZIONI_AS = [1, 2, 3, 4, 5]
const OPZIONI_DV = [1, 2, 3]

// Definizione dei campi del form parametri, raggruppati per sezione
const GRUPPI_PARAM = [
  {
    titolo: 'Distribuzione produzione (%)',
    nota: 'La somma deve essere 100%',
    campi: [
      ['perc_mobile', 'Mobile'],
      ['perc_fisso', 'Fisso'],
      ['perc_energia', 'Energia'],
    ],
  },
  {
    titolo: 'Punti medi per contratto',
    campi: [
      ['punti_mobile', 'Mobile'],
      ['punti_fisso', 'Fisso'],
      ['punti_energia', 'Energia'],
    ],
  },
  {
    titolo: 'Fatturato Azienda medio per contratto (€)',
    campi: [
      ['fatt_az_mobile', 'Mobile'],
      ['fatt_az_fisso', 'Fisso'],
      ['fatt_az_energia', 'Energia'],
    ],
  },
  {
    titolo: 'Fatturato PdV medio per contratto (€)',
    campi: [
      ['fatt_pdv_mobile', 'Mobile'],
      ['fatt_pdv_fisso', 'Fisso'],
      ['fatt_pdv_energia', 'Energia'],
    ],
  },
  {
    titolo: 'Costi venditori e manager (€/mese)',
    campi: [
      ['fisso_venditore', 'Fisso venditore'],
      ['stipendio_as', 'Stipendio AS'],
      ['stipendio_dv', 'Stipendio DV'],
    ],
  },
  {
    titolo: 'Costi aziendali (€/mese, totale azienda)',
    campi: [
      ['costo_recruiting', 'Recruiting'],
      ['costo_back_office', 'Back Office'],
      ['costo_ufficio', 'Ufficio'],
    ],
  },
]

export default function Simulatore() {
  const { user } = useAuth()

  // --- Parametri di sistema ---
  const [params, setParams] = useState(null)       // riga DB
  const [form, setForm] = useState(null)            // copia editabile
  const [loadingParams, setLoadingParams] = useState(true)
  const [savingParams, setSavingParams] = useState(false)
  const [paramOpen, setParamOpen] = useState(false) // sezione chiusa di default

  // --- Soglie Gara Gallery (Galleria) ---
  const [soglieGalleria, setSoglieGalleria] = useState([])

  // --- Input simulazione ---
  const [input, setInput] = useState({
    affitto: 1500,
    n_venditori: 1,
    n_centri: 1,
    n_as: 1,
    n_dv: 1,
  })

  // --- Risultati ---
  const [risultati, setRisultati] = useState(null)
  const [calcolando, setCalcolando] = useState(false)

  // Carica parametri + soglie all'avvio
  useEffect(() => {
    async function carica() {
      setLoadingParams(true)
      try {
        const [resP, soglie] = await Promise.all([
          supabase.from('simulatore_parametri').select('*').eq('id', 1).single(),
          fetchSoglieAttualmenteAttive(),
        ])
        if (resP.error) throw resP.error
        setParams(resP.data)
        setForm(resP.data)
        setSoglieGalleria((soglie || []).filter(s => s.tipo === 'galleria'))
      } catch (err) {
        toast.error(`Errore caricamento: ${err.message}`)
      } finally {
        setLoadingParams(false)
      }
    }
    carica()
  }, [])

  function setF(k, v) {
    // Tengo il valore come numero (vuoto → 0)
    const num = v === '' ? '' : Number(v)
    setForm(prev => ({ ...prev, [k]: num }))
  }
  function setI(k, v) {
    setInput(prev => ({ ...prev, [k]: Number(v) }))
  }

  // Somma percentuali (per la validazione)
  const sommaPerc = useMemo(() => {
    if (!form) return 0
    return Number(form.perc_mobile || 0) + Number(form.perc_fisso || 0) + Number(form.perc_energia || 0)
  }, [form])
  const percValida = Math.round(sommaPerc) === 100

  async function salvaParametri() {
    if (!percValida) {
      toast.error('La somma delle percentuali deve essere 100%.')
      return
    }
    setSavingParams(true)
    try {
      // Costruisco il payload solo con i campi numerici dei gruppi
      const payload = { updated_at: new Date().toISOString(), updated_by: user?.id || null }
      for (const g of GRUPPI_PARAM) {
        for (const [key] of g.campi) payload[key] = Number(form[key] || 0)
      }
      const { error } = await supabase
        .from('simulatore_parametri')
        .update(payload)
        .eq('id', 1)
      if (error) throw error
      setParams({ ...params, ...payload })
      toast.success('Parametri aggiornati')
    } catch (err) {
      toast.error(`Errore salvataggio: ${err.message}`)
    } finally {
      setSavingParams(false)
    }
  }

  function calcola() {
    if (!params) return
    if (soglieGalleria.length === 0) {
      toast.error('Nessuna soglia Gara Gallery (Galleria) configurata.')
      return
    }
    setCalcolando(true)
    // Uso i parametri SALVATI sul DB (params), non il form in editing
    try {
      const esiti = calcolaTuttiGliScenari(params, input, soglieGalleria)
      setRisultati(esiti)
    } catch (err) {
      toast.error(`Errore calcolo: ${err.message}`)
    } finally {
      setCalcolando(false)
    }
  }

  if (loadingParams) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-text-muted">
        <Loader2 size={18} className="animate-spin" /> Caricamento simulatore…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header pagina */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent-2">
          <Calculator size={22} />
        </div>
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">Simulatore</h1>
          <p className="mt-0.5 text-text-muted">
            Sostenibilità di un PdV Galleria: contratti necessari per i target di profitto
          </p>
        </div>
      </div>

      {/* === A) Parametri di sistema (collassabile) === */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
        <button
          onClick={() => setParamOpen(o => !o)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
        >
          <span className="flex items-center gap-2 text-lg font-medium text-white">
            <Settings size={18} className="text-text-muted" /> Parametri di sistema
          </span>
          <ChevronDown
            size={20}
            className={cn('text-text-muted transition-transform', paramOpen && 'rotate-180')}
          />
        </button>

        {paramOpen && form && (
          <div className="space-y-5 border-t border-border px-5 py-5">
            {GRUPPI_PARAM.map(gruppo => (
              <div key={gruppo.titolo}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-medium text-white">{gruppo.titolo}</h3>
                  {gruppo.nota && <span className="text-xs text-text-muted">— {gruppo.nota}</span>}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {gruppo.campi.map(([key, label]) => (
                    <Input
                      key={key}
                      label={label}
                      type="number"
                      value={form[key] ?? ''}
                      onChange={e => setF(key, e.target.value)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Alert validazione somma percentuali */}
            {!percValida && (
              <div className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
                <AlertTriangle size={16} />
                La somma deve essere 100%, attualmente è {formatInt(Math.round(sommaPerc))}%
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={salvaParametri} loading={savingParams} disabled={!percValida}>
                <Save size={16} /> Salva parametri
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* === B) Form simulazione === */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-medium text-white">
          <Calculator size={18} className="text-accent-2" /> Nuova simulazione
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select label="Affitto centro (€/mese)" value={input.affitto} onChange={e => setI('affitto', e.target.value)}>
            {OPZIONI_AFFITTO.map(v => <option key={v} value={v}>{formatEuro(v)}</option>)}
          </Select>
          <Select label="Numero venditori" value={input.n_venditori} onChange={e => setI('n_venditori', e.target.value)}>
            {OPZIONI_VENDITORI.map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select label="Numero centri attivi" value={input.n_centri} onChange={e => setI('n_centri', e.target.value)}>
            {OPZIONI_CENTRI.map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select label="Numero Area Sales attivi" value={input.n_as} onChange={e => setI('n_as', e.target.value)}>
            {OPZIONI_AS.map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select label="Numero Direttori Vendita" value={input.n_dv} onChange={e => setI('n_dv', e.target.value)}>
            {OPZIONI_DV.map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={calcola} loading={calcolando}>
            <Rocket size={16} /> Calcola
          </Button>
        </div>
      </div>

      {/* === C) Risultati === */}
      {risultati && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ColonnaModalita
            titolo="STARTUP (primi 3 mesi)"
            sottotitolo="Soglie Gara Gallery dimezzate"
            icona={Sprout}
            tono="success"
            scenari={risultati.startup}
            offsetAnim={0}
          />
          <ColonnaModalita
            titolo="PRESIDIO (dal 4° mese)"
            sottotitolo="Soglie Gara Gallery standard"
            icona={Landmark}
            tono="accent"
            scenari={risultati.presidio}
            offsetAnim={3}
          />
        </div>
      )}
    </div>
  )
}

// ---------- Sotto-componenti ----------

const TARGET_META = [
  { key: 'breakeven', label: 'Break-even', icon: TargetIcon },
  { key: 'plus30', label: 'Margine +30%', icon: TrendingUp },
  { key: 'plus80', label: 'Margine +80%', icon: Rocket },
]

function ColonnaModalita({ titolo, sottotitolo, icona: Icona, tono, scenari, offsetAnim }) {
  const bordo = tono === 'success' ? 'border-success/30' : 'border-accent/30'
  const iconaCol = tono === 'success' ? 'text-success' : 'text-accent-2'
  return (
    <div className={cn('rounded-2xl border bg-surface p-5 shadow-soft', bordo)}>
      {/* Header colonna */}
      <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-bg', iconaCol)}>
          <Icona size={20} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">{titolo}</h2>
          <p className="text-xs text-text-muted">{sottotitolo}</p>
        </div>
      </div>

      {/* 3 sotto-card target */}
      <div className="space-y-3">
        {TARGET_META.map((t, i) => (
          <ScenarioCard
            key={t.key}
            meta={t}
            scenario={scenari[t.key]}
            delay={(offsetAnim + i) * 0.08}
          />
        ))}
      </div>
    </div>
  )
}

function ScenarioCard({ meta, scenario, delay }) {
  const { icon: Icon } = meta
  const raggiungibile = scenario?.raggiungibile
  const res = scenario?.risultato
  const bd = scenario?.breakdown

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut', delay }}
      className="rounded-xl border border-border bg-bg/40 p-4"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
        <Icon size={15} className="text-text-muted" /> {meta.label}
      </div>

      {!raggiungibile ? (
        <div className="flex items-center gap-2 py-2 text-sm text-danger">
          <AlertTriangle size={15} /> Target non raggiungibile con questi parametri
        </div>
      ) : (
        <>
          {/* Numero contratti in evidenza */}
          <div className="flex items-end gap-2">
            <span className="bg-gradient-primary bg-clip-text text-4xl font-bold tabular-nums text-transparent">
              {scenario.N}
            </span>
            <span className="mb-1 text-sm text-text-muted">contratti / mese</span>
          </div>

          {/* Breakdown prodotti */}
          <div className="mt-1 text-sm text-text-muted tabular-nums">
            Mobile {bd.mobile} · Fisso {bd.fisso} · Energia {bd.energia}
          </div>

          {/* Riepilogo economico */}
          <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-text-muted tabular-nums">
            <div>
              Ricavi <span className="text-white">{formatEuro(Math.round(res.ricavi_totali))}</span>
              {' · '}Costi <span className="text-white">{formatEuro(Math.round(res.costi_totali))}</span>
              {' · '}Margine{' '}
              <span className={res.margine >= 0 ? 'text-success' : 'text-danger'}>
                {formatEuro(Math.round(res.margine))}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Trophy size={12} className={res.gara_gallery > 0 ? 'text-success' : 'text-text-muted'} />
              {res.soglia ? (
                <span>
                  Soglia {res.soglia.livello} ({formatEuro(res.gara_gallery)}) — {formatInt(Math.round(res.punti_totali))} pt
                </span>
              ) : (
                <span>Nessuna soglia — {formatInt(Math.round(res.punti_totali))} pt</span>
              )}
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
}
