/**
 * Client Supabase condiviso per tutta l'app.
 * Usa la "publishable key" (equivalente della vecchia anon key) — sicura lato frontend.
 * Le variabili vengono da .env.local (prefisso VITE_ per essere esposte).
 *
 * Nota importante sul `lock`:
 * Supabase Auth usa di default l'API navigator.locks per evitare race condition
 * fra più tab. In dev (HMR, React StrictMode, reload veloci) questo meccanismo
 * entra in loop con errori "Lock was stolen" che bloccano l'app.
 * Siamo una SPA single-tab per utente → sostituiamo il lock con una no-op
 * che esegue la funzione direttamente. Sicuro nel nostro caso d'uso.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.error(
    '[MyHype] Variabili Supabase mancanti. Controlla il file .env.local.'
  )
}

// Lock no-op: esegue subito la funzione senza acquisire alcun lock.
// Firma richiesta da Supabase: (name, acquireTimeout, fn) => Promise<R>
const noLock = async (_name, _acquireTimeout, fn) => fn()

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    lock: noLock,
  },
})
