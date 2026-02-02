import { supabase } from '@/lib/supabase'
import { Session } from '@supabase/supabase-js'
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { AppState } from 'react-native'

interface AuthContextValue {
  session: Session | null
  initializing: boolean
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [initializing, setInitializing] = useState(true)

  const refreshSession = async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session ?? null)
  }

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session ?? null)
      setInitializing(false)
    }

    init()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session ?? null)
        setInitializing(false)
      }
    )

    // ✅ When app returns to foreground, refresh session
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshSession()
      }
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
      sub.remove()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    // no need to setSession(null) because onAuthStateChange will fire
  }

  return (
    <AuthContext.Provider
      value={{ session, initializing, signOut, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
