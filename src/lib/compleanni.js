/**
 * Helper compleanni collaboratori.
 *
 * Un compleanno è "oggi" quando mese e giorno di `data_nascita` coincidono
 * con la data odierna (l'anno è ignorato).
 *
 * Scope:
 *  - HR / DV / AS / TM: tutti i collaboratori attivi nel loro scope
 *  - PdV: solo collaboratori associati al proprio PdV (via pdv_collaboratori)
 *
 * Admin/BO NON vedono la notifica in home (scelta prodotto §2026-07).
 */
import { supabase } from './supabase'

// Ritorna true se una stringa YYYY-MM-DD ha mese e giorno uguali a oggi
function eOggi(dataNascita) {
  if (!dataNascita) return false
  const d = new Date(dataNascita)
  const oggi = new Date()
  return d.getMonth() === oggi.getMonth() && d.getDate() === oggi.getDate()
}

/**
 * Compleanni di OGGI, filtrati per lo scope del profilo.
 * Ritorna: [{ id, nome, cognome, ruolo, pdvs: [{id, nome}] }]
 */
export async function fetchCompleanniOggi(profile) {
  if (!profile) return []
  const ruolo = profile.ruolo

  // Admin/BO: nessuna notifica compleanno in home
  if (ruolo === 'admin' || ruolo === 'bo') return []

  // Costruisco la query base: collaboratori attivi con data_nascita valorizzata
  let q = supabase
    .from('collaboratori')
    .select(`
      id, nome, cognome, ruolo, data_nascita,
      pdv_collaboratori(pdv:pdv(id, nome))
    `)
    .eq('stato', 'attivo')
    .not('data_nascita', 'is', null)

  // Filtro per scope PdV
  if (ruolo === 'pdv') {
    // Solo collaboratori assegnati al proprio PdV
    const { data: mieiPdv } = await supabase
      .from('pdv')
      .select('id')
      .eq('account_id', profile.id)
    const pdvIds = (mieiPdv || []).map(p => p.id)
    if (pdvIds.length === 0) return []
    // Filtro tramite tabella ponte
    const { data: assocs } = await supabase
      .from('pdv_collaboratori')
      .select('collaboratore_id')
      .in('pdv_id', pdvIds)
    const collabIds = Array.from(new Set((assocs || []).map(a => a.collaboratore_id)))
    if (collabIds.length === 0) return []
    q = q.in('id', collabIds)
  } else if (ruolo === 'as' || ruolo === 'tm') {
    // AS/TM: solo collaboratori dei PdV assegnati (via pdv_collaboratori del mio account)
    const { data: mioColl } = await supabase
      .from('collaboratori')
      .select('id')
      .eq('account_id', profile.id)
      .maybeSingle()
    if (!mioColl) return []
    const ruoloPdv = ruolo === 'as' ? 'as' : 'tm'
    const { data: mieiPdvColl } = await supabase
      .from('pdv_collaboratori')
      .select('pdv_id')
      .eq('collaboratore_id', mioColl.id)
      .eq('ruolo_nel_pdv', ruoloPdv)
    const pdvIds = (mieiPdvColl || []).map(a => a.pdv_id)
    if (pdvIds.length === 0) return []
    const { data: assocs } = await supabase
      .from('pdv_collaboratori')
      .select('collaboratore_id')
      .in('pdv_id', pdvIds)
    const collabIds = Array.from(new Set((assocs || []).map(a => a.collaboratore_id)))
    if (collabIds.length === 0) return []
    q = q.in('id', collabIds)
  }
  // HR / DV: nessun filtro aggiuntivo, vedono tutta la rete

  const { data, error } = await q
  if (error) {
    console.error('[compleanni] fetch:', error.message)
    return []
  }

  // Filtro finale per data odierna (client-side: pochi record)
  return (data || [])
    .filter(c => eOggi(c.data_nascita))
    .map(c => ({
      id: c.id,
      nome: c.nome,
      cognome: c.cognome,
      ruolo: c.ruolo,
      pdvs: (c.pdv_collaboratori || [])
        .map(r => r.pdv)
        .filter(Boolean)
        .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i),
    }))
}
