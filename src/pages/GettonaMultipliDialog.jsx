/**
 * Dialog "Gettona contratti selezionati" — gettonamento massivo.
 *
 * Riceve la lista degli ID di contratti VALIDATI, chiede il mese di competenza
 * e li passa tutti in stato 'gettonato' applicando lo snapshot dei totali
 * dai sottoprodotti CORRENTI di ogni contratto (§5.3).
 */
import { useState } from 'react'
import { Coins, AlertCircle } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import MesePicker from '@/components/ui/MesePicker'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { calcolaTotali } from '@/lib/contratti'

export default function GettonaMultipliDialog({ open, onClose, ids, onDone }) {
  const [mese, setMese] = useState('')
  const [loading, setLoading] = useState(false)

  async function conferma() {
    if (!mese) {
      toast.error('Seleziona il mese di competenza.')
      return
    }
    if (!ids || ids.length === 0) {
      toast.error('Nessun contratto selezionato.')
      return
    }
    setLoading(true)
    try {
      // 1) Carico i contratti con i loro sottoprodotti per calcolare lo snapshot
      const { data: contratti, error: errFetch } = await supabase
        .from('contratti')
        .select('id, contratto_sottoprodotti(sottoprodotti(*))')
        .in('id', ids)
      if (errFetch) throw errFetch

      // 2) Per ognuno calcolo i totali e faccio l'update
      const meseIso = `${mese}-01`
      const updates = contratti.map(c => {
        const sps = (c.contratto_sottoprodotti || [])
          .map(r => r.sottoprodotti)
          .filter(Boolean)
        const t = calcolaTotali(sps)
        return supabase
          .from('contratti')
          .update({
            stato: 'gettonato',
            mese_gettonamento: meseIso,
            fatturato_azienda_snap: t.fatturato_azienda,
            fatturato_pdv_snap: t.fatturato_pdv,
            punti_snap: t.punti,
            motivo_ko: null,
            note_ko: null,
          })
          .eq('id', c.id)
      })

      const results = await Promise.all(updates)
      const errori = results.filter(r => r.error).map(r => r.error.message)

      if (errori.length === 0) {
        toast.success(`${contratti.length} contratti gettonati.`)
      } else if (errori.length < contratti.length) {
        toast.warning(`${contratti.length - errori.length} ok, ${errori.length} errori.`)
      } else {
        throw new Error(errori[0] || 'Errore generico')
      }

      onDone?.()
      onClose?.()
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={`Gettona ${ids?.length || 0} contratti`}
      description="Seleziona il mese di competenza unico per tutti. Punti e fatturato verranno congelati al momento del gettonamento (§5.3)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Annulla
          </Button>
          <Button onClick={conferma} loading={loading}>
            <Coins size={14} /> Conferma gettonamento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-accent-2" />
            <div>
              <div className="text-white">
                Stai per gettonare <strong>{ids?.length || 0} contratti</strong>{' '}
                contemporaneamente.
              </div>
              <div className="mt-1 text-xs text-text-muted">
                L'operazione è atomica per ogni contratto: ognuno otterrà il proprio snapshot
                in base ai sottoprodotti CORRENTI di quel contratto.
              </div>
            </div>
          </div>
        </div>

        <MesePicker
          label="Mese di competenza per tutti"
          required
          value={mese}
          onChange={setMese}
          hint="Lo stesso mese verrà applicato a tutti i contratti selezionati"
        />
      </div>
    </Dialog>
  )
}
