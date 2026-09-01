/**
 * Edge Function: delete-user
 *
 * Elimina completamente un account utente MyHype:
 *  - Riga in public.utenti (auto via CASCADE quando cancelliamo da auth.users)
 *  - Riga in auth.users (Auth Admin API)
 *  - Foreign key con SET NULL su pdv.account_id e collaboratori.account_id
 *    (lo scollega ma mantiene le anagrafiche)
 *
 * Regole di sicurezza:
 *  - Solo Admin o BO possono chiamarla (§11)
 *  - Un BO NON può cancellare account Admin
 *  - Un utente NON può cancellare se stesso (no auto-kick)
 *
 * Body JSON: { user_id: string }
 *
 * Nota tecnica: stesso workaround ES256 di create-user / update-user-password
 * (verifica JWT via API anziché in locale).
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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

async function pgrest(method: string, path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  })
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    // deno-lint-ignore no-explicit-any
    throw new Error((data as any)?.message || text || `HTTP ${res.status}`)
  }
  return data
}

async function authAdminDelete(userId: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Delete auth fallito: ${text || res.status}`)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Manca header Authorization' }, 401)
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return json({ error: 'JWT vuoto' }, 401)

    const user = await verificaJwtTramiteApi(jwt)
    if (!user || !user.id) return json({ error: 'JWT non valido' }, 401)

    // Profilo chiamante
    const callerRows = await pgrest(
      'GET', `utenti?id=eq.${user.id}&select=ruolo,attivo`
    ) as Array<{ ruolo: string, attivo: boolean }>
    const caller = callerRows?.[0]
    if (!caller?.attivo) return json({ error: 'Account chiamante non attivo' }, 403)
    // Admin, BO e HR possono eliminare account (HR aggiunto 2026-07)
    if (!['admin', 'bo', 'hr'].includes(caller.ruolo)) {
      return json({ error: 'Solo Admin, BO o HR possono eliminare account' }, 403)
    }

    // Input
    const body = await req.json()
    const target_id = String(body.user_id ?? '').trim()
    if (!target_id) return json({ error: 'user_id mancante' }, 400)

    // Sicurezza: no auto-kick
    if (target_id === user.id) {
      return json({ error: 'Non puoi eliminare il tuo stesso account' }, 400)
    }

    // Sicurezza: BO non può cancellare Admin
    const targetRows = await pgrest(
      'GET', `utenti?id=eq.${target_id}&select=ruolo,email`
    ) as Array<{ ruolo: string, email: string }>
    const target = targetRows?.[0]
    if (!target) return json({ error: 'Account da eliminare non trovato' }, 404)
    // Solo un Admin può eliminare un altro Admin (BO e HR non possono)
    if ((caller.ruolo === 'bo' || caller.ruolo === 'hr') && target.ruolo === 'admin') {
      return json({ error: 'Solo un Admin può eliminare un account Admin' }, 403)
    }

    // Eliminazione effettiva (auth.users → CASCADE su public.utenti)
    // collaboratori.account_id e pdv.account_id hanno ON DELETE SET NULL,
    // quindi le anagrafiche restano agganciate ma "scollegate" dall'account.
    await authAdminDelete(target_id)

    return json({ success: true, deleted: { id: target_id, email: target.email } })
  } catch (err) {
    // deno-lint-ignore no-explicit-any
    return json({ error: (err as any)?.message ?? 'Errore interno' }, 500)
  }
})
