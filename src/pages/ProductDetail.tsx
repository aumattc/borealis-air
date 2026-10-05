import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { bySlug, formatPrice, products } from '../data/products'
import { UnitArt } from '../components/UnitArt'
import { Stars } from '../components/Stars'
import { ProductCard } from '../components/ProductCard'
import { useCart } from '../hooks/useCart'
import { NotFound } from './NotFound'

const VIEWS = [
  { id: 'front', label: 'Front', transform: 'none' },
  { id: 'angle', label: 'Angle', transform: 'perspective(900px) rotateY(-24deg) scale(0.94)' },
  { id: 'detail', label: 'Louvres', transform: 'scale(1.5) translateY(14%)' },
  { id: 'top', label: 'Top', transform: 'perspective(900px) rotateX(38deg) scale(0.9)' },
]

export function ProductDetail() {
  const { slug } = useParams()
  const product = slug ? bySlug(slug) : undefined
  const { add } = useCart()
  const [qty, setQty] = useState(1)
  const [view, setView] = useState(0)
  const [tab, setTab] = useState<'overview' | 'specs' | 'whats-in-box'>('overview')
  const [added, setAdded] = useState(false)

  const related = useMemo(
    () =>
      product
        ? products.filter((p) => p.id !== product.id && p.category === product.category).slice(0, 3)
        : [],
    [product],
  )

  if (!product) return <NotFound />

  const onSale = product.compareAt && product.compareAt > product.price

  const handleAdd = () => {
    add(product.id, qty)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2200)
  }

  const inBox = [
    'The unit itself, fully charged and ready to run',
    'Window sealing kit and exhaust hose',
    product.modes.includes('heat') ? 'Reverse-cycle heat pump (built in)' : 'Washable primary filter',
    'Remote control and batteries',
    'Drain hose for continuous operation',
    'Quick-start card and full manual',
  ]

  return (
    <div className="pdp">
      <div className="wrap">
        <nav className="crumbs mono dim" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span>/</span>
          <Link to="/shop">Shop</Link>
          <span>/</span>
          <span className="crumbs__current">{product.name}</span>
        </nav>

        <div className="pdp__top">
          {/* Gallery */}
          <div className="pdp__gallery">
            <div className="art pdp__stage">
              <div
                className="pdp__stage-inner"
                style={{ transform: VIEWS[view].transform }}
              >
                <UnitArt product={product} />
              </div>
              <div className="pdp__stage-tags">
                {product.badge && <span className="tag tag--glacier">{product.badge}</span>}
                {onSale && <span className="tag tag--ember">On sale</span>}
              </div>
            </div>
            <div className="pdp__thumbs">
              {VIEWS.map((v, i) => (
                <button
                  key={v.id}
                  className={`pdp__thumb${i === view ? ' is-active' : ''}`}
                  onClick={() => setView(i)}
                  aria-label={`${v.label} view`}
                  aria-pressed={i === view}
                >
                  <div style={{ transform: v.transform }}>
                    <UnitArt product={product} />
                  </div>
                  <span className="mono">{v.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Buy panel */}
          <div className="pdp__info">
            <p className="eyebrow">{product.series} series</p>
            <h1 className="display pdp__title">{product.name}</h1>
            <div className="pdp__meta">
              <Stars value={product.rating} count={product.reviews} />
              <span className="mono dim">·</span>
              <span className="mono dim">{product.inStock ? 'In stock' : 'Backorder — 2 weeks'}</span>
            </div>

            <p className="lede pdp__blurb">{product.blurb}</p>

            <div className="pdp__price">
              <span className="pdp__price-now">{formatPrice(product.price)}</span>
              {onSale && <span className="pdp__price-was">{formatPrice(product.compareAt!)}</span>}
              {onSale && (
                <span className="tag tag--ember">
                  Save {formatPrice(product.compareAt! - product.price)}
                </span>
              )}
            </div>

            <ul className="pdp__quick">
              <li>
                <span className="mono dim">Cooling</span>
                <strong>{product.btu.toLocaleString()} BTU</strong>
              </li>
              <li>
                <span className="mono dim">Covers</span>
                <strong>{product.coverage} sq ft</strong>
              </li>
              <li>
                <span className="mono dim">Noise</span>
                <strong>{product.noise} dB</strong>
              </li>
              <li>
                <span className="mono dim">Energy</span>
                <strong>{product.energyClass}</strong>
              </li>
            </ul>

            <div className="pdp__modes">
              {product.modes.map((m) => (
                <span key={m} className="tag">
                  {m}
                </span>
              ))}
            </div>

            <div className="pdp__buy">
              <div className="stepper" role="group" aria-label="Quantity">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  disabled={qty <= 1}
                >
                  −
                </button>
                <span aria-live="polite">{qty}</span>
                <button
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <button
                className={`btn btn--ember btn--block pdp__add${added ? ' is-added' : ''}`}
                onClick={handleAdd}
                disabled={!product.inStock}
              >
                {!product.inStock ? 'Notify me' : added ? 'Added ✓' : `Add to cart — ${formatPrice(product.price * qty)}`}
              </button>
            </div>

            <ul className="pdp__assurance">
              <li>Free shipping over $300</li>
              <li>30-day returns, we cover freight</li>
              <li>2–5 year warranty by series</li>
            </ul>
          </div>
        </div>

        {/* Tabs */}
        <div className="pdp__tabs">
          <div className="tabs" role="tablist">
            {(['overview', 'specs', 'whats-in-box'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`tabs__btn${tab === t ? ' is-active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'whats-in-box' ? "What's in the box" : t === 'specs' ? 'Full specs' : 'Overview'}
              </button>
            ))}
          </div>

          <div className="pdp__panel">
            {tab === 'overview' && (
              <div className="pdp__overview">
                <p className="lede">{product.description}</p>
                <div className="pdp__features">
                  {product.features.map((f) => (
                    <span key={f} className="tag tag--glacier">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {tab === 'specs' && (
              <dl className="spec-table">
                {product.specs.map((s) => (
                  <div key={s.label}>
                    <dt className="mono dim">{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {tab === 'whats-in-box' && (
              <ul className="inbox">
                {inBox.map((i) => (
                  <li key={i}>
                    <span className="inbox__tick" aria-hidden="true">
                      ✓
                    </span>
                    {i}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <section className="pdp__related">
            <h2 className="display" style={{ fontSize: 'clamp(1.5rem,3vw,2.1rem)' }}>
              More in <em>{product.series}</em>
            </h2>
            <div className="grid-3">
              {related.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* sticky mobile buy bar */}
      <div className="buy-bar">
        <div>
          <span className="mono dim">{product.name}</span>
          <strong>{formatPrice(product.price * qty)}</strong>
        </div>
        <button className="btn btn--ember" onClick={handleAdd} disabled={!product.inStock}>
          {product.inStock ? 'Add to cart' : 'Notify me'}
        </button>
      </div>
    </div>
  )
}
