import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthState {
  session: Session | null
  user: User | null
  /** True until the stored session (if any) has been read on startup. */
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, user: null, loading: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabase !== null)

  useEffect(() => {
    if (!supabase) return
    // Also completes email-confirmation links (?code=…) thanks to the PKCE flow.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>{children}</AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

/** Where Supabase should send people back to after confirming their email. */
export const authRedirectUrl = () => window.location.origin + import.meta.env.BASE_URL

/** Where the password-reset email link lands. */
export const resetRedirectUrl = () => authRedirectUrl() + 'reset-password'
