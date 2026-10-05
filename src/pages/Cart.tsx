import { Link } from 'react-router-dom'
import { formatPrice } from '../data/products'
import { useCart } from '../hooks/useCart'
import { UnitArt } from '../components/UnitArt'

export function Cart() {
  const { items, subtotal, shipping, tax, total, setQty, remove, count } = useCart()

  if (items.length === 0) {
    return (
      <div className="wrap cart">
        <div className="empty empty--cart panel">
          <p className="eyebrow">Cart</p>
          <h1 className="display" style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>
            Nothing here <em>yet.</em>
          </h1>
          <p className="lede">
            Your cart is empty. Find the unit sized for your room and we will get it moving.
          </p>
          <Link to="/shop" className="btn btn--ember">
            Browse the range
          </Link>
        </div>
      </div>
    )
  }

  const freeShipGap = Math.max(0, 300 - subtotal)

  return (
    <div className="wrap cart">
      <div className="cart__head">
        <p className="eyebrow">Cart</p>
        <h1 className="display cart__title">
          {count} {count === 1 ? 'unit' : 'units'}, <em>ready to ship.</em>
        </h1>
      </div>

      {freeShipGap > 0 && (
        <div className="ship-nudge">
          <span className="mono dim">
            {formatPrice(freeShipGap)} away from free shipping
          </span>
          <div className="ship-nudge__bar">
            <span style={{ width: `${Math.min(100, (subtotal / 300) * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="cart__layout">
        <div className="cart__lines">
          {items.map((item) => (
            <article key={item.productId} className="line">
              <Link to={`/product/${item.product.slug}`} className="line__art art">
                <UnitArt product={item.product} />
              </Link>
              <div className="line__info">
                <div className="line__head">
                  <div>
                    <p className="mono dim">{item.product.series}</p>
                    <h2 className="line__name">
                      <Link to={`/product/${item.product.slug}`}>{item.product.name}</Link>
                    </h2>
                  </div>
                  <span className="line__price">{formatPrice(item.lineTotal)}</span>
                </div>
                <p className="line__specs mono dim">
                  {item.product.btu.toLocaleString()} BTU · {item.product.coverage} sq ft ·{' '}
                  {item.product.noise} dB · {item.product.energyClass}
                </p>
                <div className="line__actions">
                  <div className="stepper" role="group" aria-label={`Quantity for ${item.product.name}`}>
                    <button
                      onClick={() => setQty(item.productId, item.qty - 1)}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span aria-live="polite">{item.qty}</span>
                    <button
                      onClick={() => setQty(item.productId, item.qty + 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <span className="mono dim">{formatPrice(item.product.price)} each</span>
                  <button className="line__remove mono" onClick={() => remove(item.productId)}>
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}

          <Link to="/shop" className="cart__continue mono link-underline">
            ← Continue shopping
          </Link>
        </div>

        <aside className="summary panel">
          <h2 className="summary__title mono">Order summary</h2>
          <dl className="summary__rows">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{shipping === 0 ? 'Free' : formatPrice(shipping)}</dd>
            </div>
            <div>
              <dt>Estimated tax</dt>
              <dd>{formatPrice(tax)}</dd>
            </div>
          </dl>
          <div className="summary__total">
            <span>Total</span>
            <strong>{formatPrice(total)}</strong>
          </div>
          <Link to="/checkout" className="btn btn--ember btn--block">
            Checkout
          </Link>
          <p className="summary__note dim">
            Secure checkout · 30-day returns · Free freight on returns
          </p>
        </aside>
      </div>
    </div>
  )
}
