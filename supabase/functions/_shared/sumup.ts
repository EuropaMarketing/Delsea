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
