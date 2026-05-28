/**
 * Utility di export Excel (.xlsx) tramite SheetJS.
 *
 * - scaricaXlsx(sheets, nomeFile): genera un file con uno o più fogli.
 *   Ogni foglio = { nome, righe } dove righe è un array di oggetti piatti
 *   (le chiavi diventano le intestazioni di colonna).
 * - esportaDatabaseCompleto(): dump di tutte le tabelle principali in un
 *   unico file multi-foglio (uso admin).
 */
import { supabase } from '@/lib/supabase'

// xlsx è pesante (~300KB): lo carico in modo lazy solo al primo export,
// così non rallenta l'avvio dell'app per tutti gli utenti.
let _xlsx = null
async function getXLSX() {
  if (!_xlsx) _xlsx = await import('xlsx')
  return _xlsx
}

// Genera un timestamp leggibile per i nomi file: 2026-05-20_15-30
function timestamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`
}

/**
 * Crea e scarica un file .xlsx.
 * @param {{nome: string, righe: object[]}[]} sheets
 * @param {string} nomeBase  nome file senza estensione
 */
// Calcola larghezze colonne in base alla lunghezza massima dei contenuti
// (clamp tra 10 e 50 caratteri) — Excel le rispetta come hint.
function calcolaLarghezze(righe) {
  if (!righe.length) return []
  const chiavi = Object.keys(righe[0])
  return chiavi.map(k => {
    let maxLen = k.length
    for (const r of righe) {
      const v = r[k]
      if (v == null) continue
      const len = String(v).length
      if (len > maxLen) maxLen = len
    }
    return { wch: Math.min(50, Math.max(10, maxLen + 2)) }
  })
}

export async function scaricaXlsx(sheets, nomeBase) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()
  for (const { nome, righe } of sheets) {
    const dati = righe.length ? righe : [{}]
    const ws = XLSX.utils.json_to_sheet(dati)
    // Larghezza colonne automatica per leggibilità
    ws['!cols'] = calcolaLarghezze(dati)
    // Congela la prima riga (intestazioni sempre visibili durante lo scroll)
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }
    ws['!autofilter'] = { ref: ws['!ref'] }
    // Excel limita i nomi foglio a 31 caratteri e vieta alcuni simboli
    const nomeFoglio = (nome || 'Foglio').replace(/[\\/?*[\]:]/g, '').slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, nomeFoglio)
  }
  XLSX.writeFile(wb, `${nomeBase}_${timestamp()}.xlsx`)
}

// Tabelle del database da includere nell'export totale (admin)
const TABELLE_DB = [
  'utenti',
  'pdv',
  'collaboratori',
  'pdv_collaboratori',
  'clienti',
  'sottoprodotti',
  'contratti',
  'contratto_sottoprodotti',
  'target_base',
  'target_pdv_override',
  'gara_gallery_soglie',
  'notifiche',
]

/**
 * Esporta tutte le tabelle principali del database in un unico file
 * Excel multi-foglio. Restituisce il numero totale di righe esportate.
 * Le tabelle non leggibili (RLS) producono un foglio vuoto.
 */
export async function esportaDatabaseCompleto() {
  const sheets = []
  let totaleRighe = 0

  for (const tabella of TABELLE_DB) {
    const { data, error } = await supabase.from(tabella).select('*')
    if (error) {
      sheets.push({ nome: tabella, righe: [{ errore: error.message }] })
      continue
    }
    totaleRighe += (data || []).length
    sheets.push({ nome: tabella, righe: data || [] })
  }

  await scaricaXlsx(sheets, 'MyHype_database_completo')
  return totaleRighe
}
