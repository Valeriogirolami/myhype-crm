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
 * Notifica ai destinatari (PdV proprietario + TM del PdV) per KO contratto.
 * Da chiamare DOPO un cambio stato a 'ko' o 'ko_non_validato'.
 */
export async function notificaKoContratto({ contrattoId, pdvId, tipoKo, motivo, clienteNome }) {
  try {
    // Trovo l'account del PdV (account_id sul pdv)
    const { data: pdv } = await supabase
      .from('pdv').select('id, nome, account_id').eq('id', pdvId).maybeSingle()

    // Trovo i TM del PdV (collaboratori con ruolo_nel_pdv='tm' che hanno account_id)
    const { data: tmAssoc } = await supabase
      .from('pdv_collaboratori')
      .select('collaboratori(account_id)')
      .eq('pdv_id', pdvId)
      .eq('ruolo_nel_pdv', 'tm')

    const destinatari = new Set()
    if (pdv?.account_id) destinatari.add(pdv.account_id)
    for (const t of tmAssoc || []) {
      if (t.collaboratori?.account_id) destinatari.add(t.collaboratori.account_id)
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
 * Notifica Top 3 (§13 / §10.4) — da chiamare dopo creazione/modifica contratto.
 *
 * Ricalcola le classifiche del mese e, se PdV o venditore è in top 3 e non
 * ha già ricevuto la notifica per quel mese/categoria, ne crea una.
 *
 * Idempotente per mese: usa un marker nel testo della notifica per evitare
 * duplicati. Marker formato: "[top3:<categoria>:<YYYY-MM>:<id>]"
 */
export async function notificaTop3PerMese(ym) {
  try {
    // 1) Contratti del mese (per data sottoscrizione, stati produttivi)
    const start = `${ym}-01`
    // ultimo giorno del mese
    const [y, m] = ym.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    const end = `${ym}-${String(last).padStart(2, '0')}`

    const { data: contratti, error } = await supabase
      .from('contratti')
      .select(`
        id, prodotto, stato, punti_snap,
        pdv:pdv(id, nome, account_id),
        venditore:collaboratori(id, nome, cognome, account_id),
        contratto_sottoprodotti(sottoprodotti(punti))
      `)
      .gte('data_sottoscrizione', start)
      .lte('data_sottoscrizione', end)
      .in('stato', ['validato', 'gettonato', 'stornato'])
    if (error) throw error

    // 2) Calcolo top 3 PdV per ciascun prodotto
    const top3PerProdotto = {}
    for (const prodotto of ['mobile', 'fisso', 'energia']) {
      const map = new Map()
      for (const c of contratti || []) {
        if (c.prodotto !== prodotto || !c.pdv?.id) continue
        const cur = map.get(c.pdv.id) || { ...c.pdv, count: 0 }
        cur.count += 1
        map.set(c.pdv.id, cur)
      }
      top3PerProdotto[prodotto] = Array.from(map.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
    }

    // 3) Top 3 venditori per punti totali
    const venMap = new Map()
    for (const c of contratti || []) {
      const v = c.venditore
      if (!v?.id) continue
      const punti = (c.stato === 'gettonato' || c.stato === 'stornato')
        ? (c.punti_snap || 0)
        : (c.contratto_sottoprodotti || []).reduce((s, r) => s + (r.sottoprodotti?.punti || 0), 0)
      const cur = venMap.get(v.id) || {
        id: v.id, nome: v.nome, cognome: v.cognome, account_id: v.account_id, punti: 0,
      }
      cur.punti += punti
      // Salvo anche un PdV di riferimento per trovare TM/AS (uno qualunque dei suoi contratti)
      cur.pdv_id = c.pdv?.id
      venMap.set(v.id, cur)
    }
    const top3Venditori = Array.from(venMap.values())
      .sort((a, b) => b.punti - a.punti)
      .slice(0, 3)

    // 4) Genero notifiche, evitando duplicati
    const notificheDaCreare = []

    // Helper: trova destinatari di un PdV (account PdV + TM + AS del PdV)
    async function destinatariDelPdv(pdvId) {
      if (!pdvId) return []
      const ids = new Set()
      const { data: pdv } = await supabase
        .from('pdv').select('account_id').eq('id', pdvId).maybeSingle()
      if (pdv?.account_id) ids.add(pdv.account_id)
      const { data: assoc } = await supabase
        .from('pdv_collaboratori')
        .select('ruolo_nel_pdv, collaboratori(account_id)')
        .eq('pdv_id', pdvId)
        .in('ruolo_nel_pdv', ['tm', 'as'])
      for (const a of assoc || []) {
        if (a.collaboratori?.account_id) ids.add(a.collaboratori.account_id)
      }
      return Array.from(ids)
    }

    // Top 3 PdV per prodotto
    for (const prodotto of ['mobile', 'fisso', 'energia']) {
      const labelProd = prodotto.charAt(0).toUpperCase() + prodotto.slice(1)
      const top3 = top3PerProdotto[prodotto]
      for (let i = 0; i < top3.length; i++) {
        const pos = i + 1
        const p = top3[i]
        const marker = `[top3:pdv:${prodotto}:${ym}:${p.id}]`
        const dest = await destinatariDelPdv(p.id)
        for (const d of dest) {
          // Verifica esistenza
          const { data: ex } = await supabase
            .from('notifiche').select('id')
            .eq('destinatario', d).like('testo', `%${marker}%`).limit(1)
          if (ex && ex.length > 0) continue
          notificheDaCreare.push({
            destinatario: d,
            titolo: `🏆 ${pos}° posto Top ${labelProd}`,
            testo: `Complimenti! ${p.nome} è entrato nella top 3 ${labelProd} di ${ym}. ${marker}`,
            link: '/classifiche',
          })
        }
      }
    }

    // Top 3 venditori per punti
    for (let i = 0; i < top3Venditori.length; i++) {
      const pos = i + 1
      const v = top3Venditori[i]
      const marker = `[top3:vend:punti:${ym}:${v.id}]`
      // Destinatari: l'account venditore (se esiste) + TM/AS del PdV di riferimento + PdV stesso
      const dest = new Set()
      if (v.account_id) dest.add(v.account_id)
      const altri = await destinatariDelPdv(v.pdv_id)
      altri.forEach(a => dest.add(a))
      for (const d of dest) {
        const { data: ex } = await supabase
          .from('notifiche').select('id')
          .eq('destinatario', d).like('testo', `%${marker}%`).limit(1)
        if (ex && ex.length > 0) continue
        notificheDaCreare.push({
          destinatario: d,
          titolo: `🏆 ${pos}° posto Top venditori`,
          testo: `${v.nome} ${v.cognome} è in top 3 venditori per punti di ${ym}. ${marker}`,
          link: '/classifiche',
        })
      }
    }

    if (notificheDaCreare.length > 0) {
      await creaNotifiche(notificheDaCreare)
    }
  } catch (err) {
    console.error('[notifiche/top3]:', err.message)
  }
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
    rifiuto_cliente: 'Rifiuto cliente',
    ko_tecnico: 'KO tecnico',
    ko_credito: 'KO credito',
    ko_altro: 'KO altro motivo',
  })[motivo] || motivo
}
