import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/sumup.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Verify caller is an authenticated admin.
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) return json({ error: 'Not authenticated' }, 401)

    const { data: adminStaff } = await supabaseAdmin
      .from('staff')
      .select('id')
      .eq('user_id', caller.id)
      .eq('role', 'admin')
      .single()
    if (!adminStaff) return json({ error: 'Not authorised — admin role required' }, 403)

    const { staff_id, email, password } = await req.json() as {
      staff_id: string
      email: string
      password: string
    }
    if (!staff_id || !email || !password) return json({ error: 'staff_id, email and password are required' }, 400)

    // Load current staff record to check if a login already exists.
    const { data: staffRow } = await supabaseAdmin
      .from('staff')
      .select('user_id')
      .eq('id', staff_id)
      .single()

    if (staffRow?.user_id) {
      // Login already exists — update the password only.
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
        staffRow.user_id,
        { email, password },
      )
      if (updateErr) return json({ error: updateErr.message }, 400)
      return json({ success: true, action: 'updated' })
    }

    // Create a new auth user (skip email confirmation so they can log in immediately).
    const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr) return json({ error: createErr.message }, 400)

    // Link the new auth user to the staff record.
    await supabaseAdmin
      .from('staff')
      .update({ user_id: authData.user.id })
      .eq('id', staff_id)

    return json({ success: true, action: 'created', user_id: authData.user.id })
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
