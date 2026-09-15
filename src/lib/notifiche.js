/**
 * Helper per il sistema notifiche (§13).
 *
 * 4 eventi ufficiali:
 *  - Contratto "Da validare" fermo > 3 giorni → BO
 *  - Contratto va in KO (qualsiasi tipo) → PdV, TM
 *  - Venditore disattivato → BO (CTA cambio password PdV)
 *  - PdV o venditore entra in top 3 → PdV, TM, AS
 *
 * Le notifiche vengono inserite nella tabella public.notifiche.
 */
import { supabase } from './supabase'

/**
 * Crea una o più notifiche per più destinatari (utenti id).
 * Ignora silenziosamente i destinatari null/undefined.
 */
export async function creaNotifiche(items) {
  const valide = (items || []).filter(n => n?.destinatario)
  if (valide.length === 0) return { count: 0 }
  const { error } = await supabase.from('notifiche').insert(valide)
  if (error) console.error('[notifiche] insert errore:', error.message)
  return { count: valide.length, error }
}

/**
 * Restituisce le notifiche dell'utente, ordinate dalla più recente.
 */
export async function fetchNotifiche(userId, opts = {}) {
  const { limit = 30, soloNonLette = false } = opts
  let q = supabase
    .from('notifiche')
    .select('*')
    .eq('destinatario', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (soloNonLette) q = q.eq('letta', false)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

/**
 * Conta le notifiche non lette dell'utente.
 */
export async function contaNonLette(userId) {
  const { count, error } = await supabase
    .from('notifiche')
    .select('*', { count: 'exact', head: true })
    .eq('destinatario', userId)
    .eq('letta', false)
  if (error) throw error
  return count || 0
}

/**
 * Marca una notifica come letta.
 */
export async function marcaLetta(notificaId) {
  const { error } = await supabase
    .from('notifiche')
    .update({ letta: true })
    .eq('id', notificaId)
  if (error) throw error
}

/**
 * Marca tutte le notifiche dell'utente come lette.
 */
export async function marcaTutteLette(userId) {
  const { error } = await supabase
    .from('notifiche')
    .update({ letta: true })
    .eq('destinatario', userId)
    .eq('letta', false)
  if (error) throw error
}

// --------------------------------------------------------------------------
// Helper specifici per i 4 eventi del SPEC §13
// --------------------------------------------------------------------------

/**
 * Notifica ai destinatari (PdV proprietario + TM + AS del PdV) per KO contratto.
 * Da chiamare DOPO un cambio stato a 'ko' o 'ko_non_validato'.
 *
 * Destinatari (§2026-07):
 *  - Account PdV proprietario (pdv.account_id)
 *  - Tutti i TM assegnati al PdV (pdv_collaboratori.ruolo_nel_pdv='tm')
 *  - Tutti gli AS assegnati al PdV (pdv_collaboratori.ruolo_nel_pdv='as')
 */
export async function notificaKoContratto({ contrattoId, pdvId, tipoKo, motivo, clienteNome }) {
  try {
    // Trovo l'account del PdV (account_id sul pdv)
    const { data: pdv } = await supabase
      .from('pdv').select('id, nome, account_id').eq('id', pdvId).maybeSingle()

    // Trovo i TM E gli AS del PdV in una singola query
    // (collaboratori con ruolo_nel_pdv in tm/as che hanno account_id)
    const { data: managerAssoc } = await supabase
      .from('pdv_collaboratori')
      .select('ruolo_nel_pdv, collaboratori(account_id)')
      .eq('pdv_id', pdvId)
      .in('ruolo_nel_pdv', ['tm', 'as'])

    const destinatari = new Set()
    if (pdv?.account_id) destinatari.add(pdv.account_id)
    for (const m of managerAssoc || []) {
      if (m.collaboratori?.account_id) destinatari.add(m.collaboratori.account_id)
    }

    const titolo = tipoKo === 'ko_non_validato'
      ? `Contratto in KO non validato`
      : `Contratto in KO`
    const motivoStr = formatMotivo(motivo, tipoKo)
    const testo = `${clienteNome || 'Contratto'} · ${motivoStr}${pdv?.nome ? ` · ${pdv.nome}` : ''}`

    const items = Array.from(destinatari).map(d => ({
      destinatario: d,
      titolo,
      testo,
      link: `/contratti?id=${contrattoId}`,
    }))
    return await creaNotifiche(items)
  } catch (err) {
    console.error('[notifiche/ko-contratto]:', err.message)
  }
}

/**
 * Notifica al BO per disattivazione venditore (con CTA cambio password PdV).
 */
export async function notificaVenditoreDisattivato({ collaboratoreId, nomeVenditore }) {
  try {
    // Trovo i PdV in cui era assegnato il venditore (per dare contesto al messaggio)
    const { data: assoc } = await supabase
      .from('pdv_collaboratori')
      .select('pdv:pdv(id, nome)')
      .eq('collaboratore_id', collaboratoreId)
      .eq('ruolo_nel_pdv', 'venditore')

    const pdvNomi = (assoc || [])
      .map(a => a.pdv?.nome).filter(Boolean).join(', ')

    // Tutti i BO attivi
    const { data: bos } = await supabase
      .from('utenti').select('id').eq('ruolo', 'bo').eq('attivo', true)

    if (!bos || bos.length === 0) return

    const testo = pdvNomi
      ? `Il venditore ${nomeVenditore} è stato disattivato (PdV: ${pdvNomi}). Ti ricordiamo di aggiornare la password dell'account PdV.`
      : `Il venditore ${nomeVenditore} è stato disattivato. Ti ricordiamo di aggiornare la password dell'account PdV.`

    const items = bos.map(b => ({
      destinatario: b.id,
      titolo: 'Venditore disattivato — verifica password PdV',
      testo,
      link: '/admin',
    }))
    return await creaNotifiche(items)
  } catch (err) {
    console.error('[notifiche/venditore-disattivato]:', err.message)
  }
}

/**
 * @deprecated 2026-09 — Notifiche Top 3 classifiche rimosse su richiesta
 * dell'utente (le classifiche si consultano già nella pagina dedicata,
 * senza bisogno di notifiche push). Manteniamo la funzione come no-op per
 * retrocompatibilità con eventuali chiamate ancora presenti.
 */
export async function notificaTop3PerMese(_ym) {
  // no-op — funzione mantenuta per retrocompatibilità
}


/**
 * Notifica al BO/Admin: ci sono contratti "Da validare" fermi da > 3 giorni (§13).
 *
 * Da chiamare al login (o a ogni mount Home) di un Admin/BO.
 * Idempotente per giorno: max 1 notifica per utente per giorno.
 * Marker: "[stale3gg:YYYY-MM-DD]"
 */
export async function checkContrattiFermiBO(userId) {
  try {
    if (!userId) return
    const oggi = new Date()
    const ymdToday = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`
    const marker = `[stale3gg:${ymdToday}]`

    // Già notificato oggi?
    const { data: ex } = await supabase
      .from('notifiche').select('id')
      .eq('destinatario', userId).like('testo', `%${marker}%`).limit(1)
    if (ex && ex.length > 0) return

    // Soglia 3 giorni fa
    const tresoglia = new Date()
    tresoglia.setDate(tresoglia.getDate() - 3)

    const { count, error } = await supabase
      .from('contratti')
      .select('*', { count: 'exact', head: true })
      .eq('stato', 'da_validare')
      .lt('created_at', tresoglia.toISOString())
    if (error) throw error
    if (!count || count === 0) return

    await creaNotifiche([{
      destinatario: userId,
      titolo: '⏰ Contratti fermi da > 3 giorni',
      testo: `Ci sono ${count} contratti in "Da validare" fermi da più di 3 giorni. Verificali quando puoi. ${marker}`,
      link: '/contratti',
    }])
  } catch (err) {
    console.error('[notifiche/stale-3gg]:', err.message)
  }
}

function formatMotivo(motivo, tipoKo) {
  if (!motivo) return tipoKo === 'ko_non_validato' ? 'KO non validato' : 'KO'
  return ({
    non_trovato: 'Non trovato',
    documenti_non_validi: 'Documenti non validi',
    manca_firma: 'Manca firma',
    manca_modulo_avvenuto_contatto: 'Manca modulo avvenuto contatto',
    rifiuto_cliente: 'Rifiuto cliente',
    ko_tecnico: 'KO tecnico',
    ko_credito: 'KO credito',
    ko_altro: 'KO altro motivo',
  })[motivo] || motivo
}
