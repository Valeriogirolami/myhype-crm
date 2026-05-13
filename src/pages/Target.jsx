/**
 * Pagina Target (§7).
 *
 * Layout:
 *  - Header con MesePicker + bottoni "Duplica mese precedente" / "Replica trimestre" / "Replica anno"
 *  - Sezione 1: griglia Tipo × Categoria (8 celle), ogni cella mostra Mobile/Fisso/Energia
 *  - Sezione 2: tabella PdV con target effettivi (base + override) ed indicatore d'origine
 *
 * Permessi (§11):
 *  - Admin/BO: configurano e modificano
 *  - Altri ruoli: lettura sola dei propri PdV (per ora qualunque loggato vede)
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Target as TargetIcon, Loader2, Edit3, Copy, Calendar, Store,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { cn, formatInt } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import MesePicker from '@/components/ui/MesePicker'
import TargetBaseDialog from './TargetBaseDialog'
import TargetPdvDialog from './TargetPdvDialog'
import { getPdvScopeIds } from '@/lib/classifiche'

const TIPI = [
  { v: 'sinergia', l: 'Sinergia', tone: 'accent' },
  { v: 'galleria', l: 'Galleria', tone: 'info' },
]
const CATEGORIE = ['A', 'B', 'C', 'D']

export default function Target() {
  const { profile } = useAuth()
  const isBoAdmin = ['admin','bo'].includes(profile?.ruolo)
  const isPdv = profile?.ruolo === 'pdv'
  const isAsTm = ['as','tm'].includes(profile?.ruolo)
  // "scope ristretto": gli utenti che vedono solo un sottoinsieme di PdV
  const hasScope = isPdv || isAsTm

  const [meseSel, setMeseSel] = useState(currentYM())
  const meseISO = `${meseSel}-01`

  const [targetBase, setTargetBase] = useState([])  // righe target_base del mese
  const [overrides, setOverrides] = useState([])     // righe target_pdv_override del mese
  const [pdvList, setPdvList] = useState([])         // PdV aperti (filtrati per scope PdV)
  const [loading, setLoading] = useState(true)

  // Dialogs
  const [editBase, setEditBase] = useState(null)        // {tipo, categoria}
  const [editOverride, setEditOverride] = useState(null) // pdv

  async function fetchAll() {
    setLoading(true)
    // Risolvi scope per AS/TM (lista pdv_ids) o pdv (singolo pdv via account_id)
    let pdvQuery = supabase.from('pdv')
      .select('id, nome, tipo, area, categoria, stato')
      .eq('stato', 'aperto')
      .order('nome')

    if (isPdv) {
      pdvQuery = pdvQuery.eq('account_id', profile.id)
    } else if (isAsTm) {
      const ids = await getPdvScopeIds(profile)
      if (!ids || ids.length === 0) {
        setTargetBase([]); setOverrides([]); setPdvList([])
        setLoading(false)
        return
      }
      pdvQuery = pdvQuery.in('id', ids)
    }
    // Admin/BO/DV: nessun filtro

    const [resBase, resOv, resPdv] = await Promise.all([
      supabase.from('target_base').select('*').eq('mese', meseISO),
      supabase.from('target_pdv_override').select('*').eq('mese', meseISO),
      pdvQuery,
    ])
    if (resBase.error) toast.error(`Errore target base: ${resBase.error.message}`)
    if (resOv.error)   toast.error(`Errore override: ${resOv.error.message}`)
    if (resPdv.error)  toast.error(`Errore PdV: ${resPdv.error.message}`)
    setTargetBase(resBase.data || [])
    setOverrides(resOv.data || [])
    setPdvList(resPdv.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [meseISO])

  // Helper: target base per (tipo, categoria)
  function getBase(tipo, categoria) {
    return targetBase.find(t => t.tipo === tipo && t.categoria === categoria)
  }
  // Helper: override per PdV
  function getOverride(pdvId) {
    return overrides.find(o => o.pdv_id === pdvId)
  }
  // Calcolo target effettivo per PdV (override se presente, altrimenti base)
  function effettiviPdv(p) {
    const ov = getOverride(p.id)
    if (ov) {
      return {
        mobile: ov.target_mobile ?? 0,
        fisso: ov.target_fisso ?? 0,
        energia: ov.target_energia ?? 0,
        origine: 'override',
      }
    }
    const base = getBase(p.tipo, p.categoria)
    return {
      mobile: base?.target_mobile ?? 0,
      fisso: base?.target_fisso ?? 0,
      energia: base?.target_energia ?? 0,
      origine: 'base',
    }
  }

  // Totale target di tutti i PdV per ogni prodotto
  const totali = useMemo(() => {
    const sum = { mobile: 0, fisso: 0, energia: 0 }
    for (const p of pdvList) {
      const t = effettiviPdv(p)
      sum.mobile += t.mobile
      sum.fisso += t.fisso
      sum.energia += t.energia
    }
    return sum
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdvList, targetBase, overrides])

  async function duplicaMesePrecedente() {
    if (!confirm('Vuoi duplicare TUTTI i target del mese precedente sul mese selezionato? I target già impostati su questo mese verranno sovrascritti.')) return
    try {
      // Calcolo mese precedente
      const [y, m] = meseSel.split('-').map(Number)
      const prev = new Date(y, m - 2, 1)
      const prevISO = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`

      const [resBase, resOv] = await Promise.all([
        supabase.from('target_base').select('*').eq('mese', prevISO),
        supabase.from('target_pdv_override').select('*').eq('mese', prevISO),
      ])
      if (resBase.error) throw resBase.error
      if (resOv.error) throw resOv.error
      if ((resBase.data?.length || 0) + (resOv.data?.length || 0) === 0) {
        toast.warning('Nessun target trovato nel mese precedente.')
        return
      }

      // Upsert tipo, categoria, mese
      if (resBase.data?.length) {
        const righe = resBase.data.map(r => ({
          tipo: r.tipo, categoria: r.categoria, mese: meseISO,
          target_mobile: r.target_mobile,
          target_fisso: r.target_fisso,
          target_energia: r.target_energia,
        }))
        const { error } = await supabase
          .from('target_base')
          .upsert(righe, { onConflict: 'tipo,categoria,mese' })
        if (error) throw error
      }

      if (resOv.data?.length) {
        const righe = resOv.data.map(r => ({
          pdv_id: r.pdv_id, mese: meseISO,
          target_mobile: r.target_mobile,
          target_fisso: r.target_fisso,
          target_energia: r.target_energia,
        }))
        const { error } = await supabase
          .from('target_pdv_override')
          .upsert(righe, { onConflict: 'pdv_id,mese' })
        if (error) throw error
      }

      toast.success('Target duplicati dal mese precedente.')
      fetchAll()
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">Target mensili</h1>
          <p className="mt-1 text-text-muted">
            {isPdv ? 'I tuoi obiettivi del mese.'
             : isAsTm ? 'Target dei PdV a te assegnati.'
             : 'Obiettivi numero contratti per Tipo × Categoria. Override per singolo PdV disponibile.'}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px]">
            <label className="mb-1.5 block text-xs font-medium text-text-muted">Mese</label>
            <MesePicker value={meseSel} onChange={v => v && setMeseSel(v)} />
          </div>
          {isBoAdmin && (
            <Button variant="secondary" onClick={duplicaMesePrecedente}>
              <Copy size={14} /> Duplica mese precedente
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
          <Loader2 size={18} className="animate-spin" /> Caricamento…
        </div>
      ) : (
        <>
          {/* === Sezione: Griglia 8 combinazioni Tipo × Categoria — visibile solo a chi vede tutta la rete === */}
          {!hasScope && (
          <section className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <TargetIcon size={16} className="text-accent-2" />
              <h2 className="text-sm font-medium uppercase tracking-wider text-white">
                Target base · 8 combinazioni
              </h2>
              <span className="text-xs text-text-muted">
                ({TIPI.length * CATEGORIE.length} celle)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-3 py-2 text-xs uppercase tracking-wide text-text-muted"></th>
                    {CATEGORIE.map(c => (
                      <th key={c} className="px-3 py-2 text-center text-xs uppercase tracking-wide text-text-muted">
                        Categoria {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIPI.map(tipo => (
                    <tr key={tipo.v} className="border-t border-border">
                      <td className="px-3 py-3">
                        <Badge tone={tipo.tone}>{tipo.l}</Badge>
                      </td>
                      {CATEGORIE.map(cat => {
                        const base = getBase(tipo.v, cat)
                        const isEmpty = !base
                        return (
                          <td key={cat} className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => isBoAdmin && setEditBase({ tipo: tipo.v, categoria: cat })}
                              disabled={!isBoAdmin}
                              className={cn(
                                'group block w-full rounded-xl border p-3 text-center transition',
                                isEmpty
                                  ? 'border-dashed border-border bg-bg/30 hover:border-accent/40'
                                  : 'border-border bg-bg hover:border-accent/40',
                                !isBoAdmin && 'cursor-default hover:border-border',
                              )}
                            >
                              {isEmpty ? (
                                <div className="text-xs text-text-muted">
                                  {isBoAdmin ? 'Imposta target' : '—'}
                                </div>
                              ) : (
                                <div className="grid grid-cols-3 gap-2 tabular-nums">
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wide text-text-muted">Mob</div>
                                    <div className="text-lg font-medium text-white">{formatInt(base.target_mobile)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wide text-text-muted">Fis</div>
                                    <div className="text-lg font-medium text-white">{formatInt(base.target_fisso)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-wide text-text-muted">Ene</div>
                                    <div className="text-lg font-medium text-white">{formatInt(base.target_energia)}</div>
                                  </div>
                                </div>
                              )}
                              {isBoAdmin && (
                                <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-accent-2 opacity-0 group-hover:opacity-100 transition">
                                  <Edit3 size={10} /> modifica
                                </div>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          )}

          {/* === Sezione: Tabella PdV con target effettivi === */}
          <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-bg/30 px-5 py-3">
              <div className="flex items-center gap-2">
                <Store size={16} className="text-accent-2" />
                <h2 className="text-sm font-medium uppercase tracking-wider text-white">
                  {isPdv ? 'Il tuo target'
                   : isAsTm ? 'Target dei tuoi PdV'
                   : 'Target effettivi per PdV'}
                </h2>
                {!hasScope && <span className="text-xs text-text-muted">({pdvList.length} PdV aperti)</span>}
              </div>
              {!hasScope && (
                <div className="text-xs text-text-muted">
                  Totale rete:&nbsp;
                  <span className="text-white tabular-nums">M {formatInt(totali.mobile)}</span> ·&nbsp;
                  <span className="text-white tabular-nums">F {formatInt(totali.fisso)}</span> ·&nbsp;
                  <span className="text-white tabular-nums">E {formatInt(totali.energia)}</span>
                </div>
              )}
              {isAsTm && (
                <div className="text-xs text-text-muted">
                  Totale tuoi PdV:&nbsp;
                  <span className="text-white tabular-nums">M {formatInt(totali.mobile)}</span> ·&nbsp;
                  <span className="text-white tabular-nums">F {formatInt(totali.fisso)}</span> ·&nbsp;
                  <span className="text-white tabular-nums">E {formatInt(totali.energia)}</span>
                </div>
              )}
            </div>

            {pdvList.length === 0 ? (
              <div className="p-10 text-center text-sm text-text-muted">
                Nessun PdV aperto.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-bg/50 text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="px-5 py-3 font-medium">PdV</th>
                      <th className="px-5 py-3 font-medium">Tipo</th>
                      <th className="px-5 py-3 font-medium">Cat</th>
                      <th className="px-5 py-3 font-medium text-right">Mobile</th>
                      <th className="px-5 py-3 font-medium text-right">Fisso</th>
                      <th className="px-5 py-3 font-medium text-right">Energia</th>
                      <th className="px-5 py-3 font-medium">Origine</th>
                      {isBoAdmin && <th className="px-5 py-3 font-medium" />}
                    </tr>
                  </thead>
                  <tbody>
                    {pdvList.map(p => {
                      const t = effettiviPdv(p)
                      return (
                        <tr key={p.id} className="border-t border-border hover:bg-white/5">
                          <td className="px-5 py-3 font-medium text-white">{p.nome}</td>
                          <td className="px-5 py-3">
                            <Badge tone={p.tipo === 'sinergia' ? 'accent' : 'info'}>
                              {p.tipo === 'sinergia' ? 'Sinergia' : 'Galleria'}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-white">{p.categoria}</td>
                          <td className="px-5 py-3 text-right text-white tabular-nums">{formatInt(t.mobile)}</td>
                          <td className="px-5 py-3 text-right text-white tabular-nums">{formatInt(t.fisso)}</td>
                          <td className="px-5 py-3 text-right text-white tabular-nums">{formatInt(t.energia)}</td>
                          <td className="px-5 py-3">
                            {t.origine === 'override' ? (
                              <Badge tone="warning" className="text-[10px]">Override</Badge>
                            ) : (
                              <Badge tone="neutral" className="text-[10px]">Base</Badge>
                            )}
                          </td>
                          {isBoAdmin && (
                            <td className="px-5 py-3 text-right">
                              <button
                                onClick={() => setEditOverride(p)}
                                className="rounded-lg border border-border bg-bg px-3 py-1 text-xs text-white hover:border-accent/40"
                              >
                                <Edit3 size={11} className="mr-1 inline" />
                                {t.origine === 'override' ? 'Modifica' : 'Override'}
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Helper testo */}
          <p className="mt-4 text-xs text-text-muted">
            ℹ️ I target del mese si basano sulle 8 combinazioni Tipo × Categoria.
            Un override sostituisce il valore base solo per quel PdV in quel mese.
            Lo storico è consultabile cambiando mese in alto.
          </p>
        </>
      )}

      {/* Dialogs */}
      <TargetBaseDialog
        open={!!editBase}
        onClose={() => setEditBase(null)}
        tipo={editBase?.tipo}
        categoria={editBase?.categoria}
        mese={meseISO}
        onSaved={fetchAll}
      />
      <TargetPdvDialog
        open={!!editOverride}
        onClose={() => setEditOverride(null)}
        pdv={editOverride}
        mese={meseISO}
        baseDefault={editOverride ? (() => {
          const b = getBase(editOverride.tipo, editOverride.categoria)
          return {
            mobile: b?.target_mobile ?? 0,
            fisso: b?.target_fisso ?? 0,
            energia: b?.target_energia ?? 0,
          }
        })() : null}
        onSaved={fetchAll}
      />
    </div>
  )
}

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
