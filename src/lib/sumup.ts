export type SumUpWidgetResponseType = 'sent' | 'invalid' | 'auth-screen' | 'error' | 'success' | 'fail'

export interface SumUpCardInstance {
  unmount: () => void
}

declare global {
  interface Window {
    SumUpCard?: {
      mount: (config: {
        id: string
        checkoutId: string
        onResponse: (type: SumUpWidgetResponseType, body: unknown) => void
      }) => SumUpCardInstance
    }
  }
}

let loadPromise: Promise<void> | null = null

export function loadSumUpSdk(): Promise<void> {
  if (window.SumUpCard) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load SumUp payment SDK'))
    document.head.appendChild(script)
  })
  return loadPromise
}
