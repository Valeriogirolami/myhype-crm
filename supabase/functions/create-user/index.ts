/**
 * Edge Function: create-user
 *
 * Crea un nuovo account applicativo MyHype.
 * - Solo un chiamante con ruolo admin o bo può invocarla (§11)
 * - Usa la service_role key per creare l'utente in auth.users
 * - Inserisce la riga corrispondente in public.utenti
 * - Rollback dell'auth user se l'insert fallisce
 *
 * Body JSON:
 *   {
 *     email:    string,
 *     password: string (min 8),
 *     nome:     string,
 *     cognome:  string,
 *     ruolo:    'admin' | 'bo' | 'dv' | 'as' | 'tm' | 'pdv',
 *     pdv_id?:  string  // solo se ruolo === 'pdv'
 *   }
 *
 * Nota tecnica (workaround ES256):
 * I nuovi progetti Supabase firmano i JWT con ES256. Sia il runtime di
 * Edge Functions sia la libreria @supabase/supabase-js v2 (in alcune build)
 * danno "Unsupported JWT algorithm ES256". Workaround:
 *  1. config.toml → verify_jwt = false → il runtime non rifiuta più la chiamata
 *  2. Verifichiamo NOI il JWT con un fetch diretto a /auth/v1/user, che
 *     funziona indipendentemente dall'algoritmo perché tutto il lavoro
 *     crittografico avviene server-side su Supabase.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const RUOLI_VALIDI = ['admin', 'bo', 'dv', 'as', 'tm', 'pdv', 'hr']

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/**
 * Verifica un JWT chiamando direttamente l'endpoint user di Supabase.
 * Bypassa qualsiasi parsing JWT lato client → funziona con ES256.
 * Ritorna l'oggetto user oppure null se non valido.
 */
async function verificaJwtTramiteApi(jwt: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
  })
  if (!res.ok) return null
  return await res.json()
}

/** Wrapper per la REST API PostgREST con service_role */
async function pgrest(method: string, path: string, body?: unknown) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    // deno-lint-ignore no-explicit-any
    const err = (data as any)?.message || (data as any)?.hint || text || `HTTP ${res.status}`
    throw new Error(err)
  }
  return data
}

/** Wrapper per le Auth Admin API */
async function authAdmin(method: string, path: string, body?: unknown) {
  const url = `${SUPABASE_URL}/auth/v1/admin/${path}`
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    // deno-lint-ignore no-explicit-any
    const err = (data as any)?.msg || (data as any)?.error_description || (data as any)?.message || text || `HTTP ${res.status}`
    throw new Error(err)
  }
  return data
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1) JWT del chiamante
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Manca header Authorization' }, 401)
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return json({ error: 'JWT vuoto' }, 401)

    // 2) Verifico via API Supabase (compatibile ES256)
    const user = await verificaJwtTramiteApi(jwt)
    if (!user || !user.id) return json({ error: 'JWT non valido' }, 401)

    // 3) Verifica ruolo del chiamante
    const callerRows = await pgrest('GET', `utenti?id=eq.${user.id}&select=ruolo,attivo`) as Array<{ruolo: string, attivo: boolean}>
    const caller = callerRows?.[0]
    if (!caller) return json({ error: 'Profilo chiamante non trovato' }, 403)
    if (!caller.attivo) return json({ error: 'Account chiamante non attivo' }, 403)
    // Admin, BO e HR possono creare account (HR aggiunto 2026-07)
    if (!['admin', 'bo', 'hr'].includes(caller.ruolo)) {
      return json({ error: 'Solo Admin, Back Office o HR possono creare account' }, 403)
    }

    // 4) Parsing input
    const inputBody = await req.json()

    // Sicurezza: solo Admin può creare altri Admin (BO e HR non possono)
    if ((caller.ruolo === 'bo' || caller.ruolo === 'hr') && inputBody?.ruolo === 'admin') {
      return json({ error: 'Solo un Admin può creare account Admin.' }, 403)
    }
    // Inoltro a step 5 senza rifare la req.json()
    const body = inputBody
    const email    = String(body.email    ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const nome     = String(body.nome     ?? '').trim()
    const cognome  = String(body.cognome  ?? '').trim()
    const ruolo    = String(body.ruolo    ?? '').trim()
    const pdv_id   = body.pdv_id ? String(body.pdv_id) : null

    if (!email || !password || !nome || !cognome || !ruolo) {
      return json({ error: 'Campi obbligatori mancanti' }, 400)
    }
    if (password.length < 8) {
      return json({ error: 'La password deve avere almeno 8 caratteri' }, 400)
    }
    if (!RUOLI_VALIDI.includes(ruolo)) {
      return json({ error: `Ruolo non valido. Ammessi: ${RUOLI_VALIDI.join(', ')}` }, 400)
    }
    if (ruolo === 'pdv' && !pdv_id) {
      return json({ error: 'Per ruolo "pdv" è obbligatorio il pdv_id' }, 400)
    }

    // 5) Crea utente auth via Auth Admin API
    type AuthCreatedUser = { id: string }
    const created = await authAdmin('POST', 'users', {
      email,
      password,
      email_confirm: true,
      user_metadata: { nome, cognome },
    }) as AuthCreatedUser
    if (!created?.id) {
      return json({ error: 'Creazione auth fallita: user.id mancante' }, 400)
    }

    // 6) Insert in public.utenti
    try {
      await pgrest('POST', 'utenti', {
        id: created.id,
        email,
        nome,
        cognome,
        ruolo,
        attivo: true,
      })
    } catch (insertErr) {
      // rollback dell'auth user
      try { await authAdmin('DELETE', `users/${created.id}`) } catch {/* swallow */}
      // deno-lint-ignore no-explicit-any
      return json({ error: `Inserimento utente fallito: ${(insertErr as any).message}` }, 400)
    }

    // 7) Se ruolo=pdv: collega l'account al PdV
    if (ruolo === 'pdv' && pdv_id) {
      try {
        await pgrest('PATCH', `pdv?id=eq.${pdv_id}`, { account_id: created.id })
      } catch (linkErr) {
        // deno-lint-ignore no-explicit-any
        console.warn('[create-user] link PdV fallito:', (linkErr as any).message)
      }
    }

    return json({
      success: true,
      user: { id: created.id, email, nome, cognome, ruolo },
    })
  } catch (err) {
    // deno-lint-ignore no-explicit-any
    return json({ error: (err as any)?.message ?? 'Errore interno' }, 500)
  }
})
