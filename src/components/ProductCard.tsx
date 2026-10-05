import { Link } from 'react-router-dom'
import { formatPrice, type Product } from '../data/products'
import { UnitArt } from './UnitArt'
import { Stars } from './Stars'

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const onSale = product.compareAt && product.compareAt > product.price

  return (
    <article
      className="card reveal"
      style={{ transitionDelay: `${Math.min(index, 5) * 70}ms` }}
    >
      <Link to={`/product/${product.slug}`} className="card__art art" aria-label={product.name}>
        <UnitArt product={product} />
        <div className="card__flags">
          {product.badge && <span className="tag tag--glacier">{product.badge}</span>}
          {onSale && <span className="tag tag--ember">Save {formatPrice(product.compareAt! - product.price)}</span>}
          {!product.inStock && <span className="tag">Backorder</span>}
        </div>
        <span className="card__cta mono">View unit →</span>
      </Link>

      <div className="card__body">
        <div className="card__head">
          <div>
            <p className="mono dim card__series">{product.series}</p>
            <h3 className="card__name">
              <Link to={`/product/${product.slug}`}>{product.name}</Link>
            </h3>
          </div>
          <div className="card__price">
            <span className="card__price-now">{formatPrice(product.price)}</span>
            {onSale && <span className="card__price-was">{formatPrice(product.compareAt!)}</span>}
          </div>
        </div>

        <p className="card__blurb">{product.blurb}</p>

        <ul className="card__specs">
          <li>
            <span className="mono dim">BTU</span>
            {product.btu.toLocaleString()}
          </li>
          <li>
            <span className="mono dim">Covers</span>
            {product.coverage} sq ft
          </li>
          <li>
            <span className="mono dim">Noise</span>
            {product.noise} dB
          </li>
        </ul>

        <div className="card__foot">
          <Stars value={product.rating} count={product.reviews} />
          <span className="mono dim">{product.energyClass}</span>
        </div>
      </div>
    </article>
  )
}
