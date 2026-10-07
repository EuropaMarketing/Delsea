import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/sumup.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Invites a manually-created client to set their own password, via Supabase
// Auth's built-in invite email — no separate email provider needed. Safe to
// call again for a customer who already has a login: it just re-sends a fresh
// reset link instead of creating a second account.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
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

    const { customer_id, email, redirect_to } = await req.json() as {
      customer_id: string
      email: string
      redirect_to: string
    }
    if (!customer_id || !email || !redirect_to) {
      return json({ error: 'customer_id, email and redirect_to are required' }, 400)
    }

    const { data: customerRow } = await supabaseAdmin
      .from('customers')
      .select('user_id')
      .eq('id', customer_id)
      .single()

    if (customerRow?.user_id) {
      // Already has a login — a fresh invite link would fail since the user
      // exists, so send them a password-reset link instead (same destination page).
      const { error: resetErr } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: redirect_to })
      if (resetErr) return json({ error: resetErr.message }, 400)
      return json({ success: true, action: 'resent' })
    }

    const { data: authData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirect_to,
    })
    if (inviteErr) return json({ error: inviteErr.message }, 400)

    await supabaseAdmin
      .from('customers')
      .update({ user_id: authData.user.id })
      .eq('id', customer_id)

    return json({ success: true, action: 'invited', user_id: authData.user.id })
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
