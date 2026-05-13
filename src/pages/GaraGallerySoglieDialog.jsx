/**
 * Dialog Configurazione Soglie Gara Gallery (§8.2 / §8.8).
 *
 * 6 soglie per Sinergia + 6 per Galleria. Modifica salva NUOVE righe
 * con valid_from = primo del mese corrente (le vecchie vengono "chiuse" con
 * valid_to = stessa data) → il pregresso resta intatto come da §8.8.
 */
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

const TIPI = [
  { v: 'sinergia', l: 'Sinergia' },
  { v: 'galleria', l: 'Galleria' },
]
const LIVELLI = [1, 2, 3, 4, 5, 6]

export default function GaraGallerySoglieDialog({ open, onClose, soglieAttive, onSaved }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Stato del form: { sinergia: [{ punti_min, premio }, ...x6], galleria: [...] }
  const [form, setForm] = useState({ sinergia: emptyLivelli(), galleria: emptyLivelli() })

  useEffect(() => {
    if (!open) return
    // Pre-popolo dalla soglie attive
    const next = { sinergia: emptyLivelli(), galleria: emptyLivelli() }
    for (const s of soglieAttive || []) {
      if (next[s.tipo] && s.livello >= 1 && s.livello <= 6) {
        next[s.tipo][s.livello - 1] = {
          punti_min: s.punti_min ?? 0,
          premio: s.premio ?? 0,
        }
      }
    }
    setForm(next)
  }, [open, soglieAttive])

  function setVal(tipo, livello, key, val) {
    setForm(prev => {
      const arr = [...prev[tipo]]
      arr[livello - 1] = { ...arr[livello - 1], [key]: Number(val) || 0 }
      return { ...prev, [tipo]: arr }
    })
  }

  async function salva() {
    setSaving(true)
    try {
      // Mese corrente come valid_from delle nuove soglie e valid_to delle vecchie
      const oggi = new Date()
      const meseISO = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-01`

      // 1) Chiudo (valid_to) le soglie attive correnti
      const { error: errChiudi } = await supabase
        .from('gara_gallery_soglie')
        .update({ valid_to: meseISO })
        .is('valid_to', null)
      if (errChiudi) throw errChiudi

      // 2) Inserisco le nuove
      const righe = []
      for (const tipo of TIPI.map(t => t.v)) {
        for (let i = 0; i < 6; i++) {
          righe.push({
            tipo,
            livello: i + 1,
            punti_min: form[tipo][i].punti_min ?? 0,
            premio: form[tipo][i].premio ?? 0,
            valid_from: meseISO,
            valid_to: null,
          })
        }
      }
      const { error: errIns } = await supabase
        .from('gara_gallery_soglie')
        .insert(righe)
      if (errIns) throw errIns

      toast.success('Soglie aggiornate. Le precedenti restano per i mesi storici.')
      onSaved?.()
      onClose?.()
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
      size="lg"
      title="Configurazione soglie Gara Gallery"
      description="Modifica le 6 soglie per Sinergia + 6 per Galleria. Le soglie modificate valgono dal mese corrente in poi; lo storico resta invariato (§8.8)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Annulla</Button>
          <Button onClick={salva} loading={saving}>Salva soglie</Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-text-muted">
          <Loader2 size={16} className="animate-spin" /> Caricamento…
        </div>
      ) : (
        <div className="space-y-5">
          {TIPI.map(tipo => (
            <div key={tipo.v} className="rounded-xl border border-border bg-bg/30 p-4">
              <h3 className={cn(
                'mb-3 text-xs font-semibold uppercase tracking-wider',
                tipo.v === 'sinergia' ? 'text-accent-2' : 'text-info'
              )}>
                {tipo.l}
              </h3>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-text-muted">
                  <div className="col-span-2">Livello</div>
                  <div className="col-span-5">Punti minimi</div>
                  <div className="col-span-5">Premio €</div>
                </div>
                {LIVELLI.map(l => (
                  <div key={l} className="grid grid-cols-12 items-center gap-2">
                    <div className="col-span-2 text-sm text-white">Soglia {l}</div>
                    <div className="col-span-5">
                      <Input
                        type="number"
                        min={0}
                        value={form[tipo.v][l - 1].punti_min}
                        onChange={e => setVal(tipo.v, l, 'punti_min', e.target.value)}
                      />
                    </div>
                    <div className="col-span-5">
                      <Input
                        type="number"
                        min={0}
                        value={form[tipo.v][l - 1].premio}
                        onChange={e => setVal(tipo.v, l, 'premio', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p className="text-xs text-text-muted">
            ℹ️ Per ricordare la regola §8.4: nei <strong>primi 3 mesi di vita</strong> di un PdV le soglie si raggiungono al <strong>50% dei punti</strong>. Il premio resta quello impostato qui.
          </p>
        </div>
      )}
    </Dialog>
  )
}

function emptyLivelli() {
  return Array.from({ length: 6 }, () => ({ punti_min: 0, premio: 0 }))
}
