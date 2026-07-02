/**
 * Pagina Contratti (§4).
 *
 * - Lista con filtri §4.8 + filtro mese gettonamento
 * - Scope per ruolo (via RLS + filtro app)
 * - Bottone "+ Nuovo contratto" per PdV, Admin e BO
 * - Click riga → dettaglio con azioni di transizione stato (Step 6b)
 * - Multi-selezione + bottone "Gettona selezionati" (solo admin/bo, solo
 *   contratti in stato 'validato')
 * - Auto-refresh dopo ogni azione di stato
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Search, Loader2, FileText, Filter, Calendar, Coins,
  Download, Database, ChevronLeft, ChevronRight, AlertCircle, Copy,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { cn, formatDate, formatEuro, formatInt } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import DatePicker from '@/components/ui/DatePicker'
import { STATI, PRODOTTI, calcolaTotali, nomeCliente } from '@/lib/contratti'
import ContrattoNuovoDialog from './ContrattoNuovoDialog'
import ContrattoDettaglioDialog from './ContrattoDettaglioDialog'
import GettonaMultipliDialog from './GettonaMultipliDialog'
import { getPdvScopeIds } from '@/lib/classifiche'
import { scaricaXlsx, esportaDatabaseCompleto } from '@/lib/export'

const OPZIONI_PAGINA = [10, 25, 100, 'tutti']

// Etichette leggibili per i motivi KO (per l'export Excel)
const ETICHETTA_KO_NON_VAL = {
  non_trovato: 'Non trovato',
  documenti_non_validi: 'Documenti non validi',
  manca_firma: 'Manca firma',
  manca_modulo_avvenuto_contatto: 'Manca modulo avvenuto contatto',
}
const ETICHETTA_KO = {
  rifiuto_cliente: 'Rifiuto cliente',
  ko_tecnico: 'KO tecnico',
  ko_credito: 'KO credito',
  ko_altro: 'KO altro motivo',
}
const ETICHETTA_PDV_TIPO = { sinergia: 'Sinergia', galleria: 'Galleria' }
const ETICHETTA_CATEGORIA_CLIENTE = { privato: 'Privato', azienda: 'Azienda' }

export default function Contratti() {
  const { profile } = useAuth()
  const canCreate = ['admin','bo','pdv'].includes(profile?.ruolo)
  const isBoAdmin = ['admin','bo'].includes(profile?.ruolo)
  const isAdmin = profile?.ruolo === 'admin'
  const isPdv = profile?.ruolo === 'pdv'
  const isAsTm = ['as','tm'].includes(profile?.ruolo)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [pdvList, setPdvList] = useState([])
  // Quando l'utente è un account PdV, filtriamo solo i contratti del proprio PdV
  const [myPdvId, setMyPdvId] = useState(null)
  const [scopeReady, setScopeReady] = useState(false) // diventa true quando myPdvId è risolto (o non serve)

  // Filtri (§4.8)
  const [search, setSearch] = useState('')
  const [filterStato, setStato] = useState('tutti')
  const [filterPdv, setPdv] = useState('tutti')
  const [filterArea, setArea] = useState('tutte')
  const [filterProdotto, setProdotto] = useState('tutti')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Filtro mese gettonamento (YYYY-MM)
  const [filterMeseGettona, setMeseGettona] = useState('tutti')

  // Multi-selezione
  const [selezionati, setSelezionati] = useState(new Set())

  // Paginazione (client-side): default 10 righe per pagina
  const [pageSize, setPageSize] = useState(10)   // numero | 'tutti'
  const [page, setPage] = useState(1)

  // Export in corso (per disabilitare i bottoni)
  const [exporting, setExporting] = useState(false)

  // Dialog
  const [newOpen, setNewOpen] = useState(false)
  const [dettaglioId, setDettaglioId] = useState(null)
  const [gettonaMultiOpen, setGettonaMultiOpen] = useState(false)

  // Lista pdv_ids dello scope corrente (null = tutti)
  const [scopePdvIds, setScopePdvIds] = useState(null)

  async function fetchAll(scopeIds = scopePdvIds) {
    setLoading(true)
    let q = supabase
      .from('contratti')
      .select(`
        id, data_stipula, data_sottoscrizione, stato, prodotto, codice_contratto,
        note, note_bo, mese_gettonamento, mese_storno,
        motivo_ko_non_validato, motivo_ko, note_ko,
        fatturato_pdv_snap, punti_snap, fatturato_azienda_snap,
        cliente:clienti(
          id, nome, cognome, ragione_sociale, categoria, codice_fiscale,
          p_iva, email, telefono, telefono_fisso, iban, pod, pdr
        ),
        pdv:pdv(id, nome, tipo, area, categoria),
        venditore:collaboratori(id, nome, cognome),
        contratto_sottoprodotti(sottoprodotti(id, nome, punti, fatturato_pdv, fatturato_azienda))
      `)
      // Ordino per data STIPULA (data commercialmente rilevante), non per data
      // di registrazione: uso lo stesso criterio delle statistiche.
      .order('data_stipula', { ascending: false })

    // Scope §11: PdV/AS/TM vedono solo i contratti dei loro PdV
    if (Array.isArray(scopeIds)) {
      if (scopeIds.length === 0) {
        // Nessun PdV nel suo scope → nessun contratto da mostrare
        setRows([])
        setLoading(false)
        return
      }
      q = q.in('pdv_id', scopeIds)
    }

    const { data, error } = await q
    if (error) {
      toast.error(`Errore caricamento contratti: ${error.message}`)
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  // Risolvo lo scope (lista pdv_ids) e poi carico tutto
  useEffect(() => {
    async function init() {
      let ids = null  // null = nessun filtro (admin/bo/dv)
      if (isPdv || isAsTm) {
        ids = await getPdvScopeIds(profile)
        if (!Array.isArray(ids)) ids = []
      }
      setScopePdvIds(ids)
      // Per il filtro PdV nella barra: mostro solo i PdV dello scope (o tutti)
      let pdvFilterQ = supabase.from('pdv').select('id, nome, area').order('nome')
      if (Array.isArray(ids) && ids.length > 0) pdvFilterQ = pdvFilterQ.in('id', ids)
      else if (Array.isArray(ids) && ids.length === 0) {
        setPdvList([])
        await fetchAll(ids)
        setScopeReady(true)
        return
      }
      const { data } = await pdvFilterQ
      setPdvList(data || [])
      // Conserva myPdvId per retrocompat (se ruolo='pdv', è l'unico)
      if (isPdv && Array.isArray(ids) && ids[0]) setMyPdvId(ids[0])
      setScopeReady(true)
      fetchAll(ids)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isPdv, isAsTm])

  // Lista mesi gettonamento presenti (per popolare il filtro dinamicamente)
  const mesiGettonaPresenti = useMemo(() => {
    const set = new Set(
      rows.map(r => r.mese_gettonamento).filter(Boolean)
    )
    return Array.from(set).sort().reverse() // più recenti prima
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterStato     !== 'tutti' && r.stato !== filterStato) return false
      if (filterProdotto  !== 'tutti' && r.prodotto !== filterProdotto) return false
      if (filterPdv       !== 'tutti' && r.pdv?.id !== filterPdv) return false
      if (filterArea      !== 'tutte' && r.pdv?.area !== Number(filterArea)) return false
      if (filterMeseGettona !== 'tutti') {
        if (filterMeseGettona === 'nessuno') {
          if (r.mese_gettonamento) return false
        } else {
          if (r.mese_gettonamento !== filterMeseGettona) return false
        }
      }
      // Filtro date "da/a" applicato sulla DATA STIPULA (coerente con statistiche)
      if (dateFrom && r.data_stipula < dateFrom) return false
      if (dateTo && r.data_stipula > dateTo) return false
      if (q) {
        const blob = [
          r.cliente?.nome, r.cliente?.cognome, r.cliente?.ragione_sociale,
          r.cliente?.codice_fiscale, r.venditore?.nome, r.venditore?.cognome,
          r.codice_contratto,
        ].join(' ').toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [rows, search, filterStato, filterPdv, filterArea, filterProdotto,
      dateFrom, dateTo, filterMeseGettona])

  // --- Paginazione client-side ---
  const totalePagine = pageSize === 'tutti'
    ? 1
    : Math.max(1, Math.ceil(filtered.length / pageSize))

  // Se cambiano i filtri o la dimensione pagina, torno alla pagina 1
  useEffect(() => { setPage(1) }, [
    search, filterStato, filterPdv, filterArea, filterProdotto,
    dateFrom, dateTo, filterMeseGettona, pageSize,
  ])

  // Se la pagina corrente eccede il totale (es. dopo un filtro), la riallineo
  useEffect(() => {
    if (page > totalePagine) setPage(totalePagine)
  }, [page, totalePagine])

  const paginati = useMemo(() => {
    if (pageSize === 'tutti') return filtered
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  // --- Export Excel ---
  // Costruisce una riga "piatta" pronta per l'Excel.
  // Le colonne sono ordinate per leggibilità (contratto → cliente → PdV →
  // venditore → prodotti → economici → date stato → note). La colonna
  // "Fatturato Azienda" è inclusa SOLO per il ruolo Admin (richiesta Valerio).
  function rigaExport(r) {
    const sps = (r.contratto_sottoprodotti || []).map(x => x.sottoprodotti).filter(Boolean)
    const t = calcolaTotali(sps)
    const gettonato = r.stato === 'gettonato' || r.stato === 'stornato'
    const punti      = gettonato ? (r.punti_snap ?? t.punti) : t.punti
    const fattPdv    = gettonato ? (r.fatturato_pdv_snap ?? t.fatturato_pdv) : t.fatturato_pdv
    const fattAz     = gettonato ? (r.fatturato_azienda_snap ?? t.fatturato_azienda) : t.fatturato_azienda

    const cli = r.cliente || {}
    const pdv = r.pdv || {}

    const riga = {
      // === CONTRATTO ===
      'Data stipula': formatDate(r.data_stipula),
      'Data registrazione': formatDate(r.data_sottoscrizione),
      'Codice Contratto': r.codice_contratto || '',
      'Stato': STATI[r.stato]?.label || r.stato,

      // === CLIENTE ===
      'Cliente': nomeCliente(cli),
      'Categoria cliente': ETICHETTA_CATEGORIA_CLIENTE[cli.categoria] || '',
      'Ragione sociale': cli.ragione_sociale || '',
      'Codice Fiscale': cli.codice_fiscale || '',
      'P.IVA': cli.p_iva || '',
      'Email': cli.email || '',
      'Telefono cellulare': cli.telefono || '',
      'Telefono fisso': cli.telefono_fisso || '',
      'IBAN': cli.iban || '',
      'POD': cli.pod || '',
      'PDR': cli.pdr || '',

      // === PDV ===
      'PdV': pdv.nome || '',
      'PdV tipo': ETICHETTA_PDV_TIPO[pdv.tipo] || pdv.tipo || '',
      'PdV area': pdv.area ?? '',
      'PdV categoria': pdv.categoria || '',

      // === VENDITORE ===
      'Venditore': r.venditore ? `${r.venditore.nome} ${r.venditore.cognome}` : '',

      // === PRODOTTI ===
      'Prodotto': PRODOTTI[r.prodotto]?.label || r.prodotto,
      'Sottoprodotti': sps.map(s => s.nome).join(' · '),
      'N. sottoprodotti': sps.length,

      // === ECONOMICI ===
      'Punti': punti,
      'Fatturato PdV (€)': fattPdv,
    }

    // Fatturato Azienda solo per Admin (BO non lo deve vedere)
    if (isAdmin) {
      riga['Fatturato Azienda (€)'] = fattAz
    }

    // === DATE STATO / KO / NOTE ===
    Object.assign(riga, {
      'Mese gettonamento': r.mese_gettonamento ? formatYM(r.mese_gettonamento) : '',
      'Mese storno': r.mese_storno ? formatYM(r.mese_storno) : '',
      'Motivo KO non validato': ETICHETTA_KO_NON_VAL[r.motivo_ko_non_validato] || '',
      'Motivo KO': ETICHETTA_KO[r.motivo_ko] || '',
      'Note KO': r.note_ko || '',
      'Note generali': r.note || '',
      'Note Back office': r.note_bo || '',
    })

    return riga
  }

  async function esportaFiltrati() {
    if (filtered.length === 0) {
      toast.error('Nessun contratto da esportare con i filtri attuali.')
      return
    }
    try {
      setExporting(true)
      await scaricaXlsx([{ nome: 'Contratti', righe: filtered.map(rigaExport) }], 'MyHype_contratti')
      toast.success(`Esportati ${filtered.length} contratti.`)
    } catch (err) {
      toast.error(`Errore export: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  async function esportaTutto() {
    try {
      setExporting(true)
      toast.info('Preparazione export completo… può richiedere qualche secondo.')
      const n = await esportaDatabaseCompleto()
      toast.success(`Export completo pronto (${n} righe totali).`)
    } catch (err) {
      toast.error(`Errore export totale: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  // Export "senza codice contratto" — controllo qualità dati:
  // tutti i contratti (nello scope corrente, senza applicare i filtri)
  // che non hanno il codice contratto compilato.
  async function esportaSenzaCodice() {
    const senzaCodice = rows.filter(
      r => !r.codice_contratto || !r.codice_contratto.trim()
    )
    if (senzaCodice.length === 0) {
      toast.info('Nessun contratto senza codice contratto. Tutto a posto!')
      return
    }
    try {
      setExporting(true)
      await scaricaXlsx(
        [{ nome: 'Senza codice contratto', righe: senzaCodice.map(rigaExport) }],
        'MyHype_contratti_SENZA_codice'
      )
      toast.success(`Esportati ${senzaCodice.length} contratti senza codice.`)
    } catch (err) {
      toast.error(`Errore export: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  // Export "doppioni codice contratto" — controllo qualità dati:
  // tutti i contratti con codice_contratto duplicato (2+ occorrenze).
  // Il matching è case-insensitive e trim-ato per intercettare varianti tipo
  // '444' vs ' 444 '. L'output è ordinato per codice → doppioni adiacenti.
  async function esportaDoppioniCodice() {
    const gruppi = new Map()
    for (const r of rows) {
      const cod = (r.codice_contratto || '').trim().toUpperCase()
      if (!cod) continue
      if (!gruppi.has(cod)) gruppi.set(cod, [])
      gruppi.get(cod).push(r)
    }
    const doppioni = []
    for (const arr of gruppi.values()) {
      if (arr.length > 1) doppioni.push(...arr)
    }
    if (doppioni.length === 0) {
      toast.info('Nessun codice contratto duplicato. Tutto a posto!')
      return
    }
    // Ordino per codice così i doppioni escono adiacenti in Excel
    doppioni.sort((a, b) =>
      (a.codice_contratto || '').toUpperCase()
        .localeCompare((b.codice_contratto || '').toUpperCase())
    )
    try {
      setExporting(true)
      await scaricaXlsx(
        [{ nome: 'Doppioni codice', righe: doppioni.map(rigaExport) }],
        'MyHype_contratti_DOPPIONI_codice'
      )
      toast.success(`Esportati ${doppioni.length} contratti con codice duplicato.`)
    } catch (err) {
      toast.error(`Errore export: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  // Solo i validati possono essere selezionati (per gettonamento massivo)
  const selezionabiliVisibili = useMemo(
    () => filtered.filter(r => r.stato === 'validato'),
    [filtered]
  )
  const tuttiSelezionati =
    selezionabiliVisibili.length > 0 &&
    selezionabiliVisibili.every(r => selezionati.has(r.id))

  function toggleRiga(id) {
    setSelezionati(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleAll() {
    if (tuttiSelezionati) {
      setSelezionati(new Set())
    } else {
      setSelezionati(new Set(selezionabiliVisibili.map(r => r.id)))
    }
  }

  function handleAfterAction() {
    fetchAll()
    setSelezionati(new Set())
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-white">Contratti</h1>
          <p className="mt-1 text-text-muted">
            {filtered.length} di {rows.length}{' '}
            {rows.length === 1 ? 'contratto' : 'contratti'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Export Excel del filtrato — solo Admin/BO */}
          {isBoAdmin && (
            <Button variant="secondary" onClick={esportaFiltrati} loading={exporting}>
              <Download size={16} />
              Esporta Excel
            </Button>
          )}
          {/* Export "senza codice contratto" — controllo qualità dati (Admin/BO) */}
          {isBoAdmin && (
            <Button
              variant="secondary"
              onClick={esportaSenzaCodice}
              loading={exporting}
              title="Scarica un Excel con tutti i contratti senza codice contratto compilato"
            >
              <AlertCircle size={16} />
              Senza codice
            </Button>
          )}
          {/* Export "doppioni codice contratto" — controllo qualità dati (Admin/BO) */}
          {isBoAdmin && (
            <Button
              variant="secondary"
              onClick={esportaDoppioniCodice}
              loading={exporting}
              title="Scarica un Excel con tutti i contratti che condividono lo stesso codice"
            >
              <Copy size={16} />
              Doppioni codice
            </Button>
          )}
          {/* Export totale database — solo Admin */}
          {isAdmin && (
            <Button variant="secondary" onClick={esportaTutto} loading={exporting}>
              <Database size={16} />
              Esporta tutto
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setNewOpen(true)}>
              <Plus size={16} />
              Nuovo contratto
            </Button>
          )}
        </div>
      </div>

      {/* Barra filtri */}
      <div className="mt-6 space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per codice contratto, CF, nome cliente, venditore…"
              className="w-full rounded-xl border border-border bg-bg py-2 pl-10 pr-3 text-sm text-white placeholder:text-text-muted/60 outline-none transition focus:border-accent"
            />
          </div>

          <FilterPill icon={Filter} label="Stato" value={filterStato} onChange={setStato}
            options={[['tutti','Tutti'], ...Object.entries(STATI).map(([k, m]) => [k, m.label])]}
          />
          <FilterPill label="Prodotto" value={filterProdotto} onChange={setProdotto}
            options={[['tutti','Tutti'], ...Object.entries(PRODOTTI).map(([k, m]) => [k, m.label])]}
          />
          {!isPdv && (
            <>
              <FilterPill label="Area" value={filterArea} onChange={setArea}
                options={[['tutte','Tutte'],['1','Area 1'],['2','Area 2'],['3','Area 3'],['4','Area 4']]}
              />
              <FilterPill label="PdV" value={filterPdv} onChange={setPdv}
                options={[['tutti','Tutti'], ...pdvList.map(p => [p.id, p.nome])]}
              />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Calendar size={14} className="text-text-muted" />
            <span className="text-text-muted">Stipula:</span>
            <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="da..." />
            <span className="text-text-muted">→</span>
            <DatePicker value={dateTo} onChange={setDateTo} placeholder="a..." minDate={dateFrom || undefined} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs text-accent-2 hover:underline">
                cancella
              </button>
            )}
          </div>

          <FilterPill icon={Coins} label="Mese gettonamento" value={filterMeseGettona} onChange={setMeseGettona}
            options={[
              ['tutti','Tutti'],
              ['nessuno','Non gettonati'],
              ...mesiGettonaPresenti.map(m => [m, formatYM(m)]),
            ]}
          />
        </div>
      </div>

      {/* Barra azioni multi-selezione */}
      {isBoAdmin && selezionati.size > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-3 shadow-soft">
          <div className="text-sm">
            <strong className="text-white">{selezionati.size}</strong>
            <span className="text-text-muted"> contratti selezionati</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelezionati(new Set())}>
              Deseleziona tutto
            </Button>
            <Button size="sm" onClick={() => setGettonaMultiOpen(true)}>
              <Coins size={14} /> Gettona selezionati ({selezionati.size})
            </Button>
          </div>
        </div>
      )}

      {/* Tabella */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-text-muted">
            <Loader2 size={18} className="animate-spin" /> Caricamento…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent-2">
              <FileText size={22} />
            </div>
            <p className="text-white">
              {rows.length === 0 ? 'Nessun contratto ancora presente' : 'Nessun contratto corrisponde ai filtri'}
            </p>
            {rows.length === 0 && canCreate && (
              <Button onClick={() => setNewOpen(true)} className="mt-2">
                <Plus size={16} /> Inserisci il primo
              </Button>
            )}
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg/50 text-left text-xs uppercase tracking-wide text-text-muted">
                  {/* checkbox header — solo per admin/bo se ci sono validati visibili */}
                  {isBoAdmin && (
                    <th className="w-10 px-3 py-3">
                      {selezionabiliVisibili.length > 0 && (
                        <input
                          type="checkbox"
                          checked={tuttiSelezionati}
                          onChange={toggleAll}
                          className="accent-accent"
                          title="Seleziona/deseleziona tutti i validati"
                        />
                      )}
                    </th>
                  )}
                  <th className="px-5 py-3 font-medium">Stipulato / Registrato</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">PdV</th>
                  <th className="px-5 py-3 font-medium">Venditore</th>
                  <th className="px-5 py-3 font-medium">Prodotto</th>
                  <th className="px-5 py-3 font-medium text-right">Punti</th>
                  <th className="px-5 py-3 font-medium text-right">Fatt. PdV</th>
                  <th className="px-5 py-3 font-medium">Stato</th>
                  <th className="px-5 py-3 font-medium">Gettonato</th>
                </tr>
              </thead>
              <tbody>
                {paginati.map(r => {
                  const sp = (r.contratto_sottoprodotti || []).map(x => x.sottoprodotti).filter(Boolean)
                  const t = calcolaTotali(sp)
                  const statoMeta    = STATI[r.stato]
                  const prodottoMeta = PRODOTTI[r.prodotto]
                  const isValidato = r.stato === 'validato'
                  const checked = selezionati.has(r.id)
                  // Per i gettonati uso lo snapshot, per gli altri il totale corrente
                  const puntiMostr  = r.stato === 'gettonato' ? (r.punti_snap ?? t.punti) : t.punti
                  const fattMostr   = r.stato === 'gettonato' ? (r.fatturato_pdv_snap ?? t.fatturato_pdv) : t.fatturato_pdv
                  return (
                    <tr
                      key={r.id}
                      onClick={(e) => {
                        // Se ho cliccato la checkbox o il suo th, non aprire il dettaglio
                        if (e.target.closest('[data-stop-row]')) return
                        setDettaglioId(r.id)
                      }}
                      className={cn(
                        'cursor-pointer border-t border-border transition-colors hover:bg-white/5',
                        checked && 'bg-accent/5',
                      )}
                    >
                      {isBoAdmin && (
                        <td className="px-3 py-3" data-stop-row>
                          {isValidato ? (
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRiga(r.id)}
                              onClick={e => e.stopPropagation()}
                              className="accent-accent"
                              title="Seleziona per gettonamento massivo"
                            />
                          ) : null}
                        </td>
                      )}
                      <td className="px-5 py-3 tabular-nums">
                        {/* Data stipula in evidenza; data registrazione secondaria */}
                        <div className="text-white">{formatDate(r.data_stipula)}</div>
                        <div className="text-[11px] text-text-muted">
                          reg. {formatDate(r.data_sottoscrizione)}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-white">{nomeCliente(r.cliente)}</div>
                        <div className="text-[11px] tabular-nums text-text-muted">
                          {r.cliente?.codice_fiscale}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-white">{r.pdv?.nome || '—'}</td>
                      <td className="px-5 py-3 text-white">
                        {r.venditore ? `${r.venditore.nome} ${r.venditore.cognome}` : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        {prodottoMeta && <Badge tone={prodottoMeta.tone}>{prodottoMeta.label}</Badge>}
                      </td>
                      <td className="px-5 py-3 text-right text-white tabular-nums">{formatInt(puntiMostr)}</td>
                      <td className="px-5 py-3 text-right text-white tabular-nums">{formatEuro(fattMostr)}</td>
                      <td className="px-5 py-3">
                        {statoMeta && <Badge tone={statoMeta.tone}>{statoMeta.label}</Badge>}
                      </td>
                      <td className="px-5 py-3 text-text-muted text-xs tabular-nums">
                        {r.mese_gettonamento ? formatYM(r.mese_gettonamento) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Barra paginazione */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm sm:flex-row">
            <div className="flex items-center gap-2 text-text-muted">
              <span>Mostra:</span>
              <select
                value={String(pageSize)}
                onChange={e => {
                  const v = e.target.value
                  setPageSize(v === 'tutti' ? 'tutti' : Number(v))
                }}
                className="rounded-lg border border-border bg-bg px-2 py-1 text-white outline-none focus:border-accent"
              >
                {OPZIONI_PAGINA.map(o => (
                  <option key={o} value={String(o)} className="bg-surface">
                    {o === 'tutti' ? 'Tutti' : o}
                  </option>
                ))}
              </select>
              <span className="hidden sm:inline">per pagina</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-text-muted">
                {pageSize === 'tutti'
                  ? `${filtered.length} contratti`
                  : `${filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} di ${filtered.length}`}
              </span>
              {pageSize !== 'tutti' && totalePagine > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-border bg-bg p-1.5 text-white transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Pagina precedente"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="min-w-[5.5rem] text-center text-text-muted">
                    Pag. {page} di {totalePagine}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalePagine, p + 1))}
                    disabled={page >= totalePagine}
                    className="rounded-lg border border-border bg-bg p-1.5 text-white transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Pagina successiva"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
          </>
        )}
      </div>

      {/* Dialogs */}
      <ContrattoNuovoDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={fetchAll}
      />
      <ContrattoDettaglioDialog
        open={!!dettaglioId}
        onClose={() => setDettaglioId(null)}
        contrattoId={dettaglioId}
        onUpdated={handleAfterAction}
      />
      <GettonaMultipliDialog
        open={gettonaMultiOpen}
        onClose={() => setGettonaMultiOpen(false)}
        ids={Array.from(selezionati)}
        onDone={handleAfterAction}
      />
    </div>
  )
}

function FilterPill({ icon: Icon, label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-1.5 text-sm">
      {Icon && <Icon size={12} className="text-text-muted" />}
      <span className="text-text-muted">{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-transparent pr-1 text-white outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v} className="bg-surface">{l}</option>
        ))}
      </select>
    </label>
  )
}

// Formatta date 'YYYY-MM-DD' o 'YYYY-MM' come "Lug 2026"
function formatYM(s) {
  if (!s) return '—'
  const [y, m] = s.split('-')
  const mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  const idx = Number(m) - 1
  return `${mesi[idx] || m} ${y}`
}
