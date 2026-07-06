import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export function useAuthListener() {
  const { setSession, setAdmin, setStaffInfo, setInitialized } = useAuthStore()

  useEffect(() => {
    supabase.auth.refreshSession().then(({ data, error }) => {
      if (error || !data.session) {
        supabase.auth.getSession().then(({ data: fallback }) => {
          setSession(fallback.session)
          if (fallback.session?.user) {
            checkStaffRole(fallback.session.user.id).then(() => setInitialized())
          } else {
            setInitialized()
          }
        })
        return
      }
      setSession(data.session)
      checkStaffRole(data.session.user.id).then(() => setInitialized())
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session?.user) {
        if (event === 'SIGNED_IN' && session.user.email) {
          supabase.rpc('link_customer_to_user', {
            p_user_id: session.user.id,
            p_email: session.user.email,
          })
        }
        checkStaffRole(session.user.id).then(() => setInitialized())
      } else {
        setAdmin(false)
        setStaffInfo(false, null)
        setInitialized()
      }
    })

    return () => subscription.unsubscribe()
  }, [setSession, setAdmin, setStaffInfo, setInitialized])

  async function checkStaffRole(userId: string) {
    const { data } = await supabase
      .from('staff')
      .select('id, role')
      .eq('user_id', userId)
      .maybeSingle()
    setAdmin(data?.role === 'admin')
    setStaffInfo(!!data, data?.id ?? null)
  }
}
