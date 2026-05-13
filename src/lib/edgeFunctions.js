/**
 * Helper per chiamare le Edge Function di Supabase dal frontend.
 * Il client Supabase allega automaticamente il JWT dell'utente loggato.
 *
 * Estrae il messaggio d'errore dettagliato dal body della Response per
 * mostrarlo nelle toast (altrimenti vedremmo solo "non-2xx status code").
 */
import { supabase } from './supabase'

async function estraiErroreDettagliato(error) {
  let detail = error?.message || 'Errore sconosciuto'
  try {
    // error.context è una Response — la cloniamo per non consumare l'originale
    const responseClone = error?.context?.clone?.()
    if (!responseClone) return detail
    const text = await responseClone.text()
    if (!text) return detail
    try {
      const j = JSON.parse(text)
      if (j?.error) return String(j.error)
      if (j?.message) return String(j.message)
      return text
    } catch {
      // Non è JSON: ritorno il testo grezzo (utile se la function va in crash)
      return text.length > 300 ? text.slice(0, 300) + '…' : text
    }
  } catch {
    return detail
  }
}

/**
 * Crea un nuovo account utente MyHype tramite Edge Function 'create-user'.
 */
export async function createUser(payload) {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: payload,
  })
  if (error) throw new Error(await estraiErroreDettagliato(error))
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Resetta la password di un altro utente.
 */
export async function updateUserPassword({ user_id, new_password }) {
  const { data, error } = await supabase.functions.invoke('update-user-password', {
    body: { user_id, new_password },
  })
  if (error) throw new Error(await estraiErroreDettagliato(error))
  if (data?.error) throw new Error(data.error)
  return data
}
