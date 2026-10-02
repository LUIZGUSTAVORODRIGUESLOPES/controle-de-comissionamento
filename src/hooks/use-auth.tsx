import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import type { AppUser } from '@/types/database'

interface AuthContextType {
  user: User | null
  appUser: AppUser | null
  session: Session | null
  signUp: (email: string, password: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<{ error: any }>
  refreshProfile: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (!error && data) {
        setAppUser(data as unknown as AppUser)
      } else {
        setAppUser(null)
      }
    } catch (e) {
      console.error('Erro ao buscar perfil:', e)
      setAppUser(null)
    }
  }

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // FORBIDDEN: no async/await inside this callback — sync only
      setSession(newSession)
      setUser(newSession?.user ?? null)
      if (!newSession?.user) {
        setAppUser(null)
        setLoading(false)
      } else {
        // Trigger profile fetch without awaiting inside callback
        fetchProfile(newSession.user.id).finally(() => {
          setLoading(false)
        })
      }
    })

    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      setSession(initSession)
      setUser(initSession?.user ?? null)
      if (initSession?.user) {
        fetchProfile(initSession.user.id).finally(() => {
          setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    return { error }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    setAppUser(null)
    setUser(null)
    setSession(null)
    return { error }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        appUser,
        session,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
