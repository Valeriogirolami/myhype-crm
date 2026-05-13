/**
 * AuthContext — gestione centralizzata dell'utente loggato.
 *
 * Espone:
 *  - user       → oggetto Supabase Auth (id, email, ...)
 *  - profile    → riga dalla tabella public.utenti (nome, cognome, ruolo, ...)
 *  - loading    → true finché non sappiamo se c'è una sessione
 *  - signIn()   → login via email + password
 *  - signOut()  → logout
 *
 * Pattern usato:
 *  Ci affidiamo a onAuthStateChange che spara SUBITO un evento INITIAL_SESSION
 *  al mount con la sessione persistita (se esiste). Così evitiamo di chiamare
 *  getSession() che in dev può restare bloccato sul lock di Supabase quando
 *  React monta 2 volte in StrictMode.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Evita re-fetch inutili se l'id utente non è cambiato
  const lastLoadedId = useRef(null)

  async function loadProfile(userId) {
    if (!userId) {
      setProfile(null)
      lastLoadedId.current = null
      return
    }
    if (lastLoadedId.current === userId) return
    lastLoadedId.current = userId

    // Log di diagnostica — ci aiuta a vedere cosa succede se c'è un errore
    console.log('[Auth] Leggo profilo per userId:', userId)

    const { data, error } = await supabase
      .from('utenti')
      .select('*')
      .eq('id', userId)
      .maybeSingle()  // ritorna null invece di errore se 0 righe

    if (error) {
      console.error('[Auth] Errore lettura profilo utenti:', error)
      setProfile(null)
      // Ripristino lastLoadedId così un retry futuro è possibile
      lastLoadedId.current = null
    } else if (!data) {
      console.warn('[Auth] Nessuna riga utenti trovata per userId:', userId)
      setProfile(null)
      lastLoadedId.current = null
    } else {
      console.log('[Auth] Profilo letto correttamente:', data)
      setProfile(data)
    }
  }

  useEffect(() => {
    let mounted = true

    // Safety net: se qualcosa va storto, dopo 6s forziamo loading=false
    // così almeno l'utente non resta con il loading infinito.
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 6000)

    // onAuthStateChange spara INITIAL_SESSION all'avvio con la sessione
    // salvata (se c'è) — gestiamo tutto da qui.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      await loadProfile(session?.user?.id)
      setLoading(false)
    })

    return () => {
      mounted = false
      clearTimeout(safetyTimer)
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    lastLoadedId.current = null
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const value = { user, profile, loading, signIn, signOut }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro <AuthProvider>')
  return ctx
}
