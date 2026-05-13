/**
 * Edge Function: update-user-password
 *
 * Resetta la password di un altro utente. Solo admin/bo.
 *
 * Body JSON:
 *   { user_id: string, new_password: string (min 8) }
 *
 * Stesso workaround ES256 usato in create-user.
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

async function pgrest(method: string, path: string, body?: unknown) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
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
    throw new Error((data as any)?.message || text || `HTTP ${res.status}`)
  }
  return data
}

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
    throw new Error((data as any)?.msg || (data as any)?.error_description || text || `HTTP ${res.status}`)
  }
  return data
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

    const callerRows = await pgrest('GET', `utenti?id=eq.${user.id}&select=ruolo,attivo`) as Array<{ruolo: string, attivo: boolean}>
    const caller = callerRows?.[0]
    if (!caller?.attivo || !['admin', 'bo'].includes(caller.ruolo)) {
      return json({ error: 'Solo Admin o BO possono resettare password' }, 403)
    }

    const body = await req.json()
    const user_id = String(body.user_id ?? '').trim()
    const new_password = String(body.new_password ?? '')
    if (!user_id) return json({ error: 'user_id mancante' }, 400)
    if (new_password.length < 8) {
      return json({ error: 'La password deve avere almeno 8 caratteri' }, 400)
    }

    await authAdmin('PUT', `users/${user_id}`, { password: new_password })
    return json({ success: true })
  } catch (err) {
    // deno-lint-ignore no-explicit-any
    return json({ error: (err as any)?.message ?? 'Errore interno' }, 500)
  }
})
