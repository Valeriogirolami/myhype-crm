/**
 * Dialog Nuovo Contratto — flusso multi-step (§4).
 *
 * Step 1 · Cliente
 *   - Privato / Azienda (§4.1)
 *   - Ricerca cliente esistente per CF (§4.3)
 *   - IBAN facoltativo (cambio rispetto alla v1 su richiesta Valerio 2026-04-24)
 *   - Campo "Telefono fisso" opzionale oltre al cellulare
 *
 * Step 2 · Prodotto + sottoprodotti
 *   - 1 prodotto padre + 1..5 sottoprodotti (§4.2, §5.4)
 *
 * Step 3 · Persona che ha venduto + note + conferma
 *   - Tendina popolata con TUTTE le persone legate al PdV (venditori, TM, AS, DV)
 *     per permettere di tracciare chi realmente ha chiuso il contratto
 *   - PdV auto-compilato per account PdV; admin/bo scelgono
 *
 * Dopo il salvataggio mostro una schermata di SUCCESSO con 2 azioni:
 *   - Chiudi
 *   - "+ Nuovo contratto stesso cliente" (riusa il cliente appena creato/scelto)
 */
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2, User, Users, Package, FileText, X } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { cn, formatEuro, formatInt } from '@/lib/utils'
import { PRODOTTI, calcolaTotali, nomeCliente } from '@/lib/contratti'
import { validaCampiCliente, confermaInserimentoForzato } from '@/lib/validators'

const STEPS = [
  { key: 'cliente',  label: 'Cliente',   icon: User },
  { key: 'prodotto', label: 'Prodotto',  icon: Package },
  { key: 'conferma', label: 'Conferma',  icon: CheckCircle2 },
]

// Etichette brevi del ruolo nel PdV — usate accanto al nome nella tendina
const ETICHETTA_RUOLO_PDV = {
  venditore: 'Venditore',
  tm:        'Team Manager',
  as:        'Area Sales',
  dv:        'Direttore Vendite',
}

export default function ContrattoNuovoDialog({ open, onClose, onCreated }) {
  const { profile } = useAuth()
  const isPdv = profile?.ruolo === 'pdv'
  const isAdminBo = ['admin','bo'].includes(profile?.ruolo)

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [justCreated, setJustCreated] = useState(null) // { contrattoId, clienteId, clienteData }

  // ===== Step 1: Cliente =====
  const [cliente, setCliente] = useState(emptyCliente())
  const [clienteEsistenteId, setClienteEsistenteId] = useState(null)
  const [duplicatiCF, setDuplicatiCF] = useState([])

  // ===== Step 2: Prodotto =====
  const [prodotto, setProdotto] = useState('')
  // Sotto-tipo per Energia (luce / gas) — obbligatorio se prodotto='energia'
  // Forza la separazione luce/gas in 2 contratti distinti (richiesta Valerio)
  const [tipoEnergia, setTipoEnergia] = useState('')
  const [sottoprodottiSel, setSottoprodottiSel] = useState([])
  const [sottoprodottiDisp, setSottoprodottiDisp] = useState([])
  const [loadingSp, setLoadingSp] = useState(false)

  // ===== Step 3: PdV + Persona + Note =====
  const [pdvSelId, setPdvSelId] = useState('')
  const [pdvDisponibili, setPdvDisponibili] = useState([])
  const [venditore, setVenditore] = useState('')
  const [personeDisp, setPersoneDisp] = useState([])
  const [note, setNote] = useState('')

  /**
   * Reset completo del form. Se `keepCliente` è true, mantiene cliente/CF
   * (per la funzione "nuovo contratto stesso cliente").
   */
  function resetForm({ keepCliente = false, clienteIdPreset = null, clienteDataPreset = null } = {}) {
    setStep(keepCliente ? 1 : 0)
    setJustCreated(null)
    if (!keepCliente) {
      setCliente(emptyCliente())
      setClienteEsistenteId(null)
    } else if (clienteIdPreset && clienteDataPreset) {
      setClienteEsistenteId(clienteIdPreset)
      setCliente(clienteDataPreset)
    }
    setDuplicatiCF([])
    setProdotto('')
    setTipoEnergia('')
    setSottoprodottiSel([])
    setSottoprodottiDisp([])
    setVenditore('')
    setNote('')
  }

  // Reset all'apertura
  useEffect(() => {
    if (!open) return
    resetForm()
    // Se è un account PdV: trovo il suo PdV associato
    if (isPdv) {
      supabase
        .from('pdv')
        .select('id, nome')
        .eq('account_id', profile.id)
        .eq('stato', 'aperto')
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setPdvSelId(data.id)
            setPdvDisponibili([data])
          }
        })
    } else if (isAdminBo) {
      supabase
        .from('pdv')
        .select('id, nome')
        .eq('stato', 'aperto')
        .order('nome')
        .then(({ data }) => setPdvDisponibili(data || []))
      setPdvSelId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Quando cambia PdV → carico TUTTE le persone legate al PdV
  // (venditori, TM, AS, DV) — qualsiasi di loro può chiudere una vendita
  useEffect(() => {
    if (!pdvSelId) { setPersoneDisp([]); setVenditore(''); return }
    supabase
      .from('pdv_collaboratori')
      .select('ruolo_nel_pdv, collaboratori(id, nome, cognome, ruolo, stato)')
      .eq('pdv_id', pdvSelId)
      .then(({ data }) => {
        const attivi = (data || [])
          .filter(r => r.collaboratori?.stato === 'attivo')
          .map(r => ({
            id: r.collaboratori.id,
            nome: r.collaboratori.nome,
            cognome: r.collaboratori.cognome,
            ruoloPdv: r.ruolo_nel_pdv,
            ruoloCollab: r.collaboratori.ruolo,
          }))
          // ordino: venditore > tm > as > dv, poi per cognome
          .sort((a, b) => {
            const ord = { venditore: 1, tm: 2, as: 3, dv: 4 }
            const d = (ord[a.ruoloPdv] || 9) - (ord[b.ruoloPdv] || 9)
            return d !== 0 ? d : (a.cognome || '').localeCompare(b.cognome || '')
          })
        setPersoneDisp(attivi)
      })
  }, [pdvSelId])

  // Quando cambia prodotto o tipoEnergia → carico i sottoprodotti disponibili
  // Per Energia filtra anche per tipo_energia (luce/gas) — niente mix possibile.
  useEffect(() => {
    if (!prodotto) { setSottoprodottiDisp([]); setSottoprodottiSel([]); return }
    // Per Energia aspetto che sia scelto il tipo
    if (prodotto === 'energia' && !tipoEnergia) {
      setSottoprodottiDisp([])
      setSottoprodottiSel([])
      return
    }
    setLoadingSp(true)
    let q = supabase
      .from('sottoprodotti')
      .select('*')
      .eq('prodotto_padre', prodotto)
      .eq('stato', 'attivo')
      .order('nome')
    if (prodotto === 'energia' && tipoEnergia) {
      q = q.eq('tipo_energia', tipoEnergia)
    }
    q.then(({ data }) => {
      setSottoprodottiDisp(data || [])
      setLoadingSp(false)
    })
    setSottoprodottiSel([])
  }, [prodotto, tipoEnergia])

  // Ricerca duplicati CF (§4.3) — debounced
  useEffect(() => {
    const cf = (cliente.codice_fiscale || '').trim().toUpperCase()
    if (cf.length < 8 || clienteEsistenteId) { setDuplicatiCF([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('clienti')
        .select('id, nome, cognome, ragione_sociale, categoria, codice_fiscale, email, telefono, telefono_fisso, iban, pod, pdr, codice_contratto')
        .ilike('codice_fiscale', cf)
      setDuplicatiCF(data || [])
    }, 400)
    return () => clearTimeout(t)
  }, [cliente.codice_fiscale, clienteEsistenteId])

  const totali = useMemo(() => calcolaTotali(sottoprodottiSel), [sottoprodottiSel])

  const sottoprodottiDisponibili = useMemo(() => {
    const selIds = new Set(sottoprodottiSel.map(s => s.id))
    return sottoprodottiDisp.filter(s => !selIds.has(s.id))
  }, [sottoprodottiDisp, sottoprodottiSel])

  // === Validazioni per step ===
  // NB: IBAN NON più obbligatorio (richiesta Valerio)
  function canNextStep0() {
    if (clienteEsistenteId) return true
    if (!cliente.categoria) return false
    // BLOCCO doppioni: se esistono clienti con lo stesso CF, non si può
    // proseguire senza prima cliccare "Usa questo" su uno di loro (§4.3).
    if (duplicatiCF.length > 0) return false
    if (cliente.categoria === 'privato') {
      return !!cliente.nome && !!cliente.cognome && !!cliente.codice_fiscale && !!cliente.email && !!cliente.telefono
    }
    return !!cliente.ragione_sociale && !!cliente.codice_fiscale && !!cliente.p_iva && !!cliente.email && !!cliente.telefono
  }
  function canNextStep1() {
    if (!prodotto) return false
    // Per Energia: tipo (luce/gas) obbligatorio
    if (prodotto === 'energia' && !tipoEnergia) return false
    return sottoprodottiSel.length >= 1 && sottoprodottiSel.length <= 5
  }
  function canSubmit() {
    return !!pdvSelId && !!venditore
  }

  function useEsistente(c) {
    setClienteEsistenteId(c.id)
    setCliente({
      categoria: c.categoria,
      nome: c.nome || '',
      cognome: c.cognome || '',
      ragione_sociale: c.ragione_sociale || '',
      codice_fiscale: c.codice_fiscale || '',
      p_iva: c.p_iva || '',
      email: c.email || '',
      telefono: c.telefono || '',
      telefono_fisso: c.telefono_fisso || '',
      iban: c.iban || '',
      pod: c.pod || '',
      pdr: c.pdr || '',
      codice_contratto: c.codice_contratto || '',
    })
    setDuplicatiCF([])
    toast.success(`Userai i dati del cliente esistente: ${nomeCliente(c)}`)
  }

  function scollegaEsistente() {
    setClienteEsistenteId(null)
  }

  async function handleSubmit() {
    if (!canSubmit()) {
      toast.error('Compila tutti i campi obbligatori.')
      return
    }

    // Validazione campi cliente (solo se cliente NUOVO, non esistente)
    if (!clienteEsistenteId) {
      const errors = validaCampiCliente({
        email: cliente.email,
        piva: cliente.categoria === 'azienda' ? cliente.p_iva : null,
        cf: cliente.codice_fiscale,
      })
      const haErrori = Object.values(errors).some(v => v)
      if (haErrori) {
        const procedi = confermaInserimentoForzato(errors)
        if (!procedi) return  // utente vuole correggere
      }
    }

    setSaving(true)
    try {
      // 1) Cliente: usa esistente oppure crea nuovo
      let cliente_id = clienteEsistenteId
      let clienteSalvato = cliente
      if (!cliente_id) {
        const payload = {
          categoria: cliente.categoria,
          nome: cliente.nome || '',
          cognome: cliente.cognome || '',
          ragione_sociale: cliente.categoria === 'azienda' ? cliente.ragione_sociale : null,
          codice_fiscale: cliente.codice_fiscale.toUpperCase(),
          p_iva: cliente.categoria === 'azienda' ? cliente.p_iva : null,
          email: cliente.email,
          telefono: cliente.telefono,
          telefono_fisso: cliente.telefono_fisso || null,
          iban: cliente.iban || null,
          pod: cliente.pod || null,
          pdr: cliente.pdr || null,
          codice_contratto: cliente.codice_contratto || null,
        }
        const { data: nuovo, error: errCli } = await supabase
          .from('clienti')
          .insert([payload])
          .select()
          .single()
        if (errCli) throw errCli
        cliente_id = nuovo.id
        clienteSalvato = {
          categoria: nuovo.categoria,
          nome: nuovo.nome || '',
          cognome: nuovo.cognome || '',
          ragione_sociale: nuovo.ragione_sociale || '',
          codice_fiscale: nuovo.codice_fiscale || '',
          p_iva: nuovo.p_iva || '',
          email: nuovo.email || '',
          telefono: nuovo.telefono || '',
          telefono_fisso: nuovo.telefono_fisso || '',
          iban: nuovo.iban || '',
          pod: nuovo.pod || '',
          pdr: nuovo.pdr || '',
          codice_contratto: nuovo.codice_contratto || '',
        }
      }

      // 2) Contratto
      const { data: contratto, error: errCtr } = await supabase
        .from('contratti')
        .insert([{
          cliente_id,
          pdv_id: pdvSelId,
          venditore_id: venditore || null,
          prodotto,
          stato: 'da_validare',
          note: note || null,
        }])
        .select()
        .single()
      if (errCtr) throw errCtr

      // 3) Sottoprodotti
      const righe = sottoprodottiSel.map(sp => ({
        contratto_id: contratto.id,
        sottoprodotto_id: sp.id,
      }))
      const { error: errSp } = await supabase
        .from('contratto_sottoprodotti')
        .insert(righe)
      if (errSp) throw errSp

      toast.success('Contratto inserito. Ora è in stato "Da validare".')
      setJustCreated({
        contrattoId: contratto.id,
        clienteId: cliente_id,
        clienteData: clienteSalvato,
      })
      onCreated?.()
    } catch (err) {
      // Errore CF già esistente (vincolo UNIQUE sul DB): messaggio chiaro
      if (err?.code === '23505' && /codice_fiscale/i.test(err?.message || '')) {
        toast.error('Questo Codice Fiscale è già presente. Torna allo step "Cliente" e usa il cliente esistente.')
      } else {
        toast.error(`Errore: ${err.message}`)
      }
    } finally {
      setSaving(false)
    }
  }

  function handleNuovoStessoCliente() {
    const { clienteId, clienteData } = justCreated || {}
    resetForm({ keepCliente: true, clienteIdPreset: clienteId, clienteDataPreset: clienteData })
  }

  // ====== SUCCESS VIEW (dopo la creazione) ======
  if (justCreated) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        size="md"
        title="Contratto creato"
        description="Il contratto è stato inserito correttamente ed è ora in stato 'Da validare'."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Fatto</Button>
            <Button onClick={handleNuovoStessoCliente}>
              <Plus size={14} /> Nuovo contratto stesso cliente
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 size={28} />
          </div>
          <div>
            <div className="text-lg font-medium text-white">
              {nomeCliente(justCreated.clienteData)}
            </div>
            <div className="text-sm text-text-muted">
              CF: <span className="tabular-nums">{justCreated.clienteData.codice_fiscale}</span>
            </div>
          </div>
          <p className="text-sm text-text-muted max-w-sm">
            Puoi chiudere questa finestra oppure inserire <strong>un altro contratto</strong>
            {' '}per lo stesso cliente (es. un prodotto Mobile + un Fisso).
            {' '}Ogni contratto conterà come distinto, come da regola §4.2.
          </p>
        </div>
      </Dialog>
    )
  }

  // ====== FORM VIEW (step 0/1/2) ======
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Nuovo contratto"
      description="Inserisci cliente, prodotto e chi ha venduto. Il contratto partirà in stato 'Da validare'."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annulla</Button>
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft size={14} /> Indietro
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 ? !canNextStep0() : !canNextStep1()}
            >
              Avanti <ChevronRight size={14} />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canSubmit()} loading={saving}>
              <CheckCircle2 size={14} /> Inserisci contratto
            </Button>
          )}
        </>
      }
    >
      {/* Stepper */}
      <div className="mb-5 flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const done = i < step
          const active = i === step
          return (
            <div key={s.key} className="flex flex-1 items-center gap-2">
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition',
                done    && 'bg-success text-bg',
                active  && 'bg-gradient-primary text-white',
                !done && !active && 'bg-bg border border-border text-text-muted',
              )}>
                {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
              </div>
              <div className={cn('text-sm font-medium', active ? 'text-white' : 'text-text-muted')}>
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('mx-2 h-px flex-1', done ? 'bg-success/40' : 'bg-border')} />
              )}
            </div>
          )
        })}
      </div>

      {step === 0 && (
        <StepCliente
          cliente={cliente}
          setCliente={setCliente}
          duplicati={duplicatiCF}
          clienteEsistenteId={clienteEsistenteId}
          onUseEsistente={useEsistente}
          onScollega={scollegaEsistente}
        />
      )}

      {step === 1 && (
        <StepProdotto
          prodotto={prodotto}
          setProdotto={setProdotto}
          tipoEnergia={tipoEnergia}
          setTipoEnergia={setTipoEnergia}
          sottoprodottiSel={sottoprodottiSel}
          setSottoprodottiSel={setSottoprodottiSel}
          sottoprodottiDisp={sottoprodottiDisponibili}
          loading={loadingSp}
          totali={totali}
        />
      )}

      {step === 2 && (
        <StepConferma
          isAdminBo={isAdminBo}
          cliente={cliente}
          clienteEsistente={!!clienteEsistenteId}
          prodotto={prodotto}
          sottoprodottiSel={sottoprodottiSel}
          totali={totali}
          pdvSelId={pdvSelId}
          setPdvSelId={setPdvSelId}
          pdvDisponibili={pdvDisponibili}
          venditore={venditore}
          setVenditore={setVenditore}
          personeDisp={personeDisp}
          note={note}
          setNote={setNote}
        />
      )}
    </Dialog>
  )
}

// ---------- STEP 1: Cliente ----------

function StepCliente({ cliente, setCliente, duplicati, clienteEsistenteId, onUseEsistente, onScollega }) {
  const set = (k, v) => setCliente(prev => ({ ...prev, [k]: v }))

  return (
    <div className="space-y-4">
      {clienteEsistenteId && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-white">
            <CheckCircle2 size={16} className="text-success" />
            Userai i dati di un <strong>cliente esistente</strong>.
          </div>
          <Button variant="ghost" size="sm" onClick={onScollega}>
            <X size={12} /> Cambia
          </Button>
        </div>
      )}

      {/* Privato / Azienda */}
      <div>
        <label className="mb-2 block text-xs font-medium text-text-muted">
          Tipologia cliente <span className="text-danger">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: 'privato', label: 'Privato',  icon: User },
            { v: 'azienda', label: 'Azienda', icon: Users },
          ].map(opt => {
            const Icon = opt.icon
            const active = cliente.categoria === opt.v
            return (
              <button
                key={opt.v}
                type="button"
                disabled={!!clienteEsistenteId}
                onClick={() => set('categoria', opt.v)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition',
                  active ? 'border-accent bg-accent/10 text-white' : 'border-border bg-bg text-text-muted hover:border-accent/40',
                  clienteEsistenteId && 'opacity-60 cursor-not-allowed',
                )}
              >
                <Icon size={16} /> {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {cliente.categoria && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cliente.categoria === 'privato' ? (
              <>
                <Input label="Nome" required value={cliente.nome} onChange={e => set('nome', e.target.value)} disabled={!!clienteEsistenteId} />
                <Input label="Cognome" required value={cliente.cognome} onChange={e => set('cognome', e.target.value)} disabled={!!clienteEsistenteId} />
              </>
            ) : (
              <div className="sm:col-span-2">
                <Input label="Ragione sociale" required value={cliente.ragione_sociale} onChange={e => set('ragione_sociale', e.target.value)} disabled={!!clienteEsistenteId} />
              </div>
            )}

            <Input
              label="Codice Fiscale"
              required
              maxLength={16}
              placeholder={cliente.categoria === 'azienda' ? 'CF azienda' : 'Es. RSSMRA80A01H501Z'}
              value={cliente.codice_fiscale}
              onChange={e => set('codice_fiscale', e.target.value.toUpperCase())}
              disabled={!!clienteEsistenteId}
            />

            {cliente.categoria === 'azienda' && (
              <Input label="P.IVA" required value={cliente.p_iva} onChange={e => set('p_iva', e.target.value)} disabled={!!clienteEsistenteId} />
            )}

            <Input label="Email" type="email" required value={cliente.email} onChange={e => set('email', e.target.value)} disabled={!!clienteEsistenteId} />
            <Input label="Telefono (cellulare)" type="tel" required value={cliente.telefono} onChange={e => set('telefono', e.target.value)} disabled={!!clienteEsistenteId} />
            <Input label="Telefono fisso" type="tel" hint="Opzionale" value={cliente.telefono_fisso} onChange={e => set('telefono_fisso', e.target.value)} disabled={!!clienteEsistenteId} />

            <Input label="IBAN" hint="Opzionale — puoi compilarlo in seguito" value={cliente.iban} onChange={e => set('iban', e.target.value)} disabled={!!clienteEsistenteId} />

            <Input label="POD (solo Energia)" hint="Opzionale" value={cliente.pod} onChange={e => set('pod', e.target.value)} disabled={!!clienteEsistenteId} />
            <Input label="PDR (solo Gas)"      hint="Opzionale" value={cliente.pdr} onChange={e => set('pdr', e.target.value)} disabled={!!clienteEsistenteId} />

            <Input label="Codice Contratto" hint="Opzionale — campo libero" value={cliente.codice_contratto} onChange={e => set('codice_contratto', e.target.value)} disabled={!!clienteEsistenteId} />
          </div>

          {!clienteEsistenteId && duplicati.length > 0 && (
            <div className="rounded-xl border border-danger/50 bg-danger/10 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-danger">
                <Search size={14} />
                Questo CF è già presente: devi usare uno dei clienti esistenti.
              </div>
              <ul className="space-y-1.5">
                {duplicati.map(c => (
                  <li key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2 text-sm">
                    <div>
                      <div className="text-white">{nomeCliente(c)}</div>
                      <div className="text-xs text-text-muted">{c.email} · {c.telefono}</div>
                    </div>
                    <Button size="sm" onClick={() => onUseEsistente(c)}>
                      Usa questo
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-text-muted">
                Per evitare doppioni nell'anagrafica, ogni cliente esiste una sola volta per Codice Fiscale.
                Se hai sbagliato CF, correggilo qui sopra.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------- STEP 2: Prodotto + Sottoprodotti ----------

function StepProdotto({ prodotto, setProdotto, tipoEnergia, setTipoEnergia, sottoprodottiSel, setSottoprodottiSel, sottoprodottiDisp, loading, totali }) {
  function aggiungi(sp) {
    if (sottoprodottiSel.length >= 5) {
      toast.error('Massimo 5 sottoprodotti per contratto.')
      return
    }
    setSottoprodottiSel(prev => [...prev, sp])
  }
  function rimuovi(spId) {
    setSottoprodottiSel(prev => prev.filter(s => s.id !== spId))
  }

  // Quando l'utente cambia prodotto, resetto il tipoEnergia
  function handleProdotto(key) {
    setProdotto(key)
    if (key !== 'energia') setTipoEnergia('')
  }

  // Step "scelta sottoprodotti" abilitato solo dopo:
  // - prodotto scelto E
  // - se Energia, anche tipo Luce/Gas scelto
  const sottoprodottiAttivi = !!prodotto && (prodotto !== 'energia' || !!tipoEnergia)

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-medium text-text-muted">
          Prodotto <span className="text-danger">*</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(PRODOTTI).map(([key, meta]) => {
            const active = prodotto === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleProdotto(key)}
                className={cn(
                  'rounded-xl border px-4 py-3 text-sm font-medium transition',
                  active ? 'border-accent bg-accent/10 text-white' : 'border-border bg-bg text-text-muted hover:border-accent/40',
                )}
              >
                {meta.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sub-toggle Luce/Gas — visibile SOLO per Energia */}
      {prodotto === 'energia' && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
          <label className="mb-2 block text-xs font-medium text-warning">
            Tipo fornitura <span className="text-danger">*</span>
          </label>
          <p className="mb-3 text-xs text-text-muted">
            Per Energia devi scegliere se è Luce o Gas. <strong>Luce e Gas vanno
            in 2 contratti separati</strong> (è un cliente con 2 forniture).
            Se vendi entrambi, completa questo poi inserisci il secondo da
            "+ Nuovo contratto stesso cliente".
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 'luce', label: '⚡ Luce' },
              { v: 'gas',  label: '🔥 Gas' },
            ].map(opt => {
              const active = tipoEnergia === opt.v
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setTipoEnergia(opt.v)}
                  className={cn(
                    'rounded-xl border px-4 py-2.5 text-sm font-medium transition',
                    active ? 'border-warning bg-warning/15 text-white' : 'border-border bg-bg text-text-muted hover:border-warning/40',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {sottoprodottiAttivi && (
        <>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-text-muted">
                Sottoprodotti selezionati ({sottoprodottiSel.length}/5)
              </label>
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span className="tnum">Punti: <strong className="text-white">{formatInt(totali.punti)}</strong></span>
                <span className="tnum">Fatt. PdV: <strong className="text-white">{formatEuro(totali.fatturato_pdv)}</strong></span>
              </div>
            </div>
            {sottoprodottiSel.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-muted">
                Nessun sottoprodotto scelto. Aggiungine almeno 1 dalla lista sotto.
              </div>
            ) : (
              <ul className="space-y-2">
                {sottoprodottiSel.map(sp => (
                  <li key={sp.id} className="flex items-center justify-between rounded-xl border border-border bg-bg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Package size={14} className="text-accent-2" />
                      <span className="font-medium text-white">{sp.nome}</span>
                      <span className="text-xs text-text-muted tabular-nums">
                        · {formatInt(sp.punti)} pt · PdV {formatEuro(sp.fatturato_pdv)}
                      </span>
                    </div>
                    <button type="button" onClick={() => rimuovi(sp.id)} className="rounded-lg p-1.5 text-text-muted hover:bg-white/5 hover:text-danger" title="Rimuovi">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-text-muted">
              Aggiungi sottoprodotto
            </label>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-text-muted">
                <Loader2 size={14} className="animate-spin" /> Caricamento…
              </div>
            ) : sottoprodottiDisp.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-muted">
                {sottoprodottiSel.length > 0 ? 'Tutti i sottoprodotti di questo prodotto sono già stati aggiunti.' : 'Nessun sottoprodotto attivo per questo prodotto — creali in pagina Prodotti.'}
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sottoprodottiDisp.map(sp => (
                  <li key={sp.id}>
                    <button
                      type="button"
                      onClick={() => aggiungi(sp)}
                      disabled={sottoprodottiSel.length >= 5}
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-bg px-3 py-2 text-left text-sm transition hover:border-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div>
                        <div className="font-medium text-white">{sp.nome}</div>
                        <div className="text-xs text-text-muted tabular-nums">
                          {formatInt(sp.punti)} pt · PdV {formatEuro(sp.fatturato_pdv)}
                        </div>
                      </div>
                      <Plus size={14} className="text-accent-2" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ---------- STEP 3: Conferma ----------

function StepConferma({
  isAdminBo, cliente, clienteEsistente, prodotto, sottoprodottiSel, totali,
  pdvSelId, setPdvSelId, pdvDisponibili, venditore, setVenditore, personeDisp, note, setNote,
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-bg/30 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-text-muted">
          <FileText size={12} /> Riepilogo
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-text-muted">Cliente {clienteEsistente && '(esistente)'}</div>
            <div className="text-white">
              {nomeCliente(cliente)}
              <span className="ml-2 text-xs text-text-muted">· {cliente.codice_fiscale?.toUpperCase()}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted">Prodotto</div>
            <div className="text-white"><Badge tone={PRODOTTI[prodotto]?.tone}>{PRODOTTI[prodotto]?.label}</Badge></div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-text-muted">Sottoprodotti</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sottoprodottiSel.map(sp => (
                <span key={sp.id} className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-white">
                  {sp.nome}
                </span>
              ))}
            </div>
          </div>
          <div className="tabular-nums text-white">Punti totali: <strong>{formatInt(totali.punti)}</strong></div>
          <div className="tabular-nums text-white">Fatturato PdV: <strong>{formatEuro(totali.fatturato_pdv)}</strong></div>
        </div>
      </div>

      {isAdminBo ? (
        <Select label="Punto Vendita" required value={pdvSelId} onChange={e => setPdvSelId(e.target.value)}>
          <option value="">— Seleziona PdV —</option>
          {pdvDisponibili.map(p => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </Select>
      ) : (
        <div className="rounded-xl border border-border bg-bg/30 px-3 py-2 text-sm">
          <span className="text-text-muted">PdV: </span>
          <span className="text-white font-medium">{pdvDisponibili[0]?.nome || '—'}</span>
        </div>
      )}

      {/* Persona che ha venduto — tutti i collaboratori legati al PdV */}
      <Select
        label="Venditore"
        required
        value={venditore}
        onChange={e => setVenditore(e.target.value)}
        hint={
          !pdvSelId
            ? 'Seleziona prima un PdV'
            : personeDisp.length === 0
              ? 'Nessuna persona assegnata al PdV — aggiungile nella pagina Punti Vendita → tab Persone'
              : 'Chiunque legato al PdV (Venditore, TM, AS, DV) può essere registrato come chi ha chiuso la vendita'
        }
        disabled={!pdvSelId || personeDisp.length === 0}
      >
        <option value="">— Seleziona chi ha venduto —</option>
        {personeDisp.map(p => (
          <option key={p.id} value={p.id}>
            {p.nome} {p.cognome} · {ETICHETTA_RUOLO_PDV[p.ruoloPdv] || p.ruoloCollab}
          </option>
        ))}
      </Select>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-text-muted">Note (opzionali)</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-white placeholder:text-text-muted/60 outline-none transition focus:border-accent"
          placeholder="Eventuali annotazioni per il BO (visibili sempre nel dettaglio contratto)…"
        />
      </div>
    </div>
  )
}

function emptyCliente() {
  return {
    categoria: '',
    nome: '',
    cognome: '',
    ragione_sociale: '',
    codice_fiscale: '',
    p_iva: '',
    email: '',
    telefono: '',
    telefono_fisso: '',
    iban: '',
    pod: '',
    pdr: '',
    codice_contratto: '',
  }
}
