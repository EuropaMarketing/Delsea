import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/sumup.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Self-service account deletion: removes the caller's own login so they can no
// longer sign in. Their customer/booking records are kept (detached from the
// login via user_id = null) since the business needs those for its own
// records — this only removes the ability to sign in, not the appointment history.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) return json({ error: 'Not authenticated' }, 401)

    await supabaseAdmin.from('customers').update({ user_id: null }).eq('user_id', caller.id)

    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(caller.id)
    if (deleteErr) return json({ error: deleteErr.message }, 400)

    return json({ success: true })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
