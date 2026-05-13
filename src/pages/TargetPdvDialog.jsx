/**
 * Dialog Override Target per singolo PdV (§7.2).
 *
 * Permette ad Admin/BO di:
 *  - sovrascrivere i target base per un PdV specifico nel mese selezionato
 *  - rimuovere l'override (rimettendo i valori derivati dal base)
 *
 * I valori "default" mostrati nei campi sono quelli che il PdV avrebbe SENZA
 * override (cioè quelli del target_base della sua combo Tipo × Categoria).
 */
import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'

export default function TargetPdvDialog({ open, onClose, pdv, mese, baseDefault, onSaved }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasOverride, setHasOverride] = useState(false)

  const [mobile, setMobile] = useState(0)
  const [fisso, setFisso] = useState(0)
  const [energia, setEnergia] = useState(0)

  useEffect(() => {
    if (!open || !pdv?.id || !mese) return
    setLoading(true)
    supabase
      .from('target_pdv_override')
      .select('*')
      .eq('pdv_id', pdv.id)
      .eq('mese', mese)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setHasOverride(true)
          setMobile(data.target_mobile ?? 0)
          setFisso(data.target_fisso ?? 0)
          setEnergia(data.target_energia ?? 0)
        } else {
          setHasOverride(false)
          setMobile(baseDefault?.mobile ?? 0)
          setFisso(baseDefault?.fisso ?? 0)
          setEnergia(baseDefault?.energia ?? 0)
        }
        setLoading(false)
      })
  }, [open, pdv?.id, mese, baseDefault?.mobile, baseDefault?.fisso, baseDefault?.energia])

  async function salva() {
    setSaving(true)
    try {
      const payload = {
        pdv_id: pdv.id,
        mese,
        target_mobile: Number(mobile) || 0,
        target_fisso: Number(fisso) || 0,
        target_energia: Number(energia) || 0,
      }
      const { error } = await supabase
        .from('target_pdv_override')
        .upsert([payload], { onConflict: 'pdv_id,mese' })
      if (error) throw error
      toast.success('Override target aggiornato.')
      onSaved?.()
      onClose?.()
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function rimuoviOverride() {
    if (!confirm('Rimuovere l\'override e tornare ai valori base? I target del PdV per questo mese seguiranno la combinazione Tipo × Categoria.')) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('target_pdv_override')
        .delete()
        .eq('pdv_id', pdv.id)
        .eq('mese', mese)
      if (error) throw error
      toast.success('Override rimosso.')
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
      size="md"
      title={`Override target · ${pdv?.nome}`}
      description={`Tipo: ${pdv?.tipo} · Categoria ${pdv?.categoria} · Mese: ${formatYMHuman(mese)}`}
      footer={
        <>
          {hasOverride && (
            <Button variant="danger" onClick={rimuoviOverride} disabled={saving}>
              <Trash2 size={14} /> Rimuovi override
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={salva} loading={saving}>
            Salva override
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-text-muted">
          <Loader2 size={16} className="animate-spin" /> Caricamento…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-text-muted">
            {hasOverride
              ? '✏️ Questo PdV ha già un override personale per il mese selezionato. Modifica i valori o rimuovi l\'override.'
              : 'ℹ️ Stai impostando un override personale per questo PdV. I valori che vedi sono quelli "base" per la sua combinazione, modificali liberamente.'}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input label="Mobile" type="number" min={0} value={mobile}
              onChange={e => setMobile(e.target.value)} />
            <Input label="Fisso" type="number" min={0} value={fisso}
              onChange={e => setFisso(e.target.value)} />
            <Input label="Energia" type="number" min={0} value={energia}
              onChange={e => setEnergia(e.target.value)} />
          </div>
        </div>
      )}
    </Dialog>
  )
}

function formatYMHuman(meseISO) {
  if (!meseISO) return ''
  const [y, m] = meseISO.split('-').map(Number)
  const mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  return `${mesi[m - 1]} ${y}`
}
