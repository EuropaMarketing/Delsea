import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export function useAuthListener() {
  const { setSession, setAdmin, setInitialized } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        checkAdmin(data.session.user.id).then(() => setInitialized())
      } else {
        setInitialized()
      }
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
