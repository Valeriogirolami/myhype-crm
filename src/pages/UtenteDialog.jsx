/**
 * Dialog per creazione / modifica di un account utente MyHype.
 *
 * Modalità Crea:
 *  - Form completo (nome, cognome, email, password, ruolo, pdv se ruolo=pdv)
 *  - Chiama la Edge Function create-user
 *
 * Modalità Modifica:
 *  - Modifica nome, cognome, ruolo, stato direttamente in tabella utenti
 *  - Bottone "Reset password" che chiama Edge Function update-user-password
 *  - L'email NON è modificabile (richiede operazione admin separata)
 */
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, KeyRound, RefreshCw } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { createUser, updateUserPassword } from '@/lib/edgeFunctions'

const RUOLI = [
  { v: 'admin', l: 'Admin' },
  { v: 'bo',    l: 'Back Office' },
  { v: 'dv',    l: 'Direttore Vendite' },
  { v: 'as',    l: 'Area Sales' },
  { v: 'tm',    l: 'Team Manager' },
  { v: 'pdv',   l: 'Punto Vendita' },
]

/**
 * Quali ruoli può ASSEGNARE / GESTIRE chi sta facendo l'operazione.
 * Solo Admin può creare/promuovere altri Admin (regola §11).
 */
const RUOLI_GESTIBILI = {
  admin: ['admin', 'bo', 'dv', 'as', 'tm', 'pdv'],
  bo:    ['bo', 'dv', 'as', 'tm', 'pdv'],   // BO NON può creare Admin
}

// Schema CREA — include password e (opzionale) pdv_id
const schemaCrea = z.object({
  nome:     z.string().min(1, 'Obbligatorio').max(80),
  cognome:  z.string().min(1, 'Obbligatorio').max(80),
  email:    z.string().min(1, 'Obbligatorio').email('Email non valida'),
  password: z.string().min(8, 'Minimo 8 caratteri'),
  ruolo:    z.enum(['admin','bo','dv','as','tm','pdv']),
  pdv_id:   z.string().optional().or(z.literal('')),
}).refine(d => d.ruolo !== 'pdv' || !!d.pdv_id, {
  message: 'Per ruolo "Punto Vendita" devi selezionare il PdV',
  path: ['pdv_id'],
})

// Schema MODIFICA — niente password (gestita a parte)
const schemaModifica = z.object({
  nome:    z.string().min(1, 'Obbligatorio').max(80),
  cognome: z.string().min(1, 'Obbligatorio').max(80),
  ruolo:   z.enum(['admin','bo','dv','as','tm','pdv']),
  attivo:  z.boolean(),
})

export default function UtenteDialog({
  open, onClose, utente, onSaved,
  // Quando si crea un nuovo account a partire da un Collaboratore esistente:
  // pre-compila i campi e dopo create collega l'account (collaboratori.account_id)
  linkCollaboratore = null,
}) {
  const isEdit = Boolean(utente?.id)
  const { profile: chiamante } = useAuth()

  // Filtra le opzioni del select in base al ruolo del chiamante (§11):
  // Admin gestisce tutti i ruoli; BO può creare/gestire tutti TRANNE Admin
  const ruoliConsentiti = RUOLI_GESTIBILI[chiamante?.ruolo] || []
  const ruoliDisponibili = RUOLI.filter(r => ruoliConsentiti.includes(r.v))

  // BO non può modificare un utente che è ADMIN (anche se in teoria può
  // accedere alla pagina). Lo blocchiamo per coerenza.
  const bloccatoPerNoAdmin = isEdit && utente?.ruolo === 'admin' && chiamante?.ruolo !== 'admin'

  const [pdvList, setPdvList] = useState([])
  const [showPwd, setShowPwd] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [resetting, setResetting] = useState(false)

  const schema = isEdit ? schemaModifica : schemaCrea

  // Mappa ruolo collaboratore → ruolo account suggerito
  const ruoloSuggerito = (() => {
    if (!linkCollaboratore?.ruolo) return 'bo'
    const r = linkCollaboratore.ruolo.toLowerCase()
    if (r.includes('direttore')) return 'dv'
    if (r.includes('area'))      return 'as'
    if (r.includes('team'))      return 'tm'
    return 'bo'
  })()

  const defaultValues = isEdit
    ? {
        nome:    utente?.nome ?? '',
        cognome: utente?.cognome ?? '',
        ruolo:   utente?.ruolo ?? 'pdv',
        attivo:  utente?.attivo ?? true,
      }
    : {
        nome: linkCollaboratore?.nome ?? '',
        cognome: linkCollaboratore?.cognome ?? '',
        email: linkCollaboratore?.email ?? '',
        password: '',
        ruolo: linkCollaboratore ? ruoloSuggerito : 'bo',
        pdv_id: '',
      }

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues })

  const ruoloSelezionato = watch('ruolo')

  // Carico la lista PdV (per il select quando ruolo=pdv)
  useEffect(() => {
    if (!open) return
    setShowPwd(false)
    setResetMode(false)
    setNewPwd('')
    reset(defaultValues)
    if (!isEdit) {
      // Carico solo PdV aperti senza account già collegato (per la creazione)
      supabase
        .from('pdv')
        .select('id, nome, account_id, stato')
        .order('nome')
        .then(({ data }) => setPdvList(data || []))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, utente])

  // PdV selezionabili: aperti e senza account
  const pdvDisponibili = useMemo(
    () => pdvList.filter(p => p.stato === 'aperto' && !p.account_id),
    [pdvList]
  )

  async function onSubmit(values) {
    try {
      if (isEdit) {
        const { error } = await supabase
          .from('utenti')
          .update({
            nome:    values.nome,
            cognome: values.cognome,
            ruolo:   values.ruolo,
            attivo:  values.attivo,
          })
          .eq('id', utente.id)
        if (error) throw error
        toast.success('Utente aggiornato.')
      } else {
        const result = await createUser({
          email:    values.email,
          password: values.password,
          nome:     values.nome,
          cognome:  values.cognome,
          ruolo:    values.ruolo,
          pdv_id:   values.ruolo === 'pdv' ? values.pdv_id : undefined,
        })
        // Se è una creazione "linkata" a un Collaboratore esistente, lo aggancio
        const newUserId = result?.user?.id
        if (linkCollaboratore?.id && newUserId) {
          const { error: errLink } = await supabase
            .from('collaboratori')
            .update({ account_id: newUserId })
            .eq('id', linkCollaboratore.id)
          if (errLink) {
            toast.warning(`Utente creato ma associazione al collaboratore fallita: ${errLink.message}`)
          } else {
            toast.success(`Utente creato e associato a ${linkCollaboratore.nome} ${linkCollaboratore.cognome}.`)
          }
        } else {
          toast.success('Utente creato.')
        }
      }
      onSaved?.()
      onClose?.()
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    }
  }

  async function handleResetPassword() {
    if (newPwd.length < 8) {
      toast.error('La password deve avere almeno 8 caratteri.')
      return
    }
    setResetting(true)
    try {
      await updateUserPassword({ user_id: utente.id, new_password: newPwd })
      toast.success('Password aggiornata.')
      setResetMode(false)
      setNewPwd('')
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    } finally {
      setResetting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={
        isEdit ? 'Modifica utente' :
        linkCollaboratore ? `Crea account per ${linkCollaboratore.nome} ${linkCollaboratore.cognome}` :
        'Nuovo utente'
      }
      description={
        isEdit
          ? `Account: ${utente?.email}`
          : 'L\'utente potrà accedere immediatamente con le credenziali fornite.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {isEdit ? 'Chiudi' : 'Annulla'}
          </Button>
          {!bloccatoPerNoAdmin && (
            <Button type="submit" form="utente-form" loading={isSubmitting}>
              {isEdit ? 'Salva modifiche' : 'Crea utente'}
            </Button>
          )}
        </>
      }
    >
      <form
        id="utente-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        {bloccatoPerNoAdmin && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            Solo un Admin può modificare un altro account Admin.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Nome" required error={errors.nome?.message} {...register('nome')} disabled={bloccatoPerNoAdmin} />
          <Input label="Cognome" required error={errors.cognome?.message} {...register('cognome')} disabled={bloccatoPerNoAdmin} />
        </div>

        {!isEdit && (
          <Input
            label="Email"
            type="email"
            required
            placeholder="nome@hypesrl.eu"
            error={errors.email?.message}
            {...register('email')}
          />
        )}

        <Select label="Ruolo" required error={errors.ruolo?.message} disabled={bloccatoPerNoAdmin} {...register('ruolo')}>
          {ruoliDisponibili.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
        </Select>

        {/* In creazione: PdV obbligatorio se ruolo=pdv */}
        {!isEdit && ruoloSelezionato === 'pdv' && (
          <Select
            label="Punto Vendita associato"
            required
            error={errors.pdv_id?.message}
            hint="Solo PdV aperti senza account già collegato"
            {...register('pdv_id')}
          >
            <option value="">— Seleziona PdV —</option>
            {pdvDisponibili.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </Select>
        )}

        {/* In creazione: password */}
        {!isEdit && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-muted">
              Password <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Minimo 8 caratteri"
                {...register('password')}
                className={`w-full rounded-xl border bg-bg px-3 py-2 pr-10 text-sm text-white placeholder:text-text-muted/60 outline-none focus:border-accent ${
                  errors.password ? 'border-danger' : 'border-border'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-muted hover:bg-white/5 hover:text-white"
                title={showPwd ? 'Nascondi' : 'Mostra'}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
            )}
          </div>
        )}

        {/* In modifica: stato attivo (checkbox) + reset password */}
        {isEdit && (
          <>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm text-white">
              <input type="checkbox" {...register('attivo')} className="accent-accent" />
              Account attivo (può fare login)
            </label>

            <div className="rounded-xl border border-border bg-bg/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <KeyRound size={14} className="text-accent-2" />
                Reimposta password
              </div>
              {!resetMode ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => setResetMode(true)}
                >
                  <RefreshCw size={14} />
                  Imposta nuova password
                </Button>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Nuova password (min 8)"
                      value={newPwd}
                      onChange={e => setNewPwd(e.target.value)}
                      className="w-full rounded-xl border border-border bg-bg px-3 py-2 pr-10 text-sm text-white placeholder:text-text-muted/60 outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(s => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-muted hover:bg-white/5 hover:text-white"
                    >
                      {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => { setResetMode(false); setNewPwd('') }}
                    >
                      Annulla
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleResetPassword}
                      loading={resetting}
                    >
                      Conferma reset
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </form>
    </Dialog>
  )
}
