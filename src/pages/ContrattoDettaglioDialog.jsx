/**
 * Dialog Dettaglio Contratto (§4) — Step 6b refactor v2.
 *
 * 2 modalità:
 *  1. Visualizzazione (default per tutti)
 *  2. Modifica (Admin/BO): pannello con 3 sezioni espandibili:
 *      • Stato, date, venditore, note
 *      • Cliente (anagrafica completa)
 *      • Prodotto + sottoprodotti
 *
 * Il PdV "nativo" del contratto NON cambia mai (§3.2).
 * Snapshot ricalcolato al passaggio in 'gettonato' o 'stornato' (§5.3).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2, FileText, Store, User, Package, Calendar, Notebook,
  Edit3, Save, X, ChevronRight, Plus, Trash2,
  CheckCircle2, XCircle, RotateCcw, Coins, AlertTriangle, RefreshCw,
} from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import MesePicker from '@/components/ui/MesePicker'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { notificaKoContratto, notificaTop3PerMese } from '@/lib/notifiche'
import { cn, formatDate, formatEuro, formatInt } from '@/lib/utils'
import { STATI, PRODOTTI, calcolaTotali, nomeCliente } from '@/lib/contratti'

const STATI_MODIFICABILI = [
  { v: 'da_validare',     l: 'Da validare' },
  { v: 'ko_non_validato', l: 'KO non validato' },
  { v: 'validato',        l: 'Validato' },
  { v: 'gettonato',       l: 'Gettonato' },
  { v: 'ko',              l: 'KO post-validazione' },
  { v: 'stornato',        l: 'Stornato' },
]

export default function ContrattoDettaglioDialog({ open, onClose, contrattoId, onUpdated }) {
  const { profile } = useAuth()
  const isAdmin = profile?.ruolo === 'admin'
  const isBoAdmin = ['admin', 'bo'].includes(profile?.ruolo)
  const isPdv = profile?.ruolo === 'pdv'

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm())

  // Azioni rapide (cambio stato veloce — bottoni colorati nel pannello "Azioni")
  const [quickAction, setQuickAction] = useState(null)            // 'valida' | 'ko_nv' | 'reinserisci' | 'gettona' | 'ko' | 'storna' | 'recupera'
  const [quickData, setQuickData] = useState({})
  const [quickLoading, setQuickLoading] = useState(false)

  // Stato delete contratto (+ eventuale cliente orfano)
  const [deleting, setDeleting] = useState(false)

  // Liste ausiliarie per i select in modalità edit
  const [personeDisp, setPersoneDisp] = useState([])      // per "venditore"
  const [sottoprodottiDisp, setSottoprodottiDisp] = useState([]) // per cambio prodotto

  // Sezioni espandibili nel pannello Modifica
  const [openSezione, setOpenSezione] = useState({ stato: true, cliente: false, prodotto: false })

  const fetchContratto = useCallback(async () => {
    if (!contrattoId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('contratti')
      .select(`
        *,
        cliente:clienti(*),
        pdv:pdv(id, nome, tipo, area, categoria, account_id),
        venditore:collaboratori(id, nome, cognome, ruolo),
        contratto_sottoprodotti(sottoprodotti(*))
      `)
      .eq('id', contrattoId)
      .single()
    if (error) console.error('[contratto] fetch errore:', error.message)
    setData(data)
    setLoading(false)
  }, [contrattoId])

  useEffect(() => {
    if (!open) return
    setEditing(false)
    setQuickAction(null)
    setQuickData({})
    fetchContratto()
  }, [open, fetchContratto])

  // Quando entro in editing precarico il form con TUTTI i dati
  useEffect(() => {
    if (!editing || !data) return
    const sps = (data.contratto_sottoprodotti || []).map(r => r.sottoprodotti).filter(Boolean)
    setForm({
      // stato/date
      stato: data.stato,
      motivo_ko_non_validato: data.motivo_ko_non_validato || '',
      motivo_ko: data.motivo_ko || '',
      note_ko: data.note_ko || '',
      note: data.note || '',
      note_bo: data.note_bo || '',
      mese_gettonamento: dateToYM(data.mese_gettonamento),
      mese_storno: dateToYM(data.mese_storno),
      venditore_id: data.venditore?.id || '',
      // cliente
      cliente: {
        id: data.cliente?.id,
        categoria: data.cliente?.categoria || 'privato',
        nome: data.cliente?.nome || '',
        cognome: data.cliente?.cognome || '',
        ragione_sociale: data.cliente?.ragione_sociale || '',
        codice_fiscale: data.cliente?.codice_fiscale || '',
        p_iva: data.cliente?.p_iva || '',
        email: data.cliente?.email || '',
        telefono: data.cliente?.telefono || '',
        telefono_fisso: data.cliente?.telefono_fisso || '',
        iban: data.cliente?.iban || '',
        pod: data.cliente?.pod || '',
        pdr: data.cliente?.pdr || '',
      },
      // prodotto + sottoprodotti
      prodotto: data.prodotto,
      tipo_energia: '', // dedotto dai sottoprodotti correnti se energia
      sottoprodotti_ids: sps.map(s => s.id),
    })

    // Per energia: deduco il tipo (luce/gas) dal primo sottoprodotto
    if (data.prodotto === 'energia' && sps.length > 0 && sps[0].tipo_energia) {
      setForm(prev => ({ ...prev, tipo_energia: sps[0].tipo_energia }))
    }

    // Carica venditori del PdV
    if (data.pdv?.id) {
      supabase
        .from('pdv_collaboratori')
        .select('ruolo_nel_pdv, collaboratori(id, nome, cognome, ruolo, stato)')
        .eq('pdv_id', data.pdv.id)
        .then(({ data: rows }) => {
          const attivi = (rows || [])
            .filter(r => r.collaboratori?.stato === 'attivo')
            .map(r => ({
              id: r.collaboratori.id,
              nome: r.collaboratori.nome,
              cognome: r.collaboratori.cognome,
              ruoloPdv: r.ruolo_nel_pdv,
            }))
          setPersoneDisp(attivi)
        })
    }
  }, [editing, data])

  // Quando cambia prodotto/tipoEnergia (in editing) → ricarico sottoprodotti disponibili
  useEffect(() => {
    if (!editing || !form.prodotto) { setSottoprodottiDisp([]); return }
    if (form.prodotto === 'energia' && !form.tipo_energia) {
      setSottoprodottiDisp([]); return
    }
    let q = supabase
      .from('sottoprodotti')
      .select('*')
      .eq('prodotto_padre', form.prodotto)
      .eq('stato', 'attivo')
      .order('nome')
    if (form.prodotto === 'energia' && form.tipo_energia) {
      q = q.eq('tipo_energia', form.tipo_energia)
    }
    q.then(({ data }) => setSottoprodottiDisp(data || []))
  }, [editing, form.prodotto, form.tipo_energia])

  const sottoprodotti = (data?.contratto_sottoprodotti || [])
    .map(r => r.sottoprodotti)
    .filter(Boolean)
  const totali = calcolaTotali(sottoprodotti)

  // Totali in tempo reale del form (in editing) per il riepilogo prodotto
  const totaliForm = useMemo(() => {
    const sel = sottoprodottiDisp.filter(s => form.sottoprodotti_ids?.includes(s.id))
    return calcolaTotali(sel)
  }, [sottoprodottiDisp, form.sottoprodotti_ids])

  const stato = data?.stato
  const statoMeta = stato && STATI[stato]
  const prodottoMeta = data?.prodotto && PRODOTTI[data.prodotto]

  function setF(k, v) { setForm(prev => ({ ...prev, [k]: v })) }
  function setCli(k, v) { setForm(prev => ({ ...prev, cliente: { ...prev.cliente, [k]: v } })) }

  // === AZIONI RAPIDE — cambio stato senza entrare in "Modifica" ===
  function openQuickAction(type, initial = {}) {
    setQuickAction(type)
    setQuickData(initial)
  }
  function cancelQuickAction() {
    setQuickAction(null)
    setQuickData({})
  }
  function setQ(k, v) { setQuickData(prev => ({ ...prev, [k]: v })) }

  async function eseguiAzioneRapida() {
    if (!data) return
    setQuickLoading(true)
    try {
      let updates = {}
      let messaggio = 'Aggiornato.'

      switch (quickAction) {
        case 'valida':
          updates = { stato: 'validato', motivo_ko_non_validato: null }
          messaggio = 'Contratto validato.'
          break
        case 'ko_nv':
          if (!quickData.motivo) throw new Error('Seleziona un motivo')
          updates = { stato: 'ko_non_validato', motivo_ko_non_validato: quickData.motivo }
          messaggio = 'Contratto in KO non validato.'
          break
        case 'reinserisci':
          updates = { stato: 'da_validare', motivo_ko_non_validato: null }
          messaggio = 'Contratto rimesso in coda di validazione.'
          break
        case 'gettona': {
          if (!quickData.mese) throw new Error('Indica il mese di competenza')
          updates = {
            stato: 'gettonato',
            mese_gettonamento: `${quickData.mese}-01`,
            fatturato_azienda_snap: totali.fatturato_azienda,
            fatturato_pdv_snap: totali.fatturato_pdv,
            punti_snap: totali.punti,
            motivo_ko: null,
            note_ko: null,
          }
          messaggio = 'Contratto gettonato.'
          break
        }
        case 'ko':
          if (!quickData.motivo) throw new Error('Seleziona un motivo')
          if (quickData.motivo === 'ko_altro' && !quickData.note?.trim()) {
            throw new Error('Per "KO altro motivo" le note sono obbligatorie')
          }
          updates = {
            stato: 'ko',
            motivo_ko: quickData.motivo,
            note_ko: quickData.note?.trim() || null,
          }
          messaggio = 'Contratto in KO.'
          break
        case 'storna': {
          if (!quickData.mese) throw new Error('Indica il mese di storno')
          const stornoIso = `${quickData.mese}-01`
          if (data.mese_gettonamento && stornoIso === data.mese_gettonamento) {
            throw new Error('Il mese di storno non può coincidere col gettonamento (§4.6)')
          }
          if (data.mese_gettonamento && stornoIso < data.mese_gettonamento) {
            throw new Error('Il mese di storno non può precedere il gettonamento (§4.6)')
          }
          updates = { stato: 'stornato', mese_storno: stornoIso }
          messaggio = 'Contratto stornato.'
          break
        }
        case 'recupera':
          if (!quickData.mese) throw new Error('Indica il mese di competenza')
          updates = {
            stato: 'gettonato',
            mese_gettonamento: `${quickData.mese}-01`,
            motivo_ko: null,
            note_ko: null,
            fatturato_azienda_snap: totali.fatturato_azienda,
            fatturato_pdv_snap: totali.fatturato_pdv,
            punti_snap: totali.punti,
          }
          messaggio = 'Contratto recuperato e gettonato.'
          break
        default: throw new Error('Azione sconosciuta')
      }

      const { error } = await supabase.from('contratti').update(updates).eq('id', data.id)
      if (error) throw error

      // Notifica al PdV + TM se il contratto è andato in KO (§13)
      if (quickAction === 'ko' || quickAction === 'ko_nv') {
        const clienteNome = data.cliente?.categoria === 'azienda'
          ? data.cliente?.ragione_sociale
          : `${data.cliente?.nome || ''} ${data.cliente?.cognome || ''}`.trim()
        await notificaKoContratto({
          contrattoId: data.id,
          pdvId: data.pdv?.id,
          tipoKo: updates.stato,
          motivo: updates.motivo_ko || updates.motivo_ko_non_validato,
          clienteNome,
        })
      }

      // Notifica Top 3 (§10.4 / §13) — se il contratto è (o resta) in stato produttivo,
      // ricalcolo le top 3 del mese e mando notifiche ai nuovi entranti
      const statiProduttivi = ['validato', 'gettonato', 'stornato']
      if (statiProduttivi.includes(updates.stato) && data.data_sottoscrizione) {
        const ym = data.data_sottoscrizione.slice(0, 7)
        notificaTop3PerMese(ym)  // fire-and-forget, non blocca il salvataggio
      }

      toast.success(messaggio)
      cancelQuickAction()
      await fetchContratto()
      onUpdated?.()
    } catch (err) {
      toast.error(`Errore: ${err.message}`)
    } finally {
      setQuickLoading(false)
    }
  }

  /**
   * Elimina completamente il contratto. Se il cliente associato non ha
   * altri contratti, viene eliminato anche lui (richiesta utente).
   * Solo Admin/BO.
   */
  async function eliminaContratto() {
    if (!data) return
    const clienteNome = data.cliente?.categoria === 'azienda'
      ? data.cliente?.ragione_sociale
      : `${data.cliente?.nome || ''} ${data.cliente?.cognome || ''}`.trim()
    const conferma = window.confirm(
      `Vuoi eliminare DEFINITIVAMENTE questo contratto?\n\n` +
      `Cliente: ${clienteNome}\n` +
      `Prodotto: ${data.prodotto}\n\n` +
      `⚠️ Se il cliente non ha altri contratti, verrà eliminato anche lui.\n` +
      `L'operazione è IRREVERSIBILE.`
    )
    if (!conferma) return

    setDeleting(true)
    try {
      const clienteId = data.cliente?.id
      const contrattoId = data.id

      // 1) Cancello il contratto (cascade su contratto_sottoprodotti)
      const { error: errCtr } = await supabase
        .from('contratti').delete().eq('id', contrattoId)
      if (errCtr) throw errCtr

      // 2) Controllo se il cliente ha altri contratti
      let clienteEliminato = false
      if (clienteId) {
        const { count } = await supabase
          .from('contratti')
          .select('*', { count: 'exact', head: true })
          .eq('cliente_id', clienteId)
        if (!count || count === 0) {
          // Nessun altro contratto → elimino anche il cliente
          const { error: errCli } = await supabase
            .from('clienti').delete().eq('id', clienteId)
          if (!errCli) clienteEliminato = true
          else console.warn('[delete] errore eliminazione cliente:', errCli.message)
        }
      }

      toast.success(
        clienteEliminato
          ? 'Contratto e cliente eliminati.'
          : 'Contratto eliminato.'
      )
      onUpdated?.()
      onClose?.()
    } catch (err) {
      toast.error(`Errore eliminazione: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  function toggleSottoprodotto(spId) {
    setForm(prev => {
      const set = new Set(prev.sottoprodotti_ids || [])
      if (set.has(spId)) set.delete(spId)
      else if (set.size < 5) set.add(spId)
      else { toast.error('Massimo 5 sottoprodotti.'); return prev }
      return { ...prev, sottoprodotti_ids: Array.from(set) }
    })
  }

  function cambiaProdotto(p) {
    setForm(prev => ({
      ...prev,
      prodotto: p,
      tipo_energia: p === 'energia' ? prev.tipo_energia : '',
      sottoprodotti_ids: [], // reset selezione
    }))
  }

  async function salvaModifiche() {
    if (!data) return

    try {
      setSaving(true)

      // === 1) Validazione + costruzione update CONTRATTO ===
      const nuovoStato = form.stato
      const updates = {
        stato: nuovoStato,
        note: form.note?.trim() || null,
        note_bo: form.note_bo?.trim() || null,
        venditore_id: form.venditore_id || null,
        prodotto: form.prodotto,
        motivo_ko_non_validato: null,
        motivo_ko: null,
        note_ko: null,
        mese_gettonamento: null,
        mese_storno: null,
        fatturato_azienda_snap: null,
        fatturato_pdv_snap: null,
        punti_snap: null,
      }

      if (nuovoStato === 'ko_non_validato') {
        if (!form.motivo_ko_non_validato) throw new Error('Seleziona il motivo del KO non validato')
        updates.motivo_ko_non_validato = form.motivo_ko_non_validato
      }

      if (nuovoStato === 'ko') {
        if (!form.motivo_ko) throw new Error('Seleziona il motivo del KO')
        if (form.motivo_ko === 'ko_altro' && !form.note_ko?.trim()) {
          throw new Error('Per "KO altro motivo" le note sono obbligatorie')
        }
        updates.motivo_ko = form.motivo_ko
        updates.note_ko = form.note_ko?.trim() || null
      }

      // Sottoprodotti scelti (necessari per snapshot)
      const spSelezionati = sottoprodottiDisp.filter(s => form.sottoprodotti_ids?.includes(s.id))
      if (spSelezionati.length === 0) throw new Error('Seleziona almeno un sottoprodotto')
      if (spSelezionati.length > 5) throw new Error('Massimo 5 sottoprodotti per contratto')

      const totaliCorrenti = calcolaTotali(spSelezionati)

      if (nuovoStato === 'gettonato') {
        if (!form.mese_gettonamento) throw new Error('Indica il mese di gettonamento')
        updates.mese_gettonamento = `${form.mese_gettonamento}-01`
        updates.fatturato_azienda_snap = totaliCorrenti.fatturato_azienda
        updates.fatturato_pdv_snap = totaliCorrenti.fatturato_pdv
        updates.punti_snap = totaliCorrenti.punti
      }

      if (nuovoStato === 'stornato') {
        if (!form.mese_storno) throw new Error('Indica il mese di storno')
        if (!form.mese_gettonamento) throw new Error('Per stornare serve anche il mese di gettonamento (§4.6)')
        const stornoIso = `${form.mese_storno}-01`
        const gettonaIso = `${form.mese_gettonamento}-01`
        if (stornoIso === gettonaIso) {
          throw new Error('Il mese di storno non può coincidere con quello di gettonamento (§4.6)')
        }
        if (stornoIso < gettonaIso) {
          throw new Error('Il mese di storno non può precedere quello di gettonamento (§4.6)')
        }
        updates.mese_gettonamento = gettonaIso
        updates.mese_storno = stornoIso
        updates.fatturato_azienda_snap = data.fatturato_azienda_snap ?? totaliCorrenti.fatturato_azienda
        updates.fatturato_pdv_snap = data.fatturato_pdv_snap ?? totaliCorrenti.fatturato_pdv
        updates.punti_snap = data.punti_snap ?? totaliCorrenti.punti
      }

      // === 2) UPDATE CLIENTE ===
      const cliPayload = {
        categoria: form.cliente.categoria,
        nome: form.cliente.nome.trim() || null,
        cognome: form.cliente.cognome.trim() || null,
        ragione_sociale: form.cliente.categoria === 'azienda' ? (form.cliente.ragione_sociale.trim() || null) : null,
        codice_fiscale: form.cliente.codice_fiscale.toUpperCase().trim() || null,
        p_iva: form.cliente.categoria === 'azienda' ? (form.cliente.p_iva.trim() || null) : null,
        email: form.cliente.email.trim() || null,
        telefono: form.cliente.telefono.trim() || null,
        telefono_fisso: form.cliente.telefono_fisso.trim() || null,
        iban: form.cliente.iban.trim() || null,
        pod: form.cliente.pod.trim() || null,
        pdr: form.cliente.pdr.trim() || null,
      }
      if (!cliPayload.codice_fiscale) throw new Error('Codice Fiscale del cliente obbligatorio')
      if (!cliPayload.email) throw new Error('Email cliente obbligatoria')
      if (!cliPayload.telefono) throw new Error('Telefono cliente obbligatorio')
      if (form.cliente.categoria === 'privato' && (!cliPayload.nome || !cliPayload.cognome)) {
        throw new Error('Nome e cognome obbligatori per cliente privato')
      }
      if (form.cliente.categoria === 'azienda' && !cliPayload.ragione_sociale) {
        throw new Error('Ragione sociale obbligatoria per cliente azienda')
      }

      const { error: errCli } = await supabase
        .from('clienti')
        .update(cliPayload)
        .eq('id', form.cliente.id)
      if (errCli) throw new Error(`Errore aggiornamento cliente: ${errCli.message}`)

      // === 3) UPDATE CONTRATTO ===
      const { error: errCtr } = await supabase
        .from('contratti')
        .update(updates)
        .eq('id', data.id)
      if (errCtr) throw errCtr

      // === 4) Sostituisci sottoprodotti se cambiati ===
      const spVecchi = (data.contratto_sottoprodotti || []).map(r => r.sottoprodotti?.id).filter(Boolean).sort()
      const spNuovi = [...form.sottoprodotti_ids].sort()
      const cambiati = spVecchi.length !== spNuovi.length || spVecchi.some((id, i) => id !== spNuovi[i])
      if (cambiati) {
        // Cancello le vecchie associazioni
        const { error: errDel } = await supabase
          .from('contratto_sottoprodotti')
          .delete()
          .eq('contratto_id', data.id)
        if (errDel) throw errDel
        // Inserisco le nuove
        const righe = form.sottoprodotti_ids.map(spId => ({
          contratto_id: data.id,
          sottoprodotto_id: spId,
        }))
        const { error: errIns } = await supabase
          .from('contratto_sottoprodotti')
          .insert(righe)
        if (errIns) throw errIns
      }

      // Notifica al PdV + TM se il nuovo stato è KO o KO non validato (§13)
      if ((nuovoStato === 'ko' || nuovoStato === 'ko_non_validato') &&
          data.stato !== nuovoStato) {
        const clienteNome = data.cliente?.categoria === 'azienda'
          ? data.cliente?.ragione_sociale
          : `${data.cliente?.nome || ''} ${data.cliente?.cognome || ''}`.trim()
        await notificaKoContratto({
          contrattoId: data.id,
          pdvId: data.pdv?.id,
          tipoKo: nuovoStato,
          motivo: updates.motivo_ko || updates.motivo_ko_non_validato,
          clienteNome,
        })
      }

      // Notifica Top 3 (§10.4) anche dopo modifica completa
      const statiProduttivi = ['validato', 'gettonato', 'stornato']
      if (statiProduttivi.includes(nuovoStato) && data.data_sottoscrizione) {
        const ym = data.data_sottoscrizione.slice(0, 7)
        notificaTop3PerMese(ym)
      }

      toast.success('Contratto aggiornato.')
      setEditing(false)
      await fetchContratto()
      onUpdated?.()
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
      title="Dettaglio contratto"
      description={data ? `Stato: ${statoMeta?.label || data.stato}` : ''}
      footer={
        editing ? (
          <>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              <X size={14} /> Annulla
            </Button>
            <Button onClick={salvaModifiche} loading={saving}>
              <Save size={14} /> Salva tutte le modifiche
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Chiudi</Button>
            {isBoAdmin && data && (
              <Button variant="danger" onClick={eliminaContratto} loading={deleting}>
                <Trash2 size={14} /> Elimina
              </Button>
            )}
            {isBoAdmin && data && (
              <Button onClick={() => setEditing(true)}>
                <Edit3 size={14} /> Modifica
              </Button>
            )}
          </>
        )
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-text-muted">
          <Loader2 size={16} className="animate-spin" /> Caricamento…
        </div>
      ) : !data ? (
        <p className="text-center text-text-muted py-10">Contratto non trovato.</p>
      ) : (
        <div className="space-y-5">
          {/* Header con stato + prodotto */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-2">
                <FileText size={18} />
              </div>
              <div>
                <div className="text-xs text-text-muted">Contratto</div>
                <div className="tabular-nums text-white">#{data.id.slice(0, 8)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {statoMeta && <Badge tone={statoMeta.tone}>{statoMeta.label}</Badge>}
              {prodottoMeta && <Badge tone={prodottoMeta.tone}>{prodottoMeta.label}</Badge>}
            </div>
          </div>

          {/* === MODALITÀ VISUALIZZAZIONE === */}
          {!editing && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoBlock icon={User} label="Cliente">
                  <div className="text-white">{nomeCliente(data.cliente)}</div>
                  <div className="text-xs text-text-muted tabular-nums">{data.cliente?.codice_fiscale}</div>
                  <div className="text-xs text-text-muted">{data.cliente?.email}</div>
                  <div className="text-xs text-text-muted">
                    📱 {data.cliente?.telefono || '—'}
                    {data.cliente?.telefono_fisso && (
                      <span className="ml-2">☎ {data.cliente.telefono_fisso}</span>
                    )}
                  </div>
                </InfoBlock>

                <InfoBlock icon={Store} label="Punto Vendita">
                  <div className="text-white">{data.pdv?.nome || '—'}</div>
                  <div className="text-xs text-text-muted">
                    {data.pdv?.tipo === 'sinergia' ? 'Sinergia' : 'Galleria'} · Area {data.pdv?.area} · Cat {data.pdv?.categoria}
                  </div>
                </InfoBlock>

                <InfoBlock icon={User} label="Venditore">
                  {data.venditore ? (
                    <>
                      <div className="text-white">{data.venditore.nome} {data.venditore.cognome}</div>
                      <div className="text-xs text-text-muted">{data.venditore.ruolo}</div>
                    </>
                  ) : (
                    <div className="text-text-muted">Non assegnato</div>
                  )}
                </InfoBlock>

                <InfoBlock icon={Calendar} label="Date">
                  <div className="text-xs text-text-muted">Sottoscrizione</div>
                  <div className="text-white">{formatDate(data.data_sottoscrizione)}</div>
                  {data.mese_gettonamento && (
                    <>
                      <div className="mt-1 text-xs text-text-muted">Competenza gettonamento</div>
                      <div className="text-white">{formatMeseAnno(data.mese_gettonamento)}</div>
                    </>
                  )}
                  {data.mese_storno && (
                    <>
                      <div className="mt-1 text-xs text-text-muted">Competenza storno</div>
                      <div className="text-white">{formatMeseAnno(data.mese_storno)}</div>
                    </>
                  )}
                </InfoBlock>
              </div>

              {/* Sottoprodotti */}
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="flex items-center gap-2 border-b border-border bg-bg/30 px-4 py-2 text-xs uppercase tracking-wider text-text-muted">
                  <Package size={12} /> Sottoprodotti ({sottoprodotti.length})
                  {(data.stato === 'gettonato' || data.stato === 'stornato') && (
                    <Badge tone="success" className="ml-auto text-[10px]">Importi congelati</Badge>
                  )}
                </div>
                {sottoprodotti.length === 0 ? (
                  <div className="p-4 text-sm text-text-muted">Nessun sottoprodotto.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                        <th className="px-4 py-2 font-medium">Nome</th>
                        <th className="px-4 py-2 font-medium">Punti</th>
                        {isAdmin && <th className="px-4 py-2 font-medium">Fatt. Azienda</th>}
                        <th className="px-4 py-2 font-medium">Fatt. PdV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sottoprodotti.map(sp => (
                        <tr key={sp.id} className="border-t border-border">
                          <td className="px-4 py-2 text-white">{sp.nome}</td>
                          <td className="px-4 py-2 text-white tabular-nums">{formatInt(sp.punti)}</td>
                          {isAdmin && <td className="px-4 py-2 text-white tabular-nums">{formatEuro(sp.fatturato_azienda)}</td>}
                          <td className="px-4 py-2 text-white tabular-nums">{formatEuro(sp.fatturato_pdv)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-bg/40 text-sm font-medium">
                        <td className="px-4 py-2 text-text-muted">
                          {data.stato === 'gettonato' || data.stato === 'stornato'
                            ? 'Snapshot al gettonamento' : 'Totale (in tempo reale)'}
                        </td>
                        {(data.stato === 'gettonato' || data.stato === 'stornato') ? (
                          <>
                            <td className="px-4 py-2 text-white tabular-nums">{formatInt(data.punti_snap ?? totali.punti)}</td>
                            {isAdmin && <td className="px-4 py-2 text-white tabular-nums">{formatEuro(data.fatturato_azienda_snap ?? totali.fatturato_azienda)}</td>}
                            <td className="px-4 py-2 text-white tabular-nums">{formatEuro(data.fatturato_pdv_snap ?? totali.fatturato_pdv)}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2 text-white tabular-nums">{formatInt(totali.punti)}</td>
                            {isAdmin && <td className="px-4 py-2 text-white tabular-nums">{formatEuro(totali.fatturato_azienda)}</td>}
                            <td className="px-4 py-2 text-white tabular-nums">{formatEuro(totali.fatturato_pdv)}</td>
                          </>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* Motivi KO */}
              {(data.motivo_ko_non_validato || data.motivo_ko || data.note_ko) && (
                <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
                  {data.motivo_ko_non_validato && (
                    <div><span className="text-danger">Motivo KO non validato:</span> {labelMotivoKoNonVal(data.motivo_ko_non_validato)}</div>
                  )}
                  {data.motivo_ko && (
                    <div><span className="text-danger">Motivo KO:</span> {labelMotivoKo(data.motivo_ko)}</div>
                  )}
                  {data.note_ko && (
                    <div className="mt-1 text-text-muted">Note: {data.note_ko}</div>
                  )}
                </div>
              )}

              {/* Note generali */}
              {data.note && (
                <InfoBlock icon={Notebook} label="Note">
                  <p className="whitespace-pre-wrap text-sm text-white">{data.note}</p>
                </InfoBlock>
              )}

              {/* Note Back office (lettura: tutti — scrittura: solo Admin/BO) */}
              {data.note_bo && (
                <InfoBlock icon={Notebook} label="Note Back office">
                  <p className="whitespace-pre-wrap text-sm text-white">{data.note_bo}</p>
                </InfoBlock>
              )}

              {/* === AZIONI RAPIDE ===
                   - Admin/BO: tutti i bottoni in base allo stato
                   - PdV proprietario: SOLO "Reinserisci" se contratto in KO non validato (§4.7) */}
              {!quickAction && (() => {
                const isPdvProprietario = isPdv && data?.pdv?.account_id === profile?.id
                if (isBoAdmin) {
                  return <AzioniRapide stato={data.stato} onAction={openQuickAction} ruolo="admin_bo" />
                }
                if (isPdvProprietario && data.stato === 'ko_non_validato') {
                  return <AzioniRapide stato={data.stato} onAction={openQuickAction} ruolo="pdv" />
                }
                return null
              })()}
              {quickAction && (
                <PannelloAzioneRapida
                  action={quickAction}
                  data={quickData}
                  set={setQ}
                  loading={quickLoading}
                  onConferma={eseguiAzioneRapida}
                  onAnnulla={cancelQuickAction}
                  meseGettonamentoCorrente={data.mese_gettonamento}
                />
              )}
            </>
          )}

          {/* === MODALITÀ MODIFICA (admin/bo) === */}
          {editing && isBoAdmin && (
            <div className="space-y-3">
              {/* Sezione 1: Stato + venditore + note */}
              <SezioneEdit
                title="Stato, date, venditore"
                aperta={openSezione.stato}
                onToggle={() => setOpenSezione(s => ({ ...s, stato: !s.stato }))}
              >
                <Select label="Stato" required value={form.stato} onChange={e => setF('stato', e.target.value)}>
                  {STATI_MODIFICABILI.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </Select>

                {form.stato === 'ko_non_validato' && (
                  <Select label="Motivo KO non validato" required
                    value={form.motivo_ko_non_validato}
                    onChange={e => setF('motivo_ko_non_validato', e.target.value)}>
                    <option value="">— Seleziona —</option>
                    <option value="non_trovato">Non trovato</option>
                    <option value="documenti_non_validi">Documenti non validi</option>
                    <option value="manca_firma">Manca firma</option>
                    <option value="manca_modulo_avvenuto_contatto">Manca modulo avvenuto contatto</option>
                  </Select>
                )}

                {form.stato === 'ko' && (
                  <>
                    <Select label="Motivo KO" required
                      value={form.motivo_ko} onChange={e => setF('motivo_ko', e.target.value)}>
                      <option value="">— Seleziona —</option>
                      <option value="rifiuto_cliente">Rifiuto cliente</option>
                      <option value="ko_tecnico">KO tecnico</option>
                      <option value="ko_credito">KO credito</option>
                      <option value="ko_altro">KO altro motivo</option>
                    </Select>
                    {form.motivo_ko === 'ko_altro' && (
                      <Textarea label="Note KO" required value={form.note_ko}
                        onChange={v => setF('note_ko', v)} />
                    )}
                  </>
                )}

                {form.stato === 'gettonato' && (
                  <MesePicker label="Mese di gettonamento" required
                    value={form.mese_gettonamento} onChange={v => setF('mese_gettonamento', v)}
                    hint="Punti e fatturato vengono congelati a questo momento" />
                )}

                {form.stato === 'stornato' && (
                  <>
                    <MesePicker label="Mese di gettonamento (originale)" required
                      value={form.mese_gettonamento} onChange={v => setF('mese_gettonamento', v)} />
                    <MesePicker label="Mese di storno" required
                      value={form.mese_storno} onChange={v => setF('mese_storno', v)}
                      hint="Deve essere ≥ mese gettonamento ma diverso (§4.6)" />
                  </>
                )}

                <Select label="Venditore" value={form.venditore_id}
                  onChange={e => setF('venditore_id', e.target.value)}
                  hint="Chi ha chiuso la vendita (qualsiasi persona del PdV)">
                  <option value="">— Nessuno —</option>
                  {personeDisp.map(p => (
                    <option key={p.id} value={p.id}>{p.nome} {p.cognome} · {labelRuoloPdv(p.ruoloPdv)}</option>
                  ))}
                </Select>

                <Textarea label="Note (generali)" value={form.note} onChange={v => setF('note', v)} />

                <Textarea
                  label="Note Back office"
                  hint="Visibile a tutti, modificabile solo da Admin/BO"
                  value={form.note_bo}
                  onChange={v => setF('note_bo', v)}
                />
              </SezioneEdit>

              {/* Sezione 2: Cliente */}
              <SezioneEdit
                title="Anagrafica cliente"
                aperta={openSezione.cliente}
                onToggle={() => setOpenSezione(s => ({ ...s, cliente: !s.cliente }))}
              >
                <Select label="Tipologia" required value={form.cliente.categoria}
                  onChange={e => setCli('categoria', e.target.value)}>
                  <option value="privato">Privato</option>
                  <option value="azienda">Azienda</option>
                </Select>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {form.cliente.categoria === 'privato' ? (
                    <>
                      <Input label="Nome" required value={form.cliente.nome} onChange={e => setCli('nome', e.target.value)} />
                      <Input label="Cognome" required value={form.cliente.cognome} onChange={e => setCli('cognome', e.target.value)} />
                    </>
                  ) : (
                    <div className="sm:col-span-2">
                      <Input label="Ragione sociale" required value={form.cliente.ragione_sociale} onChange={e => setCli('ragione_sociale', e.target.value)} />
                    </div>
                  )}

                  <Input label="Codice Fiscale" required maxLength={16}
                    value={form.cliente.codice_fiscale}
                    onChange={e => setCli('codice_fiscale', e.target.value.toUpperCase())} />
                  {form.cliente.categoria === 'azienda' && (
                    <Input label="P.IVA" required value={form.cliente.p_iva} onChange={e => setCli('p_iva', e.target.value)} />
                  )}
                  <Input label="Email" type="email" required value={form.cliente.email} onChange={e => setCli('email', e.target.value)} />
                  <Input label="Telefono (cellulare)" type="tel" required value={form.cliente.telefono} onChange={e => setCli('telefono', e.target.value)} />
                  <Input label="Telefono fisso" type="tel" hint="Opzionale"
                    value={form.cliente.telefono_fisso} onChange={e => setCli('telefono_fisso', e.target.value)} />
                  <Input label="IBAN" hint="Opzionale" value={form.cliente.iban} onChange={e => setCli('iban', e.target.value)} />
                  <Input label="POD (Energia)" hint="Opzionale" value={form.cliente.pod} onChange={e => setCli('pod', e.target.value)} />
                  <Input label="PDR (Gas)" hint="Opzionale" value={form.cliente.pdr} onChange={e => setCli('pdr', e.target.value)} />
                </div>
              </SezioneEdit>

              {/* Sezione 3: Prodotto + sottoprodotti */}
              <SezioneEdit
                title="Prodotto e sottoprodotti"
                aperta={openSezione.prodotto}
                onToggle={() => setOpenSezione(s => ({ ...s, prodotto: !s.prodotto }))}
              >
                <div>
                  <label className="mb-2 block text-xs font-medium text-text-muted">
                    Prodotto <span className="text-danger">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(PRODOTTI).map(([k, m]) => {
                      const active = form.prodotto === k
                      return (
                        <button key={k} type="button" onClick={() => cambiaProdotto(k)}
                          className={cn(
                            'rounded-xl border px-4 py-2.5 text-sm font-medium transition',
                            active ? 'border-accent bg-accent/10 text-white' : 'border-border bg-bg text-text-muted hover:border-accent/40',
                          )}>{m.label}</button>
                      )
                    })}
                  </div>
                </div>

                {form.prodotto === 'energia' && (
                  <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                    <label className="mb-2 block text-xs font-medium text-warning">
                      Tipo fornitura <span className="text-danger">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: 'luce', l: '⚡ Luce' },
                        { v: 'gas', l: '🔥 Gas' },
                      ].map(opt => {
                        const active = form.tipo_energia === opt.v
                        return (
                          <button key={opt.v} type="button"
                            onClick={() => setForm(p => ({ ...p, tipo_energia: opt.v, sottoprodotti_ids: [] }))}
                            className={cn(
                              'rounded-xl border px-4 py-2 text-sm font-medium transition',
                              active ? 'border-warning bg-warning/15 text-white' : 'border-border bg-bg text-text-muted hover:border-warning/40',
                            )}>{opt.l}</button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Lista sottoprodotti disponibili */}
                {(form.prodotto !== 'energia' || form.tipo_energia) && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-medium text-text-muted">
                        Sottoprodotti ({form.sottoprodotti_ids?.length || 0}/5)
                      </label>
                      <div className="text-xs text-text-muted">
                        Punti: <strong className="text-white tabular-nums">{formatInt(totaliForm.punti)}</strong>
                        {' · '}
                        Fatt. PdV: <strong className="text-white tabular-nums">{formatEuro(totaliForm.fatturato_pdv)}</strong>
                      </div>
                    </div>
                    {sottoprodottiDisp.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-text-muted">
                        Nessun sottoprodotto attivo per questo {form.prodotto === 'energia' ? form.tipo_energia : form.prodotto}.
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {sottoprodottiDisp.map(sp => {
                          const sel = form.sottoprodotti_ids?.includes(sp.id)
                          return (
                            <li key={sp.id}>
                              <button
                                type="button"
                                onClick={() => toggleSottoprodotto(sp.id)}
                                className={cn(
                                  'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition',
                                  sel ? 'border-accent bg-accent/10 text-white' : 'border-border bg-bg text-text-muted hover:border-accent/40',
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <input type="checkbox" checked={sel} onChange={() => {}} className="accent-accent pointer-events-none" />
                                  <span className={sel ? 'text-white font-medium' : ''}>{sp.nome}</span>
                                </div>
                                <span className="text-xs tabular-nums">
                                  {formatInt(sp.punti)} pt · PdV {formatEuro(sp.fatturato_pdv)}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </SezioneEdit>

              <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-text-muted">
                ℹ️ Salvando le modifiche aggiorni anagrafica cliente, prodotto/sottoprodotti, stato e note in un'unica transazione.
                Se il nuovo stato è <strong>Gettonato</strong> o <strong>Stornato</strong>, lo snapshot punti/fatturato viene ricalcolato dai sottoprodotti correnti.
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

// === sub-componenti ===

// === AZIONI RAPIDE — bottoni colorati contestuali allo stato ===
// `ruolo` può essere 'admin_bo' (tutto) oppure 'pdv' (solo reinserisci)
function AzioniRapide({ stato, onAction, ruolo = 'admin_bo' }) {
  const azioni = []

  // Se l'utente è PdV proprietario: solo Reinserisci da KO non validato (§4.7)
  if (ruolo === 'pdv') {
    if (stato === 'ko_non_validato') {
      azioni.push(
        <Button key="reinserisci" onClick={() => onAction('reinserisci')}>
          <RotateCcw size={14} /> Reinserisci
        </Button>,
      )
    }
    if (azioni.length === 0) return null
    return (
      <div className="rounded-xl border border-border bg-bg/30 p-3">
        <div className="mb-2 text-xs uppercase tracking-wider text-text-muted">Azioni</div>
        <div className="flex flex-wrap gap-2">{azioni}</div>
      </div>
    )
  }

  // Admin/BO: bottoni completi
  if (stato === 'da_validare') {
    azioni.push(
      <Button key="valida" variant="success" onClick={() => onAction('valida')}>
        <CheckCircle2 size={14} /> Valida
      </Button>,
      <Button key="ko_nv" variant="danger" onClick={() => onAction('ko_nv', { motivo: '' })}>
        <XCircle size={14} /> KO non validato
      </Button>,
    )
  }
  if (stato === 'ko_non_validato') {
    azioni.push(
      <Button key="reinserisci" onClick={() => onAction('reinserisci')}>
        <RotateCcw size={14} /> Reinserisci
      </Button>,
    )
  }
  if (stato === 'validato') {
    azioni.push(
      <Button key="gettona" onClick={() => onAction('gettona', { mese: defaultYM() })}>
        <Coins size={14} /> Gettona
      </Button>,
      <Button key="ko" variant="danger" onClick={() => onAction('ko', { motivo: '', note: '' })}>
        <XCircle size={14} /> KO post-validazione
      </Button>,
    )
  }
  if (stato === 'gettonato') {
    azioni.push(
      <Button key="storna" variant="danger" onClick={() => onAction('storna', { mese: defaultYM() })}>
        <AlertTriangle size={14} /> Storna
      </Button>,
    )
  }
  if (stato === 'ko') {
    azioni.push(
      <Button key="recupera" variant="success" onClick={() => onAction('recupera', { mese: defaultYM() })}>
        <RefreshCw size={14} /> Recupera (riporta a Gettonato)
      </Button>,
    )
  }
  if (azioni.length === 0) return null
  return (
    <div className="rounded-xl border border-border bg-bg/30 p-3">
      <div className="mb-2 text-xs uppercase tracking-wider text-text-muted">Azioni rapide</div>
      <div className="flex flex-wrap gap-2">{azioni}</div>
    </div>
  )
}

// === Pannello inline per azione rapida (chiede mese o motivo) ===
function PannelloAzioneRapida({ action, data: d, set, loading, onConferma, onAnnulla, meseGettonamentoCorrente }) {
  const cfg = {
    valida:      { title: 'Conferma validazione', tone: 'success' },
    reinserisci: { title: 'Rimetti in coda di validazione', tone: 'accent' },
    ko_nv:       { title: 'KO non validato', tone: 'danger' },
    gettona:     { title: 'Gettona contratto', tone: 'accent' },
    ko:          { title: 'KO post-validazione', tone: 'danger' },
    storna:      { title: 'Storna contratto', tone: 'warning' },
    recupera:    { title: 'Recupera contratto da KO', tone: 'success' },
  }[action]

  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-3',
      cfg.tone === 'success' ? 'border-success/40 bg-success/5' :
      cfg.tone === 'danger'  ? 'border-danger/40 bg-danger/5' :
      cfg.tone === 'warning' ? 'border-warning/40 bg-warning/5' :
                                'border-accent/40 bg-accent/5'
    )}>
      <div className="text-sm font-medium text-white">{cfg.title}</div>

      {action === 'ko_nv' && (
        <Select label="Motivo" required value={d.motivo || ''} onChange={e => set('motivo', e.target.value)}>
          <option value="">— Seleziona —</option>
          <option value="non_trovato">Non trovato</option>
          <option value="documenti_non_validi">Documenti non validi</option>
          <option value="manca_firma">Manca firma</option>
        </Select>
      )}

      {action === 'ko' && (
        <>
          <Select label="Motivo" required value={d.motivo || ''} onChange={e => set('motivo', e.target.value)}>
            <option value="">— Seleziona —</option>
            <option value="rifiuto_cliente">Rifiuto cliente</option>
            <option value="ko_tecnico">KO tecnico</option>
            <option value="ko_credito">KO credito</option>
            <option value="ko_altro">KO altro motivo</option>
          </Select>
          {d.motivo === 'ko_altro' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-muted">
                Note <span className="text-danger">*</span>
              </label>
              <textarea
                value={d.note || ''}
                onChange={e => set('note', e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                placeholder="Descrivi il motivo del KO…"
              />
            </div>
          )}
        </>
      )}

      {action === 'gettona' && (
        <MesePicker label="Mese di gettonamento" required
          value={d.mese || ''} onChange={v => set('mese', v)}
          hint="Punti e fatturato vengono congelati a questo momento" />
      )}

      {action === 'storna' && (
        <MesePicker label="Mese di storno" required
          value={d.mese || ''} onChange={v => set('mese', v)}
          hint={meseGettonamentoCorrente
            ? `Deve essere ≥ ${formatMeseAnno(meseGettonamentoCorrente)} ma diverso (§4.6)`
            : 'Mese in cui registrare lo storno'} />
      )}

      {action === 'recupera' && (
        <MesePicker label="Mese di competenza" required
          value={d.mese || ''} onChange={v => set('mese', v)} />
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" size="sm" onClick={onAnnulla} disabled={loading}>
          Annulla
        </Button>
        <Button size="sm"
          variant={cfg.tone === 'danger' ? 'danger' : cfg.tone === 'success' ? 'success' : 'primary'}
          onClick={onConferma} loading={loading}>
          Conferma
        </Button>
      </div>
    </div>
  )
}

// Mese corrente in formato 'YYYY-MM' (default per i picker)
function defaultYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function SezioneEdit({ title, aperta, onToggle, children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-accent/40 bg-accent/5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-white hover:bg-white/5"
      >
        <span>{title}</span>
        <ChevronRight
          size={14}
          className={cn('text-text-muted transition-transform', aperta && 'rotate-90')}
        />
      </button>
      {aperta && (
        <div className="space-y-3 border-t border-border bg-bg/30 p-4">
          {children}
        </div>
      )}
    </div>
  )
}

function Textarea({ label, required, value, onChange, hint }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-text-muted">
        {label}{required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
      />
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  )
}

function InfoBlock({ icon: Icon, label, children }) {
  return (
    <div className="rounded-xl border border-border bg-bg/30 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-muted">
        <Icon size={12} /> {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

// === helpers ===

function formatMeseAnno(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}

function labelMotivoKoNonVal(k) {
  return ({
    non_trovato: 'Non trovato',
    documenti_non_validi: 'Documenti non validi',
    manca_firma: 'Manca firma',
    manca_modulo_avvenuto_contatto: 'Manca modulo avvenuto contatto',
  })[k] || k
}

function labelMotivoKo(k) {
  return ({
    rifiuto_cliente: 'Rifiuto cliente',
    ko_tecnico: 'KO tecnico',
    ko_credito: 'KO credito',
    ko_altro: 'KO altro motivo',
  })[k] || k
}

function labelRuoloPdv(r) {
  return ({
    venditore: 'Venditore',
    tm: 'Team Manager',
    as: 'Area Sales',
    dv: 'Direttore Vendite',
  })[r] || r
}

function dateToYM(iso) {
  if (!iso) return ''
  return iso.slice(0, 7)
}

function emptyForm() {
  return {
    stato: 'da_validare',
    motivo_ko_non_validato: '',
    motivo_ko: '',
    note_ko: '',
    note: '',
    note_bo: '',
    mese_gettonamento: '',
    mese_storno: '',
    venditore_id: '',
    cliente: {},
    prodotto: '',
    tipo_energia: '',
    sottoprodotti_ids: [],
  }
}
