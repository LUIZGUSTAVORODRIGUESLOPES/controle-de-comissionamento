import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
  useCallback,
} from 'react'
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
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

  // Track active fetch requests to ignore obsolete responses during rapid auth changes
  const activeFetchUserIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)

  const fetchProfile = useCallback(async (userId: string) => {
    activeFetchUserIdRef.current = userId
    try {
      const { data, error } = await (supabase as any)
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (!isMountedRef.current) return
      // Discard if another user has taken over
      if (activeFetchUserIdRef.current !== userId) return

      if (!error && data) {
        setAppUser(data as unknown as AppUser)
      } else {
        setAppUser(null)
      }
    } catch (e) {
      if (!isMountedRef.current) return
      if (activeFetchUserIdRef.current !== userId) return
      console.error('Erro ao buscar perfil do usuário:', e)
      setAppUser(null)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    // Set up auth state listener
    // Note: It is strictly forbidden to use async/await inside the onAuthStateChange callback.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, newSession: Session | null) => {
      if (!isMountedRef.current) return

      setSession(newSession)
      const currentUser = newSession?.user ?? null
      setUser(currentUser)

      if (!currentUser) {
        activeFetchUserIdRef.current = null
        setAppUser(null)
        setLoading(false)
        return
      }

      // Trigger profile fetch asynchronously outside callback flow
      fetchProfile(currentUser.id).finally(() => {
        if (isMountedRef.current) {
          setLoading(false)
        }
      })
    })

    // Initial session bootstrap
    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      if (!isMountedRef.current) return

      setSession(initSession)
      const initUser = initSession?.user ?? null
      setUser(initUser)

      if (initUser) {
        fetchProfile(initUser.id).finally(() => {
          if (isMountedRef.current) {
            setLoading(false)
          }
        })
      } else {
        setLoading(false)
      }
    })

    return () => {
      isMountedRef.current = false
      activeFetchUserIdRef.current = null
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }, [fetchProfile, user?.id])

  // Native Supabase Auth delegation
  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    return { error }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    // Proactively clear user state and active refs for security
    activeFetchUserIdRef.current = null
    setAppUser(null)
    setUser(null)
    setSession(null)

    // Call Supabase signOut
    const { error } = await supabase.auth.signOut()
    return { error }
  }, [])

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
