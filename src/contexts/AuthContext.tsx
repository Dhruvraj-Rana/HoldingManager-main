import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, getSupabaseClient } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  isConfigured: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isConfigured, setIsConfigured] = useState(false)

  useEffect(() => {
    const configured = isSupabaseConfigured()
    setIsConfigured(configured)

    if (!configured) {
      setLoading(false)
      return
    }

    try {
      const client = getSupabaseClient()

      // Check if we're returning from OAuth callback
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const isOAuthCallback = hashParams.has('access_token') || hashParams.has('error')
      
      // Prevent redirect to localhost if we're on production
      const currentOrigin = window.location.origin
      const isLocalhost = currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')
      
      if (isOAuthCallback && !isLocalhost) {
        console.log('OAuth callback detected on production:', currentOrigin)
        // Ensure we stay on the current origin, don't let Supabase redirect to localhost
      }

      // Listen for auth changes (this will handle OAuth callbacks)
      const { data: { subscription } } = client.auth.onAuthStateChange(
        async (event, session) => {
          console.log('Auth state changed:', event, session?.user?.email)
          setSession(session)
          setUser(session?.user ?? null)
          setLoading(false)
          
          // Clean up URL hash after successful authentication
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && window.location.hash) {
            // Wait a bit to ensure session is fully processed
            setTimeout(() => {
              // Stay on current origin, don't redirect
              const cleanUrl = window.location.pathname + window.location.search
              const fullUrl = currentOrigin + cleanUrl
              console.log('Cleaning up URL, staying on:', fullUrl)
              window.history.replaceState(null, '', cleanUrl)
              
              // Double-check we're still on the correct origin
              if (window.location.origin !== currentOrigin && !isLocalhost) {
                console.warn('Origin changed! Redirecting back to:', currentOrigin)
                window.location.href = currentOrigin + cleanUrl
              }
            }, 500)
          }
        }
      )

      // Get initial session (this will also process OAuth callback if hash is present)
      client.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          console.error('Error getting session:', error)
        }
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
        
        // Clean up hash if we have a session or if it was an OAuth callback
        if ((session || isOAuthCallback) && window.location.hash) {
          setTimeout(() => {
            const cleanUrl = window.location.pathname + window.location.search
            const fullUrl = currentOrigin + cleanUrl
            console.log('Cleaning up OAuth callback URL, staying on:', fullUrl)
            window.history.replaceState(null, '', cleanUrl)
            
            // Prevent redirect to localhost on production
            if (window.location.origin !== currentOrigin && !isLocalhost) {
              console.warn('Detected redirect to different origin! Fixing to:', currentOrigin)
              window.location.href = currentOrigin + cleanUrl
            }
          }, 500)
        }
      }).catch((error) => {
        console.error('Error in getSession:', error)
        setLoading(false)
      })

      return () => subscription.unsubscribe()
    } catch (error) {
      console.error('Supabase initialization error:', error)
      setLoading(false)
    }
  }, [])

  const signInWithGoogle = async () => {
    if (!isConfigured) {
      throw new Error('Supabase is not configured. Please set up environment variables.')
    }
    const client = getSupabaseClient()
    // Use current origin with explicit path (works for both localhost and production)
    // Adding explicit "/" path helps avoid "requested path is invalid" errors
    const origin = window.location.origin
    const redirectUrl = `${origin}/`
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1')
    
    console.log('Current origin:', origin)
    console.log('Redirect URL:', redirectUrl)
    console.log('Is localhost:', isLocalhost)
    console.log('Full current URL:', window.location.href)
    
    // Validate that we're not accidentally using localhost in production
    if (!isLocalhost && origin.includes('localhost')) {
      console.error('ERROR: Detected localhost in production! This should not happen.')
    }
    
    try {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })
      
      if (error) {
        console.error('Error signing in with Google:', error)
        console.error('Error details:', {
          message: error.message,
          status: error.status,
          redirectUrl: redirectUrl
        })
        
        // Check if it's a redirect URL error
        if (error.message?.includes('invalid') || error.message?.includes('path')) {
          console.error('⚠️ This might be a redirect URL configuration issue in Supabase')
          console.error('Make sure your Vercel URL is added to Supabase Redirect URLs')
          console.error('And that Site URL in Supabase is set to your Vercel URL')
        }
        
        throw error
      }
      
      // OAuth will redirect, so we don't need to return anything
      if (data?.url) {
        console.log('Supabase OAuth URL:', data.url)
        // Verify the redirect URL is in the OAuth URL
        if (data.url.includes(redirectUrl)) {
          console.log('✓ Redirect URL confirmed in OAuth URL')
        } else {
          console.warn('⚠ Redirect URL mismatch!')
          console.warn('Expected:', redirectUrl)
          console.warn('OAuth URL contains:', data.url)
          console.warn('⚠ This might cause redirect to wrong URL. Check Supabase Site URL setting!')
        }
      }
    } catch (err: any) {
      console.error('OAuth sign-in failed:', err)
      if (err?.message?.includes('invalid') || err?.message?.includes('path')) {
        throw new Error(
          'Invalid redirect URL. Please check Supabase settings:\n' +
          '1) Site URL must include https:// (e.g., https://holding-manager.vercel.app)\n' +
          '2) Redirect URLs must include https:// (e.g., https://holding-manager.vercel.app/)\n' +
          '3) Add wildcard redirect: https://holding-manager.vercel.app/**'
        )
      }
      throw err
    }
  }

  const signOut = async () => {
    if (!isConfigured) {
      return
    }
    const client = getSupabaseClient()
    const { error } = await client.auth.signOut()
    if (error) {
      console.error('Error signing out:', error.message)
      throw error
    }
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, isConfigured, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

