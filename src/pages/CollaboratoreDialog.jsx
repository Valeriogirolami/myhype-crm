/**
 * Dialog per creazione / modifica di un Collaboratore (§3.1).
 *
 * Campi raggruppati in 3 sezioni visuali:
 *  - Dati anagrafici: nome, cognome, CF, data nascita, indirizzo
 *  - Contatti: email, telefono
 *  - Dati lavorativi: ruolo, regime fiscale, P.IVA, IBAN, data assunzione, drive
 *
 * Le assegnazioni ai PdV non sono qui: si fanno dalla pagina PdV (Step 5d).
 *
 * Nota §3.3: la disattivazione di un VENDITORE deve generare alert al BO.
 * Per ora la registriamo solo. L'alert vero arriverà nello Step 14 (notifiche).
 */
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ExternalLink } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { notificaVenditoreDisattivato } from '@/lib/notifiche'
import { validaEmail, validaCodiceFiscale, validaPartitaIva, confermaInserimentoForzato } from '@/lib/validators'

// Validazione: solo nome/cognome/ruolo/stato sono obbligatori.
// Email e CF se presenti devono avere formato sensato.
const schema = z.object({
  nome:            z.string().min(1, 'Obbligatorio').max(80),
  cognome:         z.string().min(1, 'Obbligatorio').max(80),
  codice_fiscale:  z.string().max(16, 'Max 16 caratteri').optional().or(z.literal('')),
  data_nascita:    z.string().optional().or(z.literal('')),
  p_iva:           z.string().max(20).optional().or(z.literal('')),
  indirizzo:       z.string().max(200).optional().or(z.literal('')),
  telefono:        z.string().max(40).optional().or(z.literal('')),
  email:           z.string().email('Email non valida').optional().or(z.literal('')),
  iban:            z.string().max(34).optional().or(z.literal('')),
  data_assunzione: z.string().optional().or(z.literal('')),
  regime_fiscale:  z.enum(['ritenuta_acconto','cococo','p_iva','assunto']).optional().or(z.literal('')),
  ruolo:           z.string().min(1, 'Obbligatorio'),
  stato:           z.enum(['attivo', 'disattivato']),
  link_drive:      z.string().url('URL non valido').optional().or(z.literal('')),
})

const defaultValues = {
  nome: '',
  cognome: '',
  codice_fiscale: '',
  data_nascita: '',
  p_iva: '',
  indirizzo: '',
  telefono: '',
  email: '',
  iban: '',
  data_assunzione: '',
  regime_fiscale: '',
  ruolo: 'Venditore',
  stato: 'attivo',
  link_drive: '',
}

export default function CollaboratoreDialog({ open, onClose, collaboratore, onSaved }) {
  const isEdit = Boolean(collaboratore?.id)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues })

  const linkDrive = watch('link_drive')

  useEffect(() => {
    if (!open) return
    reset(
      collaboratore
        ? {
            nome:            collaboratore.nome ?? '',
            cognome:         collaboratore.cognome ?? '',
            codice_fiscale:  collaboratore.codice_fiscale ?? '',
            data_nascita:    collaboratore.data_nascita ?? '',
            p_iva:           collaboratore.p_iva ?? '',
            indirizzo:       collaboratore.indirizzo ?? '',
            telefono:        collaboratore.telefono ?? '',
            email:           collaboratore.email ?? '',
            iban:            collaboratore.iban ?? '',
            data_assunzione: collaboratore.data_assunzione ?? '',
            regime_fiscale:  collaboratore.regime_fiscale ?? '',
            ruolo:           collaboratore.ruolo ?? 'Venditore',
            stato:           collaboratore.stato ?? 'attivo',
            link_drive:      collaboratore.link_drive ?? '',
          }
        : defaultValues,
    )
  }, [open, collaboratore, reset])

  async function onSubmit(values) {
    // Validazioni soft (email / CF / P.IVA)
    const errors = {
      email: values.email ? validaEmail(values.email) : null,
      cf:    values.codice_fiscale ? validaCodiceFiscale(values.codice_fiscale) : null,
      piva:  values.p_iva ? validaPartitaIva(values.p_iva) : null,
    }
    const haErrori = Object.values(errors).some(v => v)
    if (haErrori) {
      const procedi = confermaInserimentoForzato(errors)
      if (!procedi) return
    }

    try {
      // Pulisco le stringhe vuote → null per coerenza col DB
      const payload = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v === '' ? null : v])
      )
      // Forziamo upper-case per CF (convenzione)
      if (payload.codice_fiscale) {
        payload.codice_fiscale = payload.codice_fiscale.toUpperCase()
      }

      if (isEdit) {
        const eraAttivo = collaboratore.stato === 'attivo'
        const { error } = await supabase
          .from('collaboratori')
          .update(payload)
          .eq('id', collaboratore.id)
        if (error) throw error
        toast.success('Collaboratore aggiornato.')

        // §3.3 / §13: se un VENDITORE viene disattivato → notifica ai BO
        // con CTA cambio password PdV
        const eDisattivazione = eraAttivo && payload.stato === 'disattivato'
        const èVenditore = (payload.ruolo || '').toLowerCase().includes('venditore')
        if (eDisattivazione && èVenditore) {
          await notificaVenditoreDisattivato({
            collaboratoreId: collaboratore.id,
            nomeVenditore: `${payload.nome || ''} ${payload.cognome || ''}`.trim(),
          })
        }
      } else {
        const { error } = await supabase.from('collaboratori').insert([payload])
        if (error) throw error
        toast.success('Collaboratore creato.')
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
      size="lg"
      title={isEdit ? 'Modifica collaboratore' : 'Nuovo collaboratore'}
      description={
        isEdit
          ? 'Aggiorna l\'anagrafica. Le assegnazioni ai PdV si gestiscono dalla pagina PdV.'
          : 'Solo Nome, Cognome e Ruolo sono obbligatori — gli altri campi puoi compilarli dopo.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" form="collab-form" loading={isSubmitting}>
            {isEdit ? 'Salva modifiche' : 'Crea collaboratore'}
          </Button>
        </>
      }
    >
      <form
        id="collab-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6"
      >
        {/* Sezione 1: anagrafica */}
        <Section title="Dati anagrafici">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Nome" required error={errors.nome?.message} {...register('nome')} />
            <Input label="Cognome" required error={errors.cognome?.message} {...register('cognome')} />
            <Input
              label="Codice Fiscale"
              placeholder="RSSMRA80A01H501Z"
              maxLength={16}
              hint="16 caratteri — convertito automaticamente in maiuscolo"
              error={errors.codice_fiscale?.message}
              {...register('codice_fiscale')}
            />
            <Input
              label="Data di nascita"
              type="date"
              error={errors.data_nascita?.message}
              {...register('data_nascita')}
            />
            <div className="sm:col-span-2">
              <Input
                label="Indirizzo"
                placeholder="Via, civico, città, CAP"
                error={errors.indirizzo?.message}
                {...register('indirizzo')}
              />
            </div>
          </div>
        </Section>

        {/* Sezione 2: contatti */}
        <Section title="Contatti">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Email"
              type="email"
              placeholder="nome@esempio.it"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Telefono"
              type="tel"
              placeholder="+39 333 1234567"
              error={errors.telefono?.message}
              {...register('telefono')}
            />
          </div>
        </Section>

        {/* Sezione 3: dati lavorativi */}
        <Section title="Dati lavorativi">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Ruolo"
              required
              error={errors.ruolo?.message}
              {...register('ruolo')}
            >
              <option value="Venditore">Venditore</option>
              <option value="Venditore Senior">Venditore Senior</option>
              <option value="Team Manager">Team Manager</option>
              <option value="Area Sales">Area Sales</option>
              <option value="Direttore Vendite">Direttore Vendite</option>
            </Select>

            <Select
              label="Regime fiscale"
              error={errors.regime_fiscale?.message}
              {...register('regime_fiscale')}
            >
              <option value="">— Non specificato —</option>
              <option value="ritenuta_acconto">Ritenuta d'acconto</option>
              <option value="cococo">Co.co.co.</option>
              <option value="p_iva">P.IVA</option>
              <option value="assunto">Assunto</option>
            </Select>

            <Input
              label="P.IVA"
              placeholder="11 cifre"
              maxLength={20}
              error={errors.p_iva?.message}
              {...register('p_iva')}
            />

            <Input
              label="IBAN"
              placeholder="IT60X0542811101000000123456"
              maxLength={34}
              error={errors.iban?.message}
              {...register('iban')}
            />

            <Input
              label="Data assunzione"
              type="date"
              error={errors.data_assunzione?.message}
              {...register('data_assunzione')}
            />

            <Select
              label="Stato"
              error={errors.stato?.message}
              {...register('stato')}
            >
              <option value="attivo">Attivo</option>
              <option value="disattivato">Disattivato</option>
            </Select>

            <div className="sm:col-span-2">
              <Input
                label="Link cartella Drive"
                type="url"
                placeholder="https://drive.google.com/..."
                error={errors.link_drive?.message}
                {...register('link_drive')}
              />
              {linkDrive && !errors.link_drive && (
                <a
                  href={linkDrive}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-accent-2 hover:underline"
                >
                  <ExternalLink size={12} />
                  Apri cartella in nuova scheda
                </a>
              )}
            </div>
          </div>
        </Section>
      </form>
    </Dialog>
  )
}

// Helper visuale per le sezioni del form
function Section({ title, children }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h3>
      <div className="rounded-xl border border-border bg-bg/30 p-4">{children}</div>
    </div>
  )
}
