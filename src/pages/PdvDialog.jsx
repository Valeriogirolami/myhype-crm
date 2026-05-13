/**
 * Dialog per creazione / modifica di un Punto Vendita (§2).
 *
 * Due tab:
 *  - Anagrafica: i campi base (nome, tipo, area, categoria, data apertura, stato)
 *  - Persone: assegnazione Venditori / TM / AS / DV (§2.4)
 *
 * Flusso creazione:
 *  1. Tab Persone è disabilitato finché il PdV non è stato salvato
 *  2. Dopo il primo salvataggio, il dialog RESTA APERTO in modalità edit
 *     e il tab Persone si sblocca automaticamente
 */
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Info, Users, Lock } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import PdvAssegnazioni from '@/components/PdvAssegnazioni'

const schema = z.object({
  nome:          z.string().min(1, 'Obbligatorio').max(100),
  tipo:          z.enum(['sinergia', 'galleria']),
  area:          z.coerce.number().int().min(1).max(4),
  categoria:     z.enum(['A', 'B', 'C', 'D']),
  data_apertura: z.string().min(1, 'Obbligatoria'),
  stato:         z.enum(['aperto', 'chiuso']),
})

const defaultValues = {
  nome: '',
  tipo: 'sinergia',
  area: 1,
  categoria: 'A',
  data_apertura: new Date().toISOString().slice(0, 10),
  stato: 'aperto',
}

export default function PdvDialog({ open, onClose, pdv, onSaved }) {
  // currentPdv può cambiare durante la vita del dialog:
  // - in create parte null, dopo il salvataggio diventa il PdV inserito
  // - in edit è quello passato per prop
  const [currentPdv, setCurrentPdv] = useState(pdv || null)
  const isEdit = Boolean(currentPdv?.id)

  const [tab, setTab] = useState('anagrafica')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ resolver: zodResolver(schema), defaultValues })

  // All'apertura sincronizzo stato locale con la prop e reset del form
  useEffect(() => {
    if (!open) return
    setCurrentPdv(pdv || null)
    setTab('anagrafica')
    reset(
      pdv
        ? {
            nome: pdv.nome ?? '',
            tipo: pdv.tipo ?? 'sinergia',
            area: pdv.area ?? 1,
            categoria: pdv.categoria ?? 'A',
            data_apertura: pdv.data_apertura ?? defaultValues.data_apertura,
            stato: pdv.stato ?? 'aperto',
          }
        : defaultValues,
    )
  }, [open, pdv, reset])

  async function onSubmit(values) {
    try {
      if (isEdit) {
        const { data, error } = await supabase
          .from('pdv')
          .update(values)
          .eq('id', currentPdv.id)
          .select()
          .single()
        if (error) throw error
        setCurrentPdv(data)
        reset(values, { keepValues: true })
        toast.success('Punto Vendita aggiornato.')
      } else {
        const { data, error } = await supabase
          .from('pdv')
          .insert([values])
          .select()
          .single()
        if (error) throw error
        // Passa in modalità edit col nuovo PdV e apri il tab Persone
        setCurrentPdv(data)
        reset(values)
        setTab('persone')
        toast.success('PdV creato. Ora puoi assegnare le persone.')
      }
      onSaved?.()
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Modifica Punto Vendita' : 'Nuovo Punto Vendita'}
      description={
        isEdit
          ? 'Modifica i dati anagrafici o gestisci le persone assegnate.'
          : 'Compila i dati del nuovo PdV. Le persone le assegnerai dopo il salvataggio.'
      }
      footer={
        tab === 'anagrafica' ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              {isEdit ? 'Chiudi' : 'Annulla'}
            </Button>
            <Button
              type="submit"
              form="pdv-form"
              loading={isSubmitting}
              disabled={isEdit && !isDirty}
            >
              {isEdit ? 'Salva modifiche' : 'Crea PdV'}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Fatto
          </Button>
        )
      }
    >
      {/* Tab switcher */}
      <div className="mb-5 flex items-center gap-1 rounded-xl border border-border bg-bg/50 p-1">
        <TabButton
          active={tab === 'anagrafica'}
          onClick={() => setTab('anagrafica')}
          icon={Info}
          label="Anagrafica"
        />
        <TabButton
          active={tab === 'persone'}
          onClick={() => isEdit && setTab('persone')}
          icon={isEdit ? Users : Lock}
          label="Persone"
          disabled={!isEdit}
          hint={!isEdit ? 'Salva prima il PdV' : null}
        />
      </div>

      {/* Tab content */}
      {tab === 'anagrafica' ? (
        <form
          id="pdv-form"
          onSubmit={handleSubmit(onSubmit)}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Input
              label="Nome"
              placeholder="Es. PdV Centro Roma"
              required
              error={errors.nome?.message}
              {...register('nome')}
            />
          </div>

          <Select label="Tipo" required error={errors.tipo?.message} {...register('tipo')}>
            <option value="sinergia">Sinergia</option>
            <option value="galleria">Galleria</option>
          </Select>

          <Select label="Area" required error={errors.area?.message} {...register('area')}>
            <option value={1}>Area 1</option>
            <option value={2}>Area 2</option>
            <option value={3}>Area 3</option>
            <option value={4}>Area 4</option>
          </Select>

          <Select label="Categoria" required error={errors.categoria?.message} {...register('categoria')}>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </Select>

          <Input
            label="Data apertura"
            type="date"
            required
            hint="Serve per il calcolo Gara Gallery primi 3 mesi"
            error={errors.data_apertura?.message}
            {...register('data_apertura')}
          />

          <div className="sm:col-span-2">
            <Select label="Stato" error={errors.stato?.message} {...register('stato')}>
              <option value="aperto">Aperto</option>
              <option value="chiuso">Chiuso</option>
            </Select>
          </div>
        </form>
      ) : (
        <PdvAssegnazioni pdvId={currentPdv?.id} />
      )}
    </Dialog>
  )
}

function TabButton({ active, onClick, icon: Icon, label, disabled, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition',
        active && !disabled && 'bg-surface text-white shadow-soft',
        !active && !disabled && 'text-text-muted hover:text-white',
        disabled && 'cursor-not-allowed text-text-muted/50',
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  )
}
