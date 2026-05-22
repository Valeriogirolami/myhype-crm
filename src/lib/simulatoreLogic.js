/**
 * Logica di calcolo del "Simulatore di Sostenibilità" (solo Galleria).
 *
 * Dato un set di parametri economici di sistema (tabella simulatore_parametri)
 * e un set di input dal form (affitto, n. venditori/centri/AS/DV), calcola
 * quanti contratti un PdV Galleria deve produrre in un mese per raggiungere
 * 3 target di profitto, in 2 modalità (Startup primi 3 mesi / Presidio dal 4°).
 *
 * Tutte le formule seguono fedelmente la specifica della feature.
 */

// Le 2 modalità di simulazione
export const MODALITA = {
  startup: { key: 'startup', label: 'Startup (primi 3 mesi)', moltiplicatoreSoglia: 0.5 },
  presidio: { key: 'presidio', label: 'Presidio (dal 4° mese)', moltiplicatoreSoglia: 1.0 },
}

// I 3 target di profitto
export const TARGET = {
  breakeven: { key: 'breakeven', label: 'Break-even' },
  plus30: { key: 'plus30', label: 'Margine +30%' },
  plus80: { key: 'plus80', label: 'Margine +80%' },
}

// Limite massimo della ricerca lineare dei contratti
const N_MAX = 2000

/**
 * Determina la soglia Gara Gallery più alta raggiunta dato un totale punti.
 * @param {number} puntiTotali
 * @param {{livello:number, punti_min:number, premio:number}[]} soglieGalleria  ordinate per punti_min asc
 * @param {number} moltiplicatore  1.0 (Presidio) | 0.5 (Startup)
 * @returns {{premio:number, soglia:object|null}}
 */
export function calcolaGaraGallery(puntiTotali, soglieGalleria, moltiplicatore) {
  let raggiunta = null
  for (const s of soglieGalleria) {
    if (puntiTotali >= s.punti_min * moltiplicatore) {
      // soglieGalleria è ordinata asc → l'ultima che supera è la più alta
      raggiunta = s
    }
  }
  return { premio: raggiunta?.premio || 0, soglia: raggiunta }
}

/**
 * Simula il risultato economico per N contratti totali in una modalità.
 * @param {number} N  numero contratti totali (può essere frazionario in ricerca)
 * @param {'startup'|'presidio'} modalita
 * @param {object} p  parametri di sistema (riga simulatore_parametri)
 * @param {object} input  { affitto, n_venditori, n_centri, n_as, n_dv }
 * @param {array} soglieGalleria
 */
export function simula(N, modalita, p, input, soglieGalleria) {
  const moltiplicatore = MODALITA[modalita].moltiplicatoreSoglia

  // Distribuzione contratti per prodotto (frazioni, non arrotondate)
  const n_mobile = N * (p.perc_mobile / 100)
  const n_fisso = N * (p.perc_fisso / 100)
  const n_energia = N * (p.perc_energia / 100)

  // Punti totali
  const punti_totali =
    n_mobile * p.punti_mobile +
    n_fisso * p.punti_fisso +
    n_energia * p.punti_energia

  // Ricavi
  const fatt_azienda =
    n_mobile * p.fatt_az_mobile +
    n_fisso * p.fatt_az_fisso +
    n_energia * p.fatt_az_energia
  const { premio: gara_gallery, soglia } = calcolaGaraGallery(punti_totali, soglieGalleria, moltiplicatore)
  const ricavi_totali = fatt_azienda + gara_gallery

  // Costi variabili (proporzionali ai contratti)
  const fatt_pdv =
    n_mobile * p.fatt_pdv_mobile +
    n_fisso * p.fatt_pdv_fisso +
    n_energia * p.fatt_pdv_energia

  // Costi fissi
  const costo_fisso_vend = input.n_venditori * p.fisso_venditore
  const costo_manager = (input.n_as * p.stipendio_as + input.n_dv * p.stipendio_dv) / input.n_centri
  const costo_aziendale = (p.costo_recruiting + p.costo_back_office + p.costo_ufficio) / input.n_centri
  const costi_totali = input.affitto + costo_fisso_vend + fatt_pdv + costo_manager + costo_aziendale

  // Margine
  const margine = ricavi_totali - costi_totali

  return {
    n_mobile, n_fisso, n_energia, punti_totali,
    fatt_azienda, gara_gallery, soglia, ricavi_totali,
    fatt_pdv, costo_fisso_vend, costo_manager, costo_aziendale, costi_totali,
    margine,
  }
}

/**
 * Verifica se un risultato soddisfa un target.
 * IMPORTANTE: i costi_totali dipendono da N (via fatt_pdv), quindi la soglia
 * +30%/+80% va calcolata sui costi di QUEL N.
 */
function soddisfaTarget(res, target) {
  switch (target) {
    case 'breakeven': return res.margine >= 0
    case 'plus30': return res.margine >= 0.30 * res.costi_totali
    case 'plus80': return res.margine >= 0.80 * res.costi_totali
    default: return false
  }
}

/**
 * Trova il minimo N intero (1..N_MAX) che soddisfa il target nella modalità data.
 * @returns {{ raggiungibile: boolean, N: number|null, risultato: object|null }}
 */
export function trovaContrattiPerTarget(modalita, target, p, input, soglieGalleria) {
  for (let N = 1; N <= N_MAX; N++) {
    const res = simula(N, modalita, p, input, soglieGalleria)
    if (soddisfaTarget(res, target)) {
      return { raggiungibile: true, N, risultato: res }
    }
  }
  return { raggiungibile: false, N: null, risultato: null }
}

/**
 * Calcola tutti i 6 scenari (2 modalità × 3 target).
 * Ritorna { startup: { breakeven, plus30, plus80 }, presidio: {...} }
 * dove ogni scenario è:
 *   { raggiungibile, N, breakdown:{mobile,fisso,energia}, risultato }
 */
export function calcolaTuttiGliScenari(p, input, soglieGalleria) {
  // Ordino le soglie per punti_min ascendente (sicurezza)
  const soglie = [...soglieGalleria].sort((a, b) => a.punti_min - b.punti_min)

  const out = {}
  for (const modalita of ['startup', 'presidio']) {
    out[modalita] = {}
    for (const target of ['breakeven', 'plus30', 'plus80']) {
      const r = trovaContrattiPerTarget(modalita, target, p, input, soglie)
      out[modalita][target] = {
        ...r,
        breakdown: r.raggiungibile ? {
          mobile: Math.round(r.N * (p.perc_mobile / 100)),
          fisso: Math.round(r.N * (p.perc_fisso / 100)),
          energia: Math.round(r.N * (p.perc_energia / 100)),
        } : null,
      }
    }
  }
  return out
}
