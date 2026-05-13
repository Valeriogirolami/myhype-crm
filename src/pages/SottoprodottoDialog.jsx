/**
 * Dialog per creazione / modifica di un Sottoprodotto (§5.2).
 *
 * Campi:
 *  - Nome
 *  - Prodotto padre (Mobile / Fisso / Energia)
 *  - Tipo energia (Luce / Gas) ← obbligatorio SOLO se prodotto_padre = 'energia'
 *    (richiesta Valerio 2026-04-24: distinguere fornitura luce vs gas
 *     per generare contratti separati)
 *  - Fatturato Azienda (€, intero)
 *  - Fatturato PdV (€, intero)
 *  - Punti (intero)
 *  - Stato (attivo / disattivato)
 *
 * Regole:
 *  - Provvigioni uguali per tutti (§5.3)
 *  - Fatturato Azienda visibile solo agli Admin (§11)
 *  - Disattivazione ≠ cancellazione (§5.3)
 */
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'

// Validazione con Zod — tipo_energia obbligatorio se padre = 'energia'
const schema = z.object({
  nome:              z.string().min(1, 'Obbligatorio').max(100),
  prodotto_padre:    z.enum(['mobile', 'fisso', 'energia']),
  tipo_energia:      z.enum(['luce', 'gas']).optional().or(z.literal('')),
  fatturato_azienda: z.coerce.number().int().min(0, 'Deve essere ≥ 0'),
  fatturato_pdv:     z.coerce.number().int().min(0, 'Deve essere ≥ 0'),
  punti:             z.coerce.number().int().min(0, 'Deve essere ≥ 0'),
  stato:             z.enum(['attivo', 'disattivato']),
}).refine(
  d => d.prodotto_padre !== 'energia' || (d.tipo_energia === 'luce' || d.tipo_energia === 'gas'),
  {
    message: 'Per Energia devi specificare se è Luce o Gas',
    path: ['tipo_energia'],
  }
)

const defaultValues = {
  nome: '',
  prodotto_padre: 'mobile',
  tipo_energia: '',
  fatturato_azienda: 0,
  fatturato_pdv: 0,
  punti: 0,
  stato: 'attivo',
}

export default function SottoprodottoDialog({
  open,
  onClose,
  sottoprodotto,
  prodottoPadrePreset,
  onSaved,
}) {
  const isEdit = Boolean(sottoprodotto?.id)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues })

  // Mostra il campo tipo energia solo se padre = 'energia'
  const padreCorrente = watch('prodotto_padre')
  const isEnergia = padreCorrente === 'energia'

  useEffect(() => {
    if (!open) return
    if (sottoprodotto) {
      reset({
        nome: sottoprodotto.nome ?? '',
        prodotto_padre: sottoprodotto.prodotto_padre ?? 'mobile',
        tipo_energia: sottoprodotto.tipo_energia ?? '',
        fatturato_azienda: sottoprodotto.fatturato_azienda ?? 0,
        fatturato_pdv: sottoprodotto.fatturato_pdv ?? 0,
        punti: sottoprodotto.punti ?? 0,
        stato: sottoprodotto.stato ?? 'attivo',
      })
    } else {
      reset({
        ...defaultValues,
        prodotto_padre: prodottoPadrePreset ?? 'mobile',
      })
    }
  }, [open, sottoprodotto, prodottoPadrePreset, reset])

  async function onSubmit(values) {
    try {
      // Se non è energia, forziamo tipo_energia a null nel DB
      const payload = {
        ...values,
        tipo_energia: values.prodotto_padre === 'energia' ? values.tipo_energia : null,
      }

      if (isEdit) {
        const { error } = await supabase
          .from('sottoprodotti')
          .update(payload)
          .eq('id', sottoprodotto.id)
        if (error) throw error
        toast.success('Sottoprodotto aggiornato.')
      } else {
        const { error } = await supabase.from('sottoprodotti').insert([payload])
        if (error) throw error
        toast.success('Sottoprodotto creato.')
      }
      onSaved?.()
      onClose?.()
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={isEdit ? 'Modifica sottoprodotto' : 'Nuovo sottoprodotto'}
      description={
        isEdit
          ? 'Gli importi dei contratti GIÀ gettonati non cambiano (§5.3).'
          : 'Compila i dati del nuovo sottoprodotto.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" form="sottoprodotto-form" loading={isSubmitting}>
            {isEdit ? 'Salva modifiche' : 'Crea sottoprodotto'}
          </Button>
        </>
      }
    >
      <form
        id="sottoprodotto-form"
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <Input
            label="Nome"
            placeholder="Es. TIM Young"
            required
            error={errors.nome?.message}
            {...register('nome')}
          />
        </div>

        <Select
          label="Prodotto padre"
          required
          error={errors.prodotto_padre?.message}
          {...register('prodotto_padre')}
        >
          <option value="mobile">Mobile</option>
          <option value="fisso">Fisso</option>
          <option value="energia">Energia</option>
        </Select>

        <Select
          label="Stato"
          error={errors.stato?.message}
          {...register('stato')}
        >
          <option value="attivo">Attivo</option>
          <option value="disattivato">Disattivato</option>
        </Select>

        {/* Campo tipo energia — visibile SOLO se padre = energia */}
        {isEnergia && (
          <div className="sm:col-span-2">
            <Select
              label="Tipo energia"
              required
              hint="Determina se il sottoprodotto è Luce o Gas. Necessario per separare i contratti."
              error={errors.tipo_energia?.message}
              {...register('tipo_energia')}
            >
              <option value="">— Seleziona —</option>
              <option value="luce">⚡ Luce</option>
              <option value="gas">🔥 Gas</option>
            </Select>
          </div>
        )}

        <Input
          label="Fatturato Azienda (€)"
          type="number"
          min={0}
          step={1}
          required
          hint="Quanto guadagna Hype (solo Admin lo vede)"
          error={errors.fatturato_azienda?.message}
          {...register('fatturato_azienda')}
        />

        <Input
          label="Fatturato PdV (€)"
          type="number"
          min={0}
          step={1}
          required
          hint="Quanto guadagna il Punto Vendita"
          error={errors.fatturato_pdv?.message}
          {...register('fatturato_pdv')}
        />

        <div className="sm:col-span-2">
          <Input
            label="Punti"
            type="number"
            min={0}
            step={1}
            required
            hint="Unità di performance normalizzata (uguale per tutti)"
            error={errors.punti?.message}
            {...register('punti')}
          />
        </div>
      </form>
    </Dialog>
  )
}
