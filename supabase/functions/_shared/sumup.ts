const SUMUP_API_BASE = 'https://api.sumup.com'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function sumupFetch(path: string, init: RequestInit = {}) {
  const apiKey = Deno.env.get('SUMUP_API_KEY')
  if (!apiKey) throw new Error('SUMUP_API_KEY is not configured')
  return fetch(`${SUMUP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

// SumUp amounts are major units (pounds), our DB stores pence.
export function penceToMajor(pence: number): number {
  return Math.round(pence) / 100
}

export function majorToPence(major: number): number {
  return Math.round(major * 100)
}

export async function ensureSumupCustomer(customer: { id: string; name: string; email: string; phone: string | null }) {
  const [first_name, ...rest] = customer.name.trim().split(/\s+/)
  const last_name = rest.join(' ') || first_name
  const res = await sumupFetch('/v0.1/customers', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: customer.id,
      personal_details: {
        first_name,
        last_name,
        email: customer.email,
        phone: customer.phone ?? undefined,
      },
    }),
  })
  // 409 CUSTOMER_ALREADY_EXISTS just means we've seen this customer before — that's fine.
  if (!res.ok && res.status !== 409) {
    const body = await res.text()
    throw new Error(`Failed to create SumUp customer: ${res.status} ${body}`)
  }
}

export type SumupCheckout = {
  id: string
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED'
  payment_instrument?: { token: string }
}

// Charges a saved card token with no customer present (merchant-initiated transaction).
export async function chargeWithToken(opts: {
  merchantCode: string
  customerId: string
  token: string
  amountPence: number
  description: string
  returnUrl: string
  checkoutReference: string
}): Promise<{ checkoutId: string; status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' }> {
  const checkoutRes = await sumupFetch('/v0.1/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      checkout_reference: opts.checkoutReference,
      amount: penceToMajor(opts.amountPence),
      currency: 'GBP',
      merchant_code: opts.merchantCode,
      customer_id: opts.customerId,
      purpose: 'CHECKOUT',
      description: opts.description,
      return_url: opts.returnUrl,
    }),
  })
  if (!checkoutRes.ok) throw new Error(`Failed to create follow-up checkout: ${checkoutRes.status} ${await checkoutRes.text()}`)
  const checkout = await checkoutRes.json() as { id: string }

  const processRes = await sumupFetch(`/v0.1/checkouts/${checkout.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      payment_type: 'card',
      token: opts.token,
      customer_id: opts.customerId,
      mandate: { type: 'recurrent', user_agent: 'server', user_ip: '0.0.0.0' },
    }),
  })
  const processed = await processRes.json() as { status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' }
  return { checkoutId: checkout.id, status: processed.status }
}
