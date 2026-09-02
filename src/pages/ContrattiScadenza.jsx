/**
 * Pagina "Contratti in scadenza" (§2026-07).
 *
 * Elenca i collaboratori ATTIVI con contratto in scadenza, raggruppati in 4
 * sezioni per urgenza:
 *   🟢 verde   → scadenza il MESE PROSSIMO
 *   🟡 giallo  → scadenza in QUESTO MESE (oltre 7 giorni da oggi)
 *   🟠 arancio → scadenza in QUESTA SETTIMANA (entro 7 giorni)
 *   🔴 rosso   → GIÀ SCADUTI
 *
 * I collaboratori con contratto "indeterminato" (data_scadenza_contratto NULL)
 * NON compaiono qui. I disattivati nemmeno.
 *
 * Admin/BO possono cliccare "Rinnova contratto" su ogni riga per impostare
 * una nuova data (o mettere indeterminato).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2, CalendarClock, RefreshCw, Infinity as InfinityIcon, AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'

// -----------------------------------------------------------------------------
// Utility date: lavoriamo in stringhe YYYY-MM-DD (compatibili con DB date)
// -----------------------------------------------------------------------------
function ymdOggi() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function ymdPiuGiorni(giorni) {
  const d = new Date()
  d.setDate(d.getDate() + giorni)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function ultimoGiornoDelMese() {
  const d = new Date()
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const p = n => String(n).padStart(2, '0')
  return `${ultimo.getFullYear()}-${p(ultimo.getMonth() + 1)}-${p(ultimo.getDate())}`
}

function ultimoGiornoMesePros() {
  const d = new Date()
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 2, 0)
  const p = n => String(n).padStart(2, '0')
  return `${ultimo.getFullYear()}-${p(ultimo.getMonth() + 1)}-${p(ultimo.getDate())}`
}

function primoGiornoMesePros() {
  const d = new Date()
  const primo = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const p = n => String(n).padStart(2, '0')
  return `${primo.getFullYear()}-${p(primo.getMonth() + 1)}-${p(primo.getDate())}`
}

function formatData(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('it-IT')
}

// Giorni residui (positivi = ancora futuro; negativi = scaduto da tot giorni)
function giorniResidui(dataStr) {
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  const target = new Date(dataStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target - oggi) / (1000 * 60 * 60 * 24))
}

// -----------------------------------------------------------------------------
// Configurazione delle 4 sezioni (verde → rosso)
// -----------------------------------------------------------------------------
const SEZIONI = [
  {
    key: 'prossimoMese',
    titolo: 'Prossimo mese',
    descrizione: 'Contratti in scadenza nel mese successivo',
    tono: 'success',
    borderClass: 'border-success/40',
    bgClass: 'bg-success/5',
    iconBg: 'bg-success/15 text-success',
  },
  {
    key: 'questoMese',
    titolo: 'Questo mese',
    descrizione: 'Scadono in questo mese (oltre 7 giorni da oggi)',
    tono: 'warning',
    borderClass: 'border-warning/40',
    bgClass: 'bg-warning/5',
    iconBg: 'bg-warning/15 text-warning',
  },
  {
    key: 'questaSettimana',
    titolo: 'Questa settimana',
    descrizione: 'Scadono nei prossimi 7 giorni — urgente',
    tono: 'orange',
    borderClass: 'border-[#f5a04255]',
    bgClass: 'bg-[#f5a0420d]',
    iconBg: 'bg-[#f5a04228] text-[#f5a042]',
  },
  {
    key: 'scaduti',
    titolo: 'Scaduti',
    descrizione: 'Contratti già scaduti — da regolarizzare',
    tono: 'danger',
    borderClass: 'border-danger/40',
    bgClass: 'bg-danger/5',
    iconBg: 'bg-danger/15 text-danger',
  },
]

// -----------------------------------------------------------------------------
// Classificazione di un collaboratore in una delle 4 sezioni (o null se fuori)
// -----------------------------------------------------------------------------
export function classificaScadenza(dataStr) {
  if (!dataStr) return null
  const oggi = ymdOggi()
  const tra7 = ymdPiuGiorni(7)
  const ultimoQuesto = ultimoGiornoDelMese()
  const primoPros = primoGiornoMesePros()
  const ultimoPros = ultimoGiornoMesePros()

  if (dataStr < oggi) return 'scaduti'
  if (dataStr <= tra7) return 'questaSettimana'
  if (dataStr <= ultimoQuesto) return 'questoMese'
  if (dataStr >= primoPros && dataStr <= ultimoPros) return 'prossimoMese'
  return null  // fuori range (troppo lontana nel futuro)
}

// -----------------------------------------------------------------------------
export default function ContrattiScadenza() {
  const { profile } = useAuth()
  // HR aggiunto 2026-07: responsabile risorse umane, deve poter rinnovare i
  // contratti di lavoro dei collaboratori.
  const canEdit = ['admin', 'bo', 'hr'].includes(profile?.ruolo)

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [dlgRinnovo, setDlgRinnovo] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    // Prendo tutti i collaboratori ATTIVI con una data scadenza impostata
    const { data, error } = await supabase
      .from('collaboratori')
      .select(`
        id, nome, cognome, ruolo, data_scadenza_contratto, email, telefono,
        pdv_collaboratori(ruolo_nel_pdv, pdv:pdv(id, nome))
      `)
      .eq('stato', 'attivo')
      .not('data_scadenza_contratto', 'is', null)
      .order('data_scadenza_contratto', { ascending: true })
    if (error) {
      toast.error(`Errore: ${error.message}`)
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Raggruppo in 4 bucket
  const bucket = useMemo(() => {
    const b = { prossimoMese: [], questoMese: [], questaSettimana: [], scaduti: [] }
    for (const c of rows) {
      const s = classificaScadenza(c.data_scadenza_contratto)
      if (s && b[s]) b[s].push(c)
    }
    return b
  }, [rows])

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">Contratti in scadenza</h1>
          <p className="mt-1 text-text-muted">
            Collaboratori attivi con contratto in scadenza. I contratti a tempo
            indeterminato (∞) e i collaboratori disattivati non compaiono qui.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
          <Loader2 size={18} className="animate-spin" /> Caricamento…
        </div>
      ) : (
        <div className="space-y-4">
          {SEZIONI.map(sez => (
            <Sezione
              key={sez.key}
              config={sez}
              items={bucket[sez.key]}
              canEdit={canEdit}
              onRinnova={c => setDlgRinnovo(c)}
            />
          ))}
        </div>
      )}

      {/* Dialog rinnovo */}
      <RinnovaDialog
        open={!!dlgRinnovo}
        collaboratore={dlgRinnovo}
        onClose={() => setDlgRinnovo(null)}
        onSaved={() => { setDlgRinnovo(null); fetchAll() }}
      />
    </div>
  )
}

// -----------------------------------------------------------------------------
function Sezione({ config, items, canEdit, onRinnova }) {
  const vuoto = items.length === 0
  return (
    <div className={cn('rounded-2xl border shadow-soft', config.borderClass, config.bgClass)}>
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', config.iconBg)}>
            {config.key === 'scaduti' ? <AlertTriangle size={16} /> : <CalendarClock size={16} />}
          </div>
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wider text-white">
              {config.titolo}
            </h2>
            <p className="text-xs text-text-muted">{config.descrizione}</p>
          </div>
        </div>
        {config.tono === 'orange' ? (
          // Il Badge non ha un tone 'arancio' → uso stile inline coerente coi #F5A042
          <span className="inline-flex items-center rounded-full bg-[#f5a04228] px-2.5 py-0.5 text-xs font-medium text-[#f5a042] ring-1 ring-[#f5a04255]">
            {items.length}
          </span>
        ) : (
          <Badge tone={config.tono}>{items.length}</Badge>
        )}
      </div>

      {vuoto ? (
        <div className="px-5 py-6 text-center text-sm text-text-muted">
          Nessun collaboratore in questa fascia.
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {items.map(c => {
            const gg = giorniResidui(c.data_scadenza_contratto)
            const pdvs = (c.pdv_collaboratori || [])
              .map(r => r.pdv?.nome)
              .filter(Boolean)
              .join(' · ')
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white">
                    {c.nome} {c.cognome}
                    <span className="ml-2 text-xs text-text-muted">{c.ruolo}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted">
                    <span>Scadenza: <span className="tabular-nums text-white">{formatData(c.data_scadenza_contratto)}</span></span>
                    <span>{gg >= 0 ? `Tra ${gg} giorni` : `Scaduto da ${-gg} giorni`}</span>
                    {pdvs && <span>PdV: {pdvs}</span>}
                    {c.telefono && <span>📱 {c.telefono}</span>}
                  </div>
                </div>
                {canEdit && (
                  <Button size="sm" onClick={() => onRinnova(c)}>
                    <RefreshCw size={13} /> Rinnova contratto
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
function RinnovaDialog({ open, collaboratore, onClose, onSaved }) {
  const [nuovaData, setNuovaData] = useState('')
  const [indeterminato, setIndeterminato] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setNuovaData('')
      setIndeterminato(false)
    }
  }, [open])

  async function salva() {
    if (!collaboratore) return
    if (!indeterminato && !nuovaData) {
      toast.error('Seleziona una nuova data o attiva "Indeterminato".')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('collaboratori')
        .update({ data_scadenza_contratto: indeterminato ? null : nuovaData })
        .eq('id', collaboratore.id)
      if (error) throw error
      toast.success(
        indeterminato
          ? `Contratto di ${collaboratore.nome} ${collaboratore.cognome} impostato a INDETERMINATO.`
          : `Contratto di ${collaboratore.nome} ${collaboratore.cognome} rinnovato al ${formatData(nuovaData)}.`
      )
      onSaved?.()
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Rinnova contratto"
      description={collaboratore ? `${collaboratore.nome} ${collaboratore.cognome} · scadenza attuale ${formatData(collaboratore.data_scadenza_contratto)}` : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annulla</Button>
          <Button onClick={salva} loading={saving}>
            <RefreshCw size={14} /> Conferma rinnovo
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-muted">
            Nuova data scadenza
          </label>
          {indeterminato ? (
            <div className="flex h-[38px] items-center rounded-xl border border-border bg-bg/30 px-3 text-sm text-text-muted">
              <InfinityIcon size={16} className="mr-2 text-accent-2" />
              Contratto a tempo indeterminato
            </div>
          ) : (
            <Input
              type="date"
              value={nuovaData}
              onChange={e => setNuovaData(e.target.value)}
              min={ymdOggi()}
            />
          )}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={indeterminato}
            onChange={e => setIndeterminato(e.target.checked)}
            className="accent-accent"
          />
          <span>Indeterminato <InfinityIcon size={12} className="inline" /></span>
        </label>
      </div>
    </Dialog>
  )
}
