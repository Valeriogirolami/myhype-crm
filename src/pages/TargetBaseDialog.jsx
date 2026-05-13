/**
 * Dialog Modifica/Crea Target Base — combinazione Tipo × Categoria (§7.2).
 *
 * Permette ad Admin/BO di impostare i 3 valori (Mobile/Fisso/Energia) per la
 * combinazione e di replicare la stessa impostazione su:
 *  - solo il mese selezionato (default)
 *  - prossimo trimestre (3 mesi)
 *  - anno solare corrente (12 mesi)
 *
 * Tecnica: upsert su (tipo, categoria, mese) per ogni mese coinvolto.
 */
import { useEffect, useState } from 'react'
import { Loader2, Calendar } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'

const ETICHETTA_TIPO = { sinergia: 'Sinergia', galleria: 'Galleria' }

export default function TargetBaseDialog({ open, onClose, tipo, categoria, mese, onSaved }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [mobile, setMobile] = useState(0)
  const [fisso, setFisso] = useState(0)
  const [energia, setEnergia] = useState(0)
  const [periodicita, setPeriodicita] = useState('mese') // 'mese' | 'trimestre' | 'anno'

  // Carico il valore esistente all'apertura
  useEffect(() => {
    if (!open || !tipo || !categoria || !mese) return
    setLoading(true)
    setPeriodicita('mese')
    supabase
      .from('target_base')
      .select('*')
      .eq('tipo', tipo)
      .eq('categoria', categoria)
      .eq('mese', mese)
      .maybeSingle()
      .then(({ data }) => {
        setMobile(data?.target_mobile ?? 0)
        setFisso(data?.target_fisso ?? 0)
        setEnergia(data?.target_energia ?? 0)
        setLoading(false)
      })
  }, [open, tipo, categoria, mese])

  async function salva() {
    setSaving(true)
    try {
      // Calcolo i mesi coinvolti
      const mesi = mesiPerPeriodicita(mese, periodicita)
      const righe = mesi.map(m => ({
        tipo,
        categoria,
        mese: m,
        target_mobile: Number(mobile) || 0,
        target_fisso: Number(fisso) || 0,
        target_energia: Number(energia) || 0,
      }))

      const { error } = await supabase
        .from('target_base')
        .upsert(righe, { onConflict: 'tipo,categoria,mese' })
      if (error) throw error

      toast.success(
        mesi.length === 1
          ? 'Target base aggiornato.'
          : `Target base replicato su ${mesi.length} mesi.`
      )
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
      title={`Target base · ${ETICHETTA_TIPO[tipo] || tipo} · Categoria ${categoria}`}
      description="I valori si applicano automaticamente a tutti i PdV che combaciano. Override singoli si gestiscono nella tabella sottostante."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={salva} loading={saving}>
            Salva
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
          <div className="grid grid-cols-3 gap-3">
            <Input label="Mobile" type="number" min={0} value={mobile}
              onChange={e => setMobile(e.target.value)} />
            <Input label="Fisso" type="number" min={0} value={fisso}
              onChange={e => setFisso(e.target.value)} />
            <Input label="Energia" type="number" min={0} value={energia}
              onChange={e => setEnergia(e.target.value)} />
          </div>

          <div className="rounded-xl border border-border bg-bg/30 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-text-muted">
              <Calendar size={12} /> Applica a
            </div>
            <Select value={periodicita} onChange={e => setPeriodicita(e.target.value)}>
              <option value="mese">Solo mese selezionato ({formatYMHuman(mese)})</option>
              <option value="trimestre">Prossimo trimestre (3 mesi a partire da {formatYMHuman(mese)})</option>
              <option value="anno">Anno solare ({mese.slice(0,4)} — 12 mesi)</option>
            </Select>
            <p className="mt-2 text-xs text-text-muted">
              Se in alcuni di quei mesi è già presente un target, verrà sovrascritto.
            </p>
          </div>
        </div>
      )}
    </Dialog>
  )
}

// === helpers ===

// 'YYYY-MM-01' → array di 'YYYY-MM-01' in base alla periodicità
function mesiPerPeriodicita(meseISO, periodicita) {
  const [y, m] = meseISO.split('-').map(Number)
  const dataInizio = new Date(y, m - 1, 1)

  let n = 1
  if (periodicita === 'trimestre') n = 3
  else if (periodicita === 'anno') n = 12

  const mesi = []
  if (periodicita === 'anno') {
    // anno solare = 12 mesi a partire da gennaio dello stesso anno
    for (let i = 0; i < 12; i++) {
      const d = new Date(y, i, 1)
      mesi.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
    }
  } else {
    for (let i = 0; i < n; i++) {
      const d = new Date(dataInizio.getFullYear(), dataInizio.getMonth() + i, 1)
      mesi.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
    }
  }
  return mesi
}

function formatYMHuman(meseISO) {
  if (!meseISO) return ''
  const [y, m] = meseISO.split('-').map(Number)
  const mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  return `${mesi[m - 1]} ${y}`
}
