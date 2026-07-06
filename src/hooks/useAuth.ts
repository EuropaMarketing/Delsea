import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export function useAuthListener() {
  const { setSession, setAdmin, setInitialized } = useAuthStore()

  useEffect(() => {
    // Use refreshSession() instead of getSession() so we always start with a
    // valid non-expired access token. getSession() returns whatever is in
    // localStorage as-is — if the token has expired and the auto-refresh timer
    // wasn't running (e.g. page was reloaded), every subsequent DB request sends
    // an expired JWT, auth.uid() returns NULL, and all RLS checks fail silently.
    supabase.auth.refreshSession().then(({ data, error }) => {
      if (error || !data.session) {
        // Refresh failed (e.g. refresh token also expired) — fall back to whatever
        // is stored so the user gets the login redirect from ProtectedRoute.
        supabase.auth.getSession().then(({ data: fallback }) => {
          setSession(fallback.session)
          if (fallback.session?.user) {
            checkAdmin(fallback.session.user.id).then(() => setInitialized())
          } else {
            setInitialized()
          }
        })
        return
      }
      setSession(data.session)
      checkAdmin(data.session.user.id).then(() => setInitialized())
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session?.user) {
        // Link any guest customer records to this auth user on sign-in
        if (event === 'SIGNED_IN' && session.user.email) {
          supabase.rpc('link_customer_to_user', {
            p_user_id: session.user.id,
            p_email: session.user.email,
          })
        }
        checkAdmin(session.user.id).then(() => setInitialized())
      } else {
        setAdmin(false)
        setInitialized()
      }
    })

    return () => subscription.unsubscribe()
  }, [setSession, setAdmin, setInitialized])

  async function checkAdmin(userId: string) {
    const { data } = await supabase
      .from('staff')
      .select('id')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .single()
    setAdmin(!!data)
  }
}
