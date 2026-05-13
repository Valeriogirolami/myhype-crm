/**
 * Validatori per dati italiani: Email, Partita IVA, Codice Fiscale.
 *
 * Strategia "soft": tutti i validatori restituiscono true se VALIDO o un
 * MESSAGGIO di errore (string) se non valido. Vuoto/null = NON validato (skip).
 */

// --------------------------------------------------------------------------
// EMAIL
// --------------------------------------------------------------------------
export function validaEmail(email) {
  if (!email) return null
  const e = String(email).trim()
  // Pattern semplice ma accurato per casi comuni
  const re = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i
  if (!re.test(e)) return 'Formato email non valido (es: nome@dominio.it)'
  return null
}

// --------------------------------------------------------------------------
// PARTITA IVA italiana
// 11 cifre, ultima cifra è check digit (algoritmo Luhn-like)
// --------------------------------------------------------------------------
export function validaPartitaIva(piva) {
  if (!piva) return null
  const p = String(piva).trim()
  if (!/^\d{11}$/.test(p)) return 'La P.IVA deve essere composta da 11 cifre'

  let sum = 0
  for (let i = 0; i < 10; i++) {
    let d = parseInt(p.charAt(i), 10)
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  const check = (10 - (sum % 10)) % 10
  if (check !== parseInt(p.charAt(10), 10)) {
    return 'P.IVA con check digit non valido'
  }
  return null
}

// --------------------------------------------------------------------------
// CODICE FISCALE italiano
// 16 caratteri alfanumerici, formato AAAAAA00A00A000A con check digit calcolato
// (per i privati). Le aziende usano la P.IVA come CF (11 cifre).
// --------------------------------------------------------------------------
const CF_DISPARI = {
  '0':1, '1':0, '2':5, '3':7, '4':9, '5':13, '6':15, '7':17, '8':19, '9':21,
  A:1, B:0, C:5, D:7, E:9, F:13, G:15, H:17, I:19, J:21, K:2, L:4, M:18, N:20,
  O:11, P:3, Q:6, R:8, S:12, T:14, U:16, V:10, W:22, X:25, Y:24, Z:23,
}
const CF_PARI = {
  '0':0, '1':1, '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9,
  A:0, B:1, C:2, D:3, E:4, F:5, G:6, H:7, I:8, J:9, K:10, L:11, M:12, N:13,
  O:14, P:15, Q:16, R:17, S:18, T:19, U:20, V:21, W:22, X:23, Y:24, Z:25,
}
const CF_CHECK_LETTERA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function validaCodiceFiscale(cf) {
  if (!cf) return null
  const c = String(cf).trim().toUpperCase()
  // Se è di 11 cifre → CF azienda (=P.IVA)
  if (/^\d{11}$/.test(c)) {
    return validaPartitaIva(c)  // verifica check digit P.IVA
  }
  // Altrimenti CF privato: 16 caratteri formato standard
  if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(c)) {
    return 'CF non valido (formato atteso: 16 caratteri tipo RSSMRA80A01H501Z)'
  }
  // Check digit (carattere 16, indice 15)
  let sum = 0
  for (let i = 0; i < 15; i++) {
    const ch = c.charAt(i)
    sum += (i % 2 === 0) ? CF_DISPARI[ch] : CF_PARI[ch]
  }
  const expected = CF_CHECK_LETTERA.charAt(sum % 26)
  if (expected !== c.charAt(15)) {
    return 'CF con check digit non valido'
  }
  return null
}

/**
 * Validatore aggregato: passa un oggetto con i campi da validare e ottiene
 * un dizionario con i messaggi d'errore (chiave → stringa errore o null).
 */
export function validaCampiCliente({ email, piva, cf }) {
  return {
    email: validaEmail(email),
    piva:  piva  ? validaPartitaIva(piva) : null,
    cf:    cf    ? validaCodiceFiscale(cf) : null,
  }
}

/**
 * Helper: dato un dizionario di errori, ritorna un array di stringhe non-null.
 * Utile per costruire un messaggio aggregato per il confirm.
 */
export function erroriComeArray(errors) {
  return Object.entries(errors)
    .filter(([_, v]) => v)
    .map(([k, v]) => `• ${labelCampo(k)}: ${v}`)
}

function labelCampo(k) {
  return ({
    email: 'Email',
    piva: 'P.IVA',
    cf: 'Codice Fiscale',
  })[k] || k
}

/**
 * Mostra un confirm con i messaggi di errore e ritorna true se l'utente
 * vuole comunque procedere ("Inserisci comunque").
 * False se vuole annullare e correggere.
 */
export function confermaInserimentoForzato(errors) {
  const messaggi = erroriComeArray(errors)
  if (messaggi.length === 0) return true
  const testo = `Alcuni dati non superano il controllo:\n\n${messaggi.join('\n')}\n\nVuoi salvare comunque?`
  return window.confirm(testo)
}
