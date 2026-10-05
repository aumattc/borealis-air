import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CATEGORIES, products, type Category } from '../data/products'
import { ProductCard } from '../components/ProductCard'

type Sort = 'featured' | 'price-asc' | 'price-desc' | 'btu-desc' | 'quiet' | 'rating'

const SORTS: { id: Sort; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'price-asc', label: 'Price, low to high' },
  { id: 'price-desc', label: 'Price, high to low' },
  { id: 'btu-desc', label: 'Cooling power' },
  { id: 'quiet', label: 'Quietest first' },
  { id: 'rating', label: 'Top rated' },
]

interface BtuBand {
  id: string
  label: string
  test: (btu: number) => boolean
}

const BTU_BANDS: BtuBand[] = [
  { id: 'all', label: 'Any capacity', test: () => true },
  { id: 'small', label: 'Under 8,000 BTU', test: (btu) => btu < 8000 },
  { id: 'mid', label: '8,000 – 12,000 BTU', test: (btu) => btu >= 8000 && btu <= 12000 },
  { id: 'large', label: 'Over 12,000 BTU', test: (btu) => btu > 12000 },
]

interface FeatureFilter {
  id: string
  label: string
  test: (features: string[], modes: string[], noise: number) => boolean
}

const FEATURE_FILTERS: FeatureFilter[] = [
  {
    id: 'inverter',
    label: 'Inverter compressor',
    test: (f) => f.some((x) => /inverter/i.test(x)),
  },
  { id: 'heat', label: 'Heating mode', test: (_f, modes) => modes.includes('heat') },
  { id: 'quiet', label: 'Under 52 dB', test: (_f, _m, noise) => noise < 52 },
]

export function Shop() {
  const [params, setParams] = useSearchParams()
  const urlCategory = (params.get('category') as Category | null) ?? 'all'

  const [category, setCategory] = useState<Category | 'all'>(urlCategory)
  const [band, setBand] = useState('all')
  const [features, setFeatures] = useState<string[]>([])
  const [maxPrice, setMaxPrice] = useState(1200)
  const [sort, setSort] = useState<Sort>('featured')

  useEffect(() => {
    setCategory(urlCategory)
  }, [urlCategory])

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false
      if (!BTU_BANDS.find((b) => b.id === band)!.test(p.btu)) return false
      if (p.price > maxPrice) return false
      for (const f of features) {
        const def = FEATURE_FILTERS.find((x) => x.id === f)
        if (def && !def.test(p.features, p.modes, p.noise)) return false
      }
      return true
    })

    switch (sort) {
      case 'price-asc':
        list = [...list].sort((a, b) => a.price - b.price)
        break
      case 'price-desc':
        list = [...list].sort((a, b) => b.price - a.price)
        break
      case 'btu-desc':
        list = [...list].sort((a, b) => b.btu - a.btu)
        break
      case 'quiet':
        list = [...list].sort((a, b) => a.noise - b.noise)
        break
      case 'rating':
        list = [...list].sort((a, b) => b.rating - a.rating)
        break
      default:
        break
    }
    return list
  }, [category, band, features, maxPrice, sort])

  const setCategoryAndUrl = (c: Category | 'all') => {
    setCategory(c)
    const next = new URLSearchParams(params)
    if (c === 'all') next.delete('category')
    else next.set('category', c)
    setParams(next, { replace: true })
  }

  const toggleFeature = (id: string) =>
    setFeatures((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const reset = () => {
    setBand('all')
    setFeatures([])
    setMaxPrice(1200)
    setSort('featured')
    setCategoryAndUrl('all')
  }

  const activeCount =
    (category !== 'all' ? 1 : 0) +
    (band !== 'all' ? 1 : 0) +
    features.length +
    (maxPrice < 1200 ? 1 : 0)

  const activeCat = CATEGORIES.find((c) => c.id === category)!

  return (
    <div className="shop">
      <div className="wrap shop__head">
        <p className="eyebrow">{activeCat.id === 'all' ? 'The range' : activeCat.label}</p>
        <h1 className="display shop__title">
          {activeCat.id === 'all' ? (
            <>
              Every unit, <em>no filler.</em>
            </>
          ) : (
            <>
              {activeCat.label}, <em>sized right.</em>
            </>
          )}
        </h1>
        <p className="lede shop__lede">{activeCat.note}.</p>
      </div>

      <div className="wrap shop__layout">
        <aside className="filters" aria-label="Filters">
          <div className="filters__head">
            <span className="mono">Filter</span>
            {activeCount > 0 && (
              <button className="filters__reset mono" onClick={reset}>
                Reset ({activeCount})
              </button>
            )}
          </div>

          <fieldset className="filters__group">
            <legend className="mono dim">Category</legend>
            {CATEGORIES.map((c) => (
              <label key={c.id} className="check">
                <input
                  type="radio"
                  name="category"
                  checked={category === c.id}
                  onChange={() => setCategoryAndUrl(c.id)}
                />
                <span className="check__box" aria-hidden="true" />
                <span>{c.label}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="filters__group">
            <legend className="mono dim">Cooling capacity</legend>
            {BTU_BANDS.map((b) => (
              <label key={b.id} className="check">
                <input
                  type="radio"
                  name="band"
                  checked={band === b.id}
                  onChange={() => setBand(b.id)}
                />
                <span className="check__box" aria-hidden="true" />
                <span>{b.label}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="filters__group">
            <legend className="mono dim">Features</legend>
            {FEATURE_FILTERS.map((f) => (
              <label key={f.id} className="check">
                <input
                  type="checkbox"
                  checked={features.includes(f.id)}
                  onChange={() => toggleFeature(f.id)}
                />
                <span className="check__box" aria-hidden="true" />
                <span>{f.label}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="filters__group">
            <legend className="mono dim">Max price — ${maxPrice}</legend>
            <input
              type="range"
              min={250}
              max={1200}
              step={25}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="range"
            />
          </fieldset>
        </aside>

        <div className="shop__results">
          <div className="shop__bar">
            <p className="mono dim">
              {filtered.length} {filtered.length === 1 ? 'unit' : 'units'}
            </p>
            <label className="select">
              <span className="mono dim">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="empty panel">
              <p className="display" style={{ fontSize: '1.6rem' }}>
                Nothing matches that.
              </p>
              <p className="lede">Loosen a filter or reset the whole thing.</p>
              <button className="btn btn--glacier" onClick={reset}>
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid-3">
              {filtered.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
