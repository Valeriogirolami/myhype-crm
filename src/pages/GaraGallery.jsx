/**
 * Pagina Gara Gallery (§8) — visibile solo ad Admin.
 *
 * 2 sezioni in tab:
 *  1. Dashboard — tabella PdV con punti, soglia raggiunta, premio previsto
 *  2. Soglie    — visualizzazione + bottone modifica
 *
 * Selettore mese in alto: filtra tutti i calcoli.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Trophy, Loader2, Settings, Crown, Award, BadgeInfo,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { cn, formatEuro, formatInt } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import MesePicker from '@/components/ui/MesePicker'
import {
  fetchSoglieAttive, fetchSoglieAttualmenteAttive,
  calcolaPdvGaraGallery, fetchContrattiAttualizzati,
} from '@/lib/garaGallery'
import { fetchContrattiMese } from '@/lib/dashboard'
import { supabase } from '@/lib/supabase'
import GaraGallerySoglieDialog from './GaraGallerySoglieDialog'

const TABS = [
  { v: 'dashboard', l: 'Dashboard', icon: Trophy },
  { v: 'soglie',    l: 'Soglie',    icon: Settings },
]

export default function GaraGallery() {
  const { profile } = useAuth()
  const isAdmin = profile?.ruolo === 'admin'

  const [tab, setTab] = useState('dashboard')
  const [meseSel, setMeseSel] = useState(currentYM())
  const [loading, setLoading] = useState(true)

  const [soglie, setSoglie] = useState([])           // soglie attive nel mese selezionato
  const [soglieCorrenti, setSoglieCorrenti] = useState([]) // attualmente attive (per il dialog)
  const [pdvList, setPdvList] = useState([])
  const [contrattiMese, setContrattiMese] = useState([])
  const [contrattiAttual, setContrattiAttual] = useState([])

  const [editSoglie, setEditSoglie] = useState(false)

  async function fetchAll() {
    setLoading(true)
    try {
      const [resSoglie, resCorrenti, resPdv, resCtr, resAttual] = await Promise.all([
        fetchSoglieAttive(meseSel),
        fetchSoglieAttualmenteAttive(),
        supabase.from('pdv')
          .select('id, nome, tipo, area, categoria, data_apertura, stato')
          .eq('stato', 'aperto').order('nome'),
        fetchContrattiMese(meseSel),
        fetchContrattiAttualizzati(meseSel),
      ])
      setSoglie(resSoglie)
      setSoglieCorrenti(resCorrenti)
      setPdvList(resPdv.data || [])
      setContrattiMese(resCtr)
      setContrattiAttual(resAttual)
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [meseSel])

  // Calcolo riga per ogni PdV
  const righePdv = useMemo(() => {
    return pdvList.map(p =>
      calcolaPdvGaraGallery(p, contrattiMese, contrattiAttual, soglie, meseSel)
    ).sort((a, b) => b.premio_previsto - a.premio_previsto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdvList, contrattiMese, contrattiAttual, soglie, meseSel])

  // Totali rete
  const totalePremioPrevisto = righePdv.reduce((s, r) => s + r.premio_previsto, 0)
  const totalePremioAttualizzato = righePdv.reduce((s, r) => s + r.premio_attualizzato, 0)

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">Gara Gallery 🏆</h1>
          <p className="mt-1 text-text-muted">
            Sistema bonus aziendale (§8) — premi per soglie di punti raggiunte dai PdV.
          </p>
        </div>
        <div className="min-w-[260px]">
          <label className="mb-1.5 block text-xs font-medium text-text-muted">Mese</label>
          <MesePicker value={meseSel} onChange={v => v && setMeseSel(v)} />
        </div>
      </div>

      {/* Tab switcher */}
      <div className="mt-6 flex items-center gap-1 rounded-xl border border-border bg-bg/50 p-1 w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.v
          return (
            <button
              key={t.v}
              type="button"
              onClick={() => setTab(t.v)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition',
                active ? 'bg-surface text-white shadow-soft' : 'text-text-muted hover:text-white',
              )}
            >
              <Icon size={14} />
              {t.l}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
          <Loader2 size={18} className="animate-spin" /> Caricamento…
        </div>
      ) : tab === 'dashboard' ? (
        <DashboardSection
          righe={righePdv}
          totalePremioPrevisto={totalePremioPrevisto}
          totalePremioAttualizzato={totalePremioAttualizzato}
        />
      ) : (
        <SoglieSection
          soglie={soglie}
          mese={meseSel}
          isAdmin={isAdmin}
          onEdit={() => setEditSoglie(true)}
        />
      )}

      {/* Dialog modifica soglie */}
      <GaraGallerySoglieDialog
        open={editSoglie}
        onClose={() => setEditSoglie(false)}
        soglieAttive={soglieCorrenti}
        onSaved={fetchAll}
      />
    </div>
  )
}

// ---------- Sezione Dashboard ----------

function DashboardSection({ righe, totalePremioPrevisto, totalePremioAttualizzato }) {
  return (
    <div className="mt-4 space-y-4">
      {/* Riepilogo totale */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Trophy size={14} className="text-accent-2" />
            Premio previsto totale rete
          </div>
          <div className="mt-3 text-3xl font-medium tabular-nums text-white">
            {formatEuro(totalePremioPrevisto)}
          </div>
          <div className="mt-1 text-xs text-text-muted">
            Calcolato sui contratti VALIDATI nel mese (proiezione fine mese)
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Award size={14} className="text-success" />
            Premio attualizzato totale rete
          </div>
          <div className="mt-3 text-3xl font-medium tabular-nums text-success">
            {formatEuro(totalePremioAttualizzato)}
          </div>
          <div className="mt-1 text-xs text-text-muted">
            Sui contratti GETTONATI nel mese · meno stornati
          </div>
        </div>
      </div>

      {/* Tabella PdV */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
        <div className="border-b border-border bg-bg/30 px-5 py-3">
          <div className="text-sm font-medium uppercase tracking-wider text-white">
            Premi per PdV
          </div>
          <div className="text-[11px] text-text-muted">
            Ordinati per premio previsto · 🏆 indica regola primi 3 mesi (soglie al 50%)
          </div>
        </div>
        {righe.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">Nessun PdV aperto.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg/30 text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-3 font-medium">PdV</th>
                  <th className="px-3 py-3 font-medium">Tipo</th>
                  <th className="px-3 py-3 font-medium">Mese vita</th>
                  <th className="px-3 py-3 font-medium text-right">Punti attuali</th>
                  <th className="px-3 py-3 font-medium text-right">Proiezione fine mese</th>
                  <th className="px-3 py-3 font-medium">Soglia prevista</th>
                  <th className="px-5 py-3 font-medium text-right">Premio previsto</th>
                  <th className="px-5 py-3 font-medium text-right">Premio attualizzato</th>
                </tr>
              </thead>
              <tbody>
                {righe.map(r => (
                  <tr key={r.pdv_id} className="border-t border-border hover:bg-white/5">
                    <td className="px-5 py-3 font-medium text-white">{r.nome}</td>
                    <td className="px-3 py-3">
                      <Badge tone={r.tipo === 'sinergia' ? 'accent' : 'info'}>
                        {r.tipo === 'sinergia' ? 'Sinergia' : 'Galleria'}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-white">
                      <div className="flex items-center gap-1">
                        <span className="tabular-nums">{r.mesi_vita}°</span>
                        {r.mesi_vita <= 3 && (
                          <span title="Regola primi 3 mesi: soglie al 50%">
                            <BadgeInfo size={12} className="text-warning" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-white">
                      {formatInt(r.punti_attuali)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-white">
                      {formatInt(r.proiezione)}
                    </td>
                    <td className="px-3 py-3">
                      {r.soglia_prevista ? (
                        <Badge tone="success">
                          Soglia {r.soglia_prevista.livello}
                        </Badge>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-white">
                      {r.premio_previsto > 0 ? (
                        <span className="font-semibold">{formatEuro(r.premio_previsto)}</span>
                      ) : (
                        <span className="text-text-muted">{formatEuro(0)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {r.premio_attualizzato > 0 ? (
                        <span className="font-semibold text-success">{formatEuro(r.premio_attualizzato)}</span>
                      ) : (
                        <span className="text-text-muted">{formatEuro(0)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Sezione Soglie ----------

function SoglieSection({ soglie, mese, isAdmin, onEdit }) {
  const sinergia = soglie.filter(s => s.tipo === 'sinergia').sort((a, b) => a.livello - b.livello)
  const galleria = soglie.filter(s => s.tipo === 'galleria').sort((a, b) => a.livello - b.livello)

  return (
    <div className="mt-4 space-y-4">
      {soglie.length === 0 ? (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-5 text-sm">
          <div className="font-medium text-white">Nessuna soglia configurata per il mese {formatYM(mese)}.</div>
          <div className="mt-1 text-text-muted">
            {isAdmin
              ? 'Clicca "Modifica soglie" per inserire le 6 soglie Sinergia + 6 Galleria.'
              : 'Contatta un Admin per configurare le soglie.'}
          </div>
          {isAdmin && (
            <Button onClick={onEdit} className="mt-3">
              <Settings size={14} /> Modifica soglie
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SogliaCard tipo="sinergia" soglie={sinergia} />
          <SogliaCard tipo="galleria" soglie={galleria} />
        </div>
      )}

      {soglie.length > 0 && isAdmin && (
        <div className="flex justify-end">
          <Button onClick={onEdit}>
            <Settings size={14} /> Modifica soglie
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-text-muted">
        ℹ️ <strong>Regola primi 3 mesi (§8.4)</strong>: per i PdV nei primi 3 mesi di vita le
        soglie si raggiungono al <strong>50% dei punti</strong>. Il premio resta quello standard.
        Le modifiche alle soglie valgono dal mese corrente in poi: i mesi storici mantengono
        le soglie del momento (§8.8).
      </div>
    </div>
  )
}

function SogliaCard({ tipo, soglie }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
      <div className={cn(
        'border-b border-border px-5 py-3',
        tipo === 'sinergia' ? 'bg-accent/5' : 'bg-info/5',
      )}>
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            tipo === 'sinergia' ? 'bg-accent/15 text-accent-2' : 'bg-info/15 text-info',
          )}>
            <Trophy size={14} />
          </div>
          <div>
            <div className="text-sm font-medium text-white">
              {tipo === 'sinergia' ? 'Sinergia' : 'Galleria'}
            </div>
            <div className="text-[11px] text-text-muted">6 soglie progressive</div>
          </div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
            <th className="px-5 py-2 font-medium w-16">Liv.</th>
            <th className="px-3 py-2 font-medium text-right">Punti minimi</th>
            <th className="px-5 py-2 font-medium text-right">Premio</th>
          </tr>
        </thead>
        <tbody>
          {soglie.map(s => (
            <tr key={s.id} className="border-t border-border">
              <td className="px-5 py-3">
                <div className="flex items-center gap-1">
                  <Crown size={12} className={cn(
                    s.livello === 6 ? 'text-warning' :
                    s.livello >= 4 ? 'text-accent-2' :
                                     'text-text-muted',
                  )} />
                  <span className="text-white tabular-nums">{s.livello}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-white">
                {formatInt(s.punti_min)}
              </td>
              <td className="px-5 py-3 text-right tabular-nums text-white font-medium">
                {formatEuro(s.premio)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- helpers ----------

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatYM(ym) {
  const [y, m] = ym.split('-').map(Number)
  const mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  return `${mesi[m - 1]} ${y}`
}
