/**
 * Helper Gara Gallery (§8).
 *
 * Concetti chiave:
 *  - 6 soglie per Sinergia + 6 per Galleria, con punti_min e premio €
 *  - Soglia raggiunta = la più alta dove punti >= punti_min (eventualmente al 50% nei primi 3 mesi)
 *  - Doppia logica: previsto (validati nel mese sottoscrizione) / attualizzato (gettonati nel mese gettonamento)
 *  - Storico soglie via valid_from/valid_to: per un mese si applicano le soglie attive in quella data
 */
import { supabase } from './supabase'
import {
  ymToIsoFirst, lastDayIso, totaleContratto, tipoMese,
  giorniTotaliMese, giorniConsumati,
} from './dashboard'

/**
 * Carica le soglie attive per un dato mese (valid_from <= mese E (valid_to IS NULL OR valid_to > mese)).
 * Ritorna array ordinato per livello asc.
 */
export async function fetchSoglieAttive(ym) {
  const meseISO = ymToIsoFirst(ym)
  const { data, error } = await supabase
    .from('gara_gallery_soglie')
    .select('*')
    .lte('valid_from', meseISO)
    .or(`valid_to.is.null,valid_to.gt.${meseISO}`)
    .order('tipo', { ascending: true })
    .order('livello', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Carica TUTTE le soglie storiche (per la pagina Configurazione).
 */
export async function fetchSoglieAttualmenteAttive() {
  const { data, error } = await supabase
    .from('gara_gallery_soglie')
    .select('*')
    .is('valid_to', null)
    .order('tipo', { ascending: true })
    .order('livello', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Calcola i mesi di vita di un PdV in un mese dato (1-based).
 * Es. PdV aperto a gennaio, mese=gennaio → 1°. Mese=marzo → 3°.
 */
export function mesiVitaPdv(dataApertura, ym) {
  if (!dataApertura) return 1
  const apertura = new Date(dataApertura)
  const [y, m] = ym.split('-').map(Number)
  const mese = new Date(y, m - 1, 1)
  const diff = (mese.getFullYear() - apertura.getFullYear()) * 12 + (mese.getMonth() - apertura.getMonth()) + 1
  return Math.max(1, diff)
}

/**
 * Fattore di abbattimento delle soglie:
 *  - primi 3 mesi vita PdV → 0.5 (servono il 50% dei punti per ogni soglia)
 *  - dal 4° mese → 1.0
 */
export function fattoreSogliaPrimiMesi(mesiVita) {
  return mesiVita <= 3 ? 0.5 : 1
}

/**
 * Trova la soglia più alta raggiunta dato un valore di punti.
 * Applica il fattore primi 3 mesi sui punti_min.
 */
export function sogliaRaggiunta(soglie, tipo, punti, fattore) {
  if (!punti || punti <= 0) return null
  const sogliePdv = soglie
    .filter(s => s.tipo === tipo)
    .sort((a, b) => b.livello - a.livello) // dal più alto al più basso
  for (const s of sogliePdv) {
    const min = s.punti_min * fattore
    if (punti >= min) return s
  }
  return null
}

/**
 * Calcola la dashboard Gara Gallery di un PdV per un mese.
 *
 * - punti_attuali: somma punti contratti VALIDATI nel mese (data sottoscrizione)
 * - proiezione fine mese: punti_attuali / giorno × giorni_totali (corrente);
 *   produzione (passato); 0 (futuro)
 * - punti_attualizzati: somma punti dei GETTONATI nel mese (mese_gettonamento)
 *   meno STORNATI nel mese (mese_storno)
 */
export function calcolaPdvGaraGallery(pdv, contrattiMese, contrattiAttualizzati, soglie, ym) {
  const mesiVita = mesiVitaPdv(pdv.data_apertura, ym)
  const fattore = fattoreSogliaPrimiMesi(mesiVita)

  // Punti previsti = validati con data_stipula nel mese (escludo già gettonati)
  const punti_attuali = contrattiMese
    .filter(c => c.pdv?.id === pdv.id && c.stato === 'validato')
    .reduce((s, c) => s + totaleContratto(c).punti, 0)

  // Punti attualizzati = (gettonati nel mese) - (stornati nel mese)
  const punti_attualizzati = contrattiAttualizzati
    .filter(c => c.pdv?.id === pdv.id)
    .reduce((s, c) => {
      const segno = c.stato === 'stornato' ? -1 : 1
      return s + segno * totaleContratto(c).punti
    }, 0)

  // Proiezione fine mese
  const tipo = tipoMese(ym)
  const giorni = giorniConsumati(ym) || 1
  const giorniTot = giorniTotaliMese(ym)
  let proiezione = 0
  if (tipo === 'corrente') proiezione = Math.round(punti_attuali * giorniTot / giorni)
  else if (tipo === 'passato') proiezione = punti_attuali

  // Soglie
  const sogliaPrev   = sogliaRaggiunta(soglie, pdv.tipo, proiezione, fattore)
  const sogliaAttual = sogliaRaggiunta(soglie, pdv.tipo, punti_attualizzati, fattore)

  return {
    pdv_id: pdv.id,
    nome: pdv.nome,
    tipo: pdv.tipo,
    categoria: pdv.categoria,
    mesi_vita: mesiVita,
    fattore_primi_3_mesi: fattore,
    punti_attuali,
    proiezione,
    punti_attualizzati,
    soglia_prevista: sogliaPrev,
    soglia_attualizzata: sogliaAttual,
    premio_previsto: sogliaPrev?.premio || 0,
    premio_attualizzato: sogliaAttual?.premio || 0,
  }
}

/**
 * Carica i contratti gettonati/stornati nel MESE indicato (per il calcolo attualizzato).
 */
export async function fetchContrattiAttualizzati(ym) {
  const start = ymToIsoFirst(ym)
  const end = lastDayIso(ym)
  // Gettonati nel mese (mese_gettonamento è il primo del mese, lo cerco esatto)
  const [resGettonati, resStornati] = await Promise.all([
    supabase
      .from('contratti')
      .select(`
        id, prodotto, stato, mese_gettonamento, mese_storno, punti_snap,
        pdv:pdv(id),
        contratto_sottoprodotti(sottoprodotti(punti))
      `)
      .eq('mese_gettonamento', start)
      .eq('stato', 'gettonato'),
    supabase
      .from('contratti')
      .select(`
        id, prodotto, stato, mese_gettonamento, mese_storno, punti_snap,
        pdv:pdv(id),
        contratto_sottoprodotti(sottoprodotti(punti))
      `)
      .eq('mese_storno', start)
      .eq('stato', 'stornato'),
  ])
  if (resGettonati.error) throw resGettonati.error
  if (resStornati.error) throw resStornati.error
  return [...(resGettonati.data || []), ...(resStornati.data || [])]
}
