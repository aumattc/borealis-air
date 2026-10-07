import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatPrice } from '../data/products'
import { confirmMockPayment, fetchOrder, type ApiOrder } from '../lib/api'

/**
 * Development stand-in for the Stripe-hosted checkout page.
 *
 * In production the shopper never sees this: `createOrder` returns a Stripe
 * Checkout URL and the browser goes there instead. When the mock provider is
 * configured, the API points the browser here so the full redirect-and-return
 * flow can be exercised locally. Payment is settled through the same signed
 * webhook the real provider uses — this page only triggers that webhook.
 */
export function MockCheckout() {
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref') ?? ''
  const intentId = searchParams.get('intent') ?? ''
  const sessionId = searchParams.get('session') ?? ''

  const [total, setTotal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ref) return
    let cancelled = false
    fetchOrder(ref)
      .then((order: ApiOrder) => {
        if (!cancelled) setTotal(Math.round(order.totalCents / 100))
      })
      .catch(() => {
        if (!cancelled) setError('We could not load that order.')
      })
    return () => {
      cancelled = true
    }
  }, [ref])

  const settle = async (outcome: 'succeed' | 'fail') => {
    if (!intentId) {
      setError('This payment session is missing its reference.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await confirmMockPayment(intentId, outcome)
      // Return the way Stripe would, so the confirmation page runs its
      // normal "wait for the webhook" path.
      window.location.assign(outcome === 'succeed' ? `/order/${ref}?checkout=success` : `/cart?checkout=cancelled`)
    } catch {
      setError('We could not complete the simulated payment.')
      setBusy(false)
    }
  }

  return (
    <div className="wrap cart">
      <div className="panel" style={{ maxWidth: 560, margin: '4rem auto', padding: '2rem' }}>
        <p className="eyebrow">Secure payment</p>
        <h1 className="display" style={{ fontSize: 'clamp(1.6rem,3.5vw,2.2rem)' }}>
          Simulated <em>checkout.</em>
        </h1>
        <p className="lede">
          This store is running in development mode, so no real card is charged. The payment is
          settled through the same signed webhook Stripe would send.
        </p>

        <dl className="summary__rows" style={{ marginTop: '1.5rem' }}>
          <div>
            <dt>Order</dt>
            <dd className="mono">{ref || '—'}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd className="mono dim" style={{ fontSize: '0.75rem' }}>
              {sessionId || '—'}
            </dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>{total === null ? '—' : formatPrice(total)}</dd>
          </div>
        </dl>

        {error && (
          <p className="field__err" role="alert" style={{ marginTop: '1rem' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn--ember" onClick={() => void settle('succeed')} disabled={busy}>
            {busy ? 'Processing…' : `Pay ${total === null ? '' : formatPrice(total)}`}
          </button>
          <button className="btn btn--glacier" onClick={() => void settle('fail')} disabled={busy}>
            Simulate a decline
          </button>
        </div>

        <p className="summary__note dim" style={{ marginTop: '1rem' }}>
          Card details are never collected here. In production this step is handled entirely by
          Stripe.
        </p>

        <p style={{ marginTop: '1.5rem' }}>
          <Link to="/cart" className="dim">
            ← Back to cart
          </Link>
        </p>
      </div>
    </div>
  )
}
