/**
 * Helper per il calcolo delle classifiche del mese (§10).
 *
 * - Classifiche PdV: per numero contratti, divise per prodotto (Mobile/Fisso/Energia)
 * - Classifica Venditori: per punti totali (top 10)
 * - Classifica interna: venditori di un specifico set di PdV (per AS/TM/PdV)
 *
 * Considero "produttivi" i contratti in stato:
 *   validato, gettonato, stornato
 * (Da_validare, ko_non_validato, ko non contano)
 */
import { supabase } from './supabase'
import { ymToIsoFirst, lastDayIso, totaleContratto } from './dashboard'

/**
 * Carica i contratti del mese (validati+gettonati+stornati) con join essenziale.
 */
export async function fetchContrattiPerClassifiche(ym, opzioni = {}) {
  const start = ymToIsoFirst(ym)
  const end = lastDayIso(ym)
  let q = supabase
    .from('contratti')
    .select(`
      id, prodotto, stato, data_stipula, data_sottoscrizione,
      fatturato_pdv_snap, punti_snap,
      pdv:pdv(id, nome, tipo, area, categoria, account_id),
      venditore:collaboratori(id, nome, cognome, ruolo, account_id),
      contratto_sottoprodotti(sottoprodotti(punti, fatturato_pdv))
    `)
    // Le classifiche si calcolano sulla DATA STIPULA (commercialmente rilevante),
    // NON sulla data di registrazione a sistema.
    .gte('data_stipula', start)
    .lte('data_stipula', end)
    .in('stato', ['validato', 'gettonato', 'stornato'])
  if (opzioni.pdvIds && opzioni.pdvIds.length > 0) {
    q = q.in('pdv_id', opzioni.pdvIds)
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}

/**
 * Classifica PdV per numero contratti di un certo prodotto (§10.1).
 */
export function classificaPdvPerProdotto(contratti, prodotto) {
  const map = new Map()
  for (const c of contratti) {
    if (c.prodotto !== prodotto) continue
    const id = c.pdv?.id
    if (!id) continue
    const cur = map.get(id) || {
      pdv_id: id,
      pdv_nome: c.pdv.nome,
      pdv_tipo: c.pdv.tipo,
      pdv_area: c.pdv.area,
      pdv_account_id: c.pdv.account_id,
      contratti: 0,
      punti: 0,
    }
    cur.contratti += 1
    const t = totaleContratto(c)
    cur.punti += t.punti
    map.set(id, cur)
  }
  return Array.from(map.values())
    .sort((a, b) => b.contratti - a.contratti || b.punti - a.punti)
}

/**
 * Classifica venditori (§10.1).
 *
 * `criterio`:
 *  - 'punti'   → considera TUTTI i contratti, ordina per punti totali
 *  - 'mobile'  → considera SOLO i contratti Mobile, ordina per punti Mobile
 *  - 'fisso'   → considera SOLO i contratti Fisso, ordina per punti Fisso
 *  - 'energia' → considera SOLO i contratti Energia, ordina per punti Energia
 *
 * Quando si filtra per prodotto, escono dalla classifica i venditori che NON
 * hanno fatto contratti di quel prodotto (perché avrebbero 0 punti).
 *
 * `limit` = numero massimo (es. 10 per top globale, null per illimitato).
 */
export function classificaVenditori(contratti, limit = 10, criterio = 'punti') {
  // Se il criterio è un prodotto, filtro i contratti
  const contrattiFiltrati = criterio === 'punti'
    ? contratti
    : contratti.filter(c => c.prodotto === criterio)

  const map = new Map()
  for (const c of contrattiFiltrati) {
    const v = c.venditore
    if (!v?.id) continue
    const cur = map.get(v.id) || {
      venditore_id: v.id,
      nome: v.nome,
      cognome: v.cognome,
      ruolo: v.ruolo,
      account_id: v.account_id,
      contratti: 0,
      ctr_mobile: 0,
      ctr_fisso: 0,
      ctr_energia: 0,
      punti: 0,
    }
    cur.contratti += 1
    if (c.prodotto === 'mobile')  cur.ctr_mobile += 1
    if (c.prodotto === 'fisso')   cur.ctr_fisso += 1
    if (c.prodotto === 'energia') cur.ctr_energia += 1
    const t = totaleContratto(c)
    cur.punti += t.punti
    map.set(v.id, cur)
  }
  const arr = Array.from(map.values())
    .sort((a, b) => b.punti - a.punti || b.contratti - a.contratti)
  return limit ? arr.slice(0, limit) : arr
}

/**
 * Aggrega TUTTI i PdV con la loro produzione del mese, scomposta per prodotto.
 * Carica anche i PdV senza contratti (per l'istogramma di overview).
 */
export async function fetchProduzioneTuttiPdv(contratti) {
  // 1) Lista PdV aperti
  const { data: pdvAperti, error } = await supabase
    .from('pdv')
    .select('id, nome, tipo, area')
    .eq('stato', 'aperto')
    .order('nome')
  if (error) throw error

  // 2) Mappa contratti per pdv_id
  const map = new Map()
  for (const p of pdvAperti || []) {
    map.set(p.id, {
      pdv_id: p.id,
      nome: p.nome,
      tipo: p.tipo,
      area: p.area,
      mobile: 0,
      fisso: 0,
      energia: 0,
      totale: 0,
    })
  }
  for (const c of contratti) {
    const cur = map.get(c.pdv?.id)
    if (!cur) continue
    if (c.prodotto === 'mobile')  cur.mobile += 1
    if (c.prodotto === 'fisso')   cur.fisso += 1
    if (c.prodotto === 'energia') cur.energia += 1
    cur.totale += 1
  }
  // Ordino per totale desc per leggibilità grafico
  return Array.from(map.values()).sort((a, b) => b.totale - a.totale)
}

/**
 * Trova i PdV "scope" per l'utente loggato:
 *  - Admin/BO/DV: tutti i PdV (ritorna null = nessun filtro)
 *  - PdV: il proprio (account_id)
 *  - AS/TM: i PdV dove il collaboratore associato all'account è assegnato
 */
export async function getPdvScopeIds(profile) {
  if (!profile) return []
  const ruolo = profile.ruolo
  // Scope globale: Admin, BO, DV, HR (HR aggiunto 2026-07)
  if (['admin', 'bo', 'dv', 'hr'].includes(ruolo)) return null  // null = tutti
  if (ruolo === 'pdv') {
    const { data } = await supabase
      .from('pdv')
      .select('id')
      .eq('account_id', profile.id)
    return (data || []).map(p => p.id)
  }
  if (['as', 'tm'].includes(ruolo)) {
    // Trovo il collaboratore con account_id = profile.id, poi i PdV assegnati
    const { data: coll } = await supabase
      .from('collaboratori')
      .select('id')
      .eq('account_id', profile.id)
      .maybeSingle()
    if (!coll) return []
    const ruoloPdv = ruolo === 'as' ? 'as' : 'tm'
    const { data: assoc } = await supabase
      .from('pdv_collaboratori')
      .select('pdv_id')
      .eq('collaboratore_id', coll.id)
      .eq('ruolo_nel_pdv', ruoloPdv)
    return (assoc || []).map(a => a.pdv_id)
  }
  return []
}
