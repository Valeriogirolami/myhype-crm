/**
 * Helper per i calcoli delle Dashboard.
 *
 * Concetti chiave (§6, §7):
 *  - Produzione = contratti VALIDATI nel mese (per data_sottoscrizione).
 *  - Previsione = produzione / giorno corrente × giorni totali del mese.
 *    Per mesi passati = produzione (mese chiuso).
 *    Per mesi futuri = 0.
 *  - Target = somma di tutti i target effettivi (base + override) dei PdV aperti.
 *  - Fatturato previsto = somma fatturato_pdv dei validati nel mese.
 *  - Per i contratti gettonati useremo lo snapshot al gettonamento (§5.3).
 *
 * Stati che contano come "produzione":
 *   validato, gettonato, stornato (sono passati per la validazione almeno una volta)
 * Stati che NON contano:
 *   da_validare, ko_non_validato, ko (esce dai conteggi)
 */
import { supabase } from './supabase'

const PRODOTTI = ['mobile', 'fisso', 'energia']

// --------------------------------------------------------------------------
// Utility temporali
// --------------------------------------------------------------------------

export function ymToIsoFirst(ym) { return `${ym}-01` }

export function lastDayIso(ym) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${ym}-${String(last).padStart(2, '0')}`
}

export function giorniTotaliMese(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function ymPrecedente(ym) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 'corrente' | 'passato' | 'futuro' rispetto a oggi
export function tipoMese(ym) {
  const oggi = new Date()
  const ymCorrente = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`
  if (ym < ymCorrente) return 'passato'
  if (ym > ymCorrente) return 'futuro'
  return 'corrente'
}

// Numero di giorni "consumati" nel mese: per mese corrente = giorno odierno;
// per passato = giorni totali del mese; per futuro = 0
export function giorniConsumati(ym) {
  const tipo = tipoMese(ym)
  if (tipo === 'futuro') return 0
  if (tipo === 'passato') return giorniTotaliMese(ym)
  return new Date().getDate()
}

// --------------------------------------------------------------------------
// Caricamento contratti del periodo
// --------------------------------------------------------------------------

/**
 * Carica i contratti VALIDATI/GETTONATI/STORNATI con data_sottoscrizione nel mese.
 * Se `pdvIds` è passato (array), filtra solo i contratti di quei PdV.
 * Se è null/undefined, prende tutti i PdV (scope globale per Admin/BO/DV).
 */
export async function fetchContrattiMese(ym, pdvIds = null) {
  const start = ymToIsoFirst(ym)
  const end = lastDayIso(ym)
  let q = supabase
    .from('contratti')
    .select(`
      id, prodotto, stato, data_sottoscrizione,
      mese_gettonamento, mese_storno,
      fatturato_pdv_snap, fatturato_azienda_snap, punti_snap,
      pdv:pdv(id, nome, tipo, area, categoria),
      contratto_sottoprodotti(sottoprodotti(punti, fatturato_pdv, fatturato_azienda))
    `)
    .gte('data_sottoscrizione', start)
    .lte('data_sottoscrizione', end)
    .in('stato', ['validato', 'gettonato', 'stornato'])
  if (pdvIds && pdvIds.length > 0) {
    q = q.in('pdv_id', pdvIds)
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}

/**
 * Calcola i totali correnti di un contratto (snapshot se gettonato/stornato,
 * altrimenti dai sottoprodotti).
 */
export function totaleContratto(c) {
  if (c.stato === 'gettonato' || c.stato === 'stornato') {
    return {
      punti: c.punti_snap ?? 0,
      fatturato_pdv: c.fatturato_pdv_snap ?? 0,
      fatturato_azienda: c.fatturato_azienda_snap ?? 0,
    }
  }
  const sps = (c.contratto_sottoprodotti || []).map(r => r.sottoprodotti).filter(Boolean)
  return {
    punti: sps.reduce((s, sp) => s + (sp.punti || 0), 0),
    fatturato_pdv: sps.reduce((s, sp) => s + (sp.fatturato_pdv || 0), 0),
    fatturato_azienda: sps.reduce((s, sp) => s + (sp.fatturato_azienda || 0), 0),
  }
}

// --------------------------------------------------------------------------
// Target totali della rete
// --------------------------------------------------------------------------

/**
 * Calcola il target totale della rete per un mese, scomposto per prodotto.
 * Se `pdvIds` è passato (array), considera solo quei PdV.
 * Se null/undefined, considera tutti i PdV aperti.
 * Per ogni PdV aperto: usa override se presente, altrimenti base (tipo, categoria).
 */
export async function fetchTargetTotaliRete(ym, pdvIds = null) {
  const meseISO = ymToIsoFirst(ym)
  let pdvQuery = supabase.from('pdv').select('id, tipo, categoria, stato').eq('stato', 'aperto')
  if (pdvIds && pdvIds.length > 0) pdvQuery = pdvQuery.in('id', pdvIds)

  const [resBase, resOv, resPdv] = await Promise.all([
    supabase.from('target_base').select('*').eq('mese', meseISO),
    supabase.from('target_pdv_override').select('*').eq('mese', meseISO),
    pdvQuery,
  ])
  if (resBase.error) throw resBase.error
  if (resOv.error) throw resOv.error
  if (resPdv.error) throw resPdv.error

  const baseMap = new Map()
  for (const b of resBase.data || []) {
    baseMap.set(`${b.tipo}|${b.categoria}`, b)
  }
  const ovMap = new Map()
  for (const o of resOv.data || []) {
    ovMap.set(o.pdv_id, o)
  }

  const totali = { mobile: 0, fisso: 0, energia: 0 }
  for (const p of resPdv.data || []) {
    const ov = ovMap.get(p.id)
    if (ov) {
      totali.mobile += ov.target_mobile ?? 0
      totali.fisso += ov.target_fisso ?? 0
      totali.energia += ov.target_energia ?? 0
    } else {
      const base = baseMap.get(`${p.tipo}|${p.categoria}`)
      if (base) {
        totali.mobile += base.target_mobile ?? 0
        totali.fisso += base.target_fisso ?? 0
        totali.energia += base.target_energia ?? 0
      }
    }
  }
  return totali
}

// --------------------------------------------------------------------------
// Aggregazioni sui contratti
// --------------------------------------------------------------------------

/**
 * Aggrega i contratti del mese per prodotto + calcola previsioni.
 */
export function aggregaPerProdotto(contratti, ym) {
  const giorniTotali = giorniTotaliMese(ym)
  const giorni = giorniConsumati(ym) || 1  // evita /0
  const fattorePrev = giorniTotali / giorni
  const tipo = tipoMese(ym)

  const out = {}
  for (const p of PRODOTTI) {
    out[p] = { produzione: 0, previsione: 0, punti: 0, fatturato_pdv: 0, fatturato_azienda: 0 }
  }
  for (const c of contratti) {
    if (!out[c.prodotto]) continue
    out[c.prodotto].produzione += 1
    const t = totaleContratto(c)
    out[c.prodotto].punti += t.punti
    out[c.prodotto].fatturato_pdv += t.fatturato_pdv
    out[c.prodotto].fatturato_azienda += t.fatturato_azienda
  }
  // Previsione: solo per mese corrente; passato = produzione, futuro = 0
  for (const p of PRODOTTI) {
    if (tipo === 'corrente') {
      out[p].previsione = Math.round(out[p].produzione * fattorePrev)
    } else if (tipo === 'passato') {
      out[p].previsione = out[p].produzione
    } else {
      out[p].previsione = 0
    }
  }
  return out
}

/**
 * Carica i target effettivi di un singolo PdV per un mese.
 * Usa override se presente, altrimenti il target base della combo Tipo×Categoria.
 */
export async function fetchTargetPdv(pdv, ym) {
  const meseISO = ymToIsoFirst(ym)
  // Override?
  const { data: ov } = await supabase
    .from('target_pdv_override')
    .select('*')
    .eq('pdv_id', pdv.id)
    .eq('mese', meseISO)
    .maybeSingle()
  if (ov) {
    return {
      mobile: ov.target_mobile || 0,
      fisso: ov.target_fisso || 0,
      energia: ov.target_energia || 0,
      origine: 'override',
    }
  }
  // Base
  const { data: base } = await supabase
    .from('target_base')
    .select('*')
    .eq('tipo', pdv.tipo)
    .eq('categoria', pdv.categoria)
    .eq('mese', meseISO)
    .maybeSingle()
  return {
    mobile: base?.target_mobile || 0,
    fisso: base?.target_fisso || 0,
    energia: base?.target_energia || 0,
    origine: 'base',
  }
}

/**
 * Top N PdV per numero contratti.
 */
export function topPdvPerContratti(contratti, n = 5) {
  const map = new Map()
  for (const c of contratti) {
    const id = c.pdv?.id
    if (!id) continue
    const cur = map.get(id) || { id, nome: c.pdv.nome, count: 0 }
    cur.count += 1
    map.set(id, cur)
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, n)
}
