import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { formatPrice } from '../data/products'
import type { Order } from '../lib/orders'
import { fetchOrder, toFrontendOrder, type ApiOrder } from '../lib/api'

export function Confirmation() {
  const { ref } = useParams()
  const [searchParams] = useSearchParams()
  const returnedFromCheckout = searchParams.get('checkout') === 'success'
  const [order, setOrder] = useState<Order | null | undefined>(undefined)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!ref) {
        setOrder(null)
        return
      }

      try {
        let apiOrder: ApiOrder = await fetchOrder(ref)
        if (cancelled) return

        // Returning from a hosted checkout, the webhook may not have landed
        // yet — give it a moment and poll rather than showing a stale status.
        const unsettled = apiOrder.paymentStatus === 'requires_payment' || apiOrder.paymentStatus === 'processing'
        if (returnedFromCheckout && unsettled) {
          setPending(true)
          for (let attempt = 0; attempt < 8 && unsettled; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 800))
            apiOrder = await fetchOrder(ref)
            if (cancelled) return
            if (apiOrder.paymentStatus !== 'requires_payment' && apiOrder.paymentStatus !== 'processing') break
          }
          setPending(false)
        }

        setOrder(toFrontendOrder(apiOrder))
      } catch {
        if (!cancelled) setOrder(null)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [ref, returnedFromCheckout])

  if (order === undefined) return null

  if (order === null) {
    return (
      <div className="wrap cart">
        <div className="empty panel">
          <p className="eyebrow">Order</p>
          <h1 className="display" style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>
            We cannot find <em>that order.</em>
          </h1>
          <p className="lede">
            The reference <span className="mono">{ref}</span> is not one we recognise. Check the
            link in your confirmation email and try again.
          </p>
          <Link to="/shop" className="btn btn--ember">
            Back to the range
          </Link>
        </div>
      </div>
    )
  }

  const eta = new Date(new Date(order.placedAt).getTime() + 3 * 86400000).toLocaleDateString(
    'en-US',
    { weekday: 'long', month: 'long', day: 'numeric' },
  )

  return (
    <div className="wrap confirm">
      <div className="confirm__hero">
        <div className="confirm__check" aria-hidden="true">
          <svg viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M15 27l7.5 7.5L37 19"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="eyebrow">{pending ? 'Confirming payment…' : 'Order confirmed'}</p>
        <h1 className="display confirm__title">
          The cold front is <em>on its way.</em>
        </h1>
        <p className="lede">
          Thanks, {order.name.split(' ')[0]}. We have emailed a receipt to{' '}
          <strong>{order.email}</strong>. Estimated delivery {eta}.
        </p>
        <p className="confirm__ref mono">
          Order reference <strong>{order.ref}</strong>
        </p>
      </div>

      <div className="confirm__layout">
        <div className="confirm__lines panel">
          <h2 className="mono dim">What you ordered</h2>
          {order.lines.map((l) => (
            <div key={l.slug} className="confirm__line">
              <div>
                <Link to={`/product/${l.slug}`} className="confirm__line-name">
                  {l.name}
                </Link>
                <span className="mono dim"> × {l.qty}</span>
              </div>
              <span>{formatPrice(l.price * l.qty)}</span>
            </div>
          ))}
          <hr className="hairline" />
          <dl className="summary__rows">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPrice(order.subtotal)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{order.shipping === 0 ? 'Free' : formatPrice(order.shipping)}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd>{formatPrice(order.tax)}</dd>
            </div>
          </dl>
          <div className="summary__total">
            <span>Total paid</span>
            <strong>{formatPrice(order.total)}</strong>
          </div>
        </div>

        <div className="confirm__side">
          <div className="panel confirm__panel">
            <h2 className="mono dim">Shipping to</h2>
            <p>{order.name}</p>
            <p className="dim">{order.address}</p>
          </div>
          <div className="panel confirm__panel">
            <h2 className="mono dim">What happens next</h2>
            <ol className="confirm__steps">
              <li>We pick and pack your unit within one working day.</li>
              <li>You get a tracking link by email as it leaves the warehouse.</li>
              <li>It arrives in 2–5 working days, ready to run out of the box.</li>
            </ol>
          </div>
          <Link to="/shop" className="btn btn--glacier btn--block">
            Keep shopping
          </Link>
        </div>
      </div>
    </div>
  )
}
