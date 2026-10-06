import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  adminCreateProduct,
  adminDeleteProduct,
  adminProducts,
  adminRestoreProduct,
  adminUpdateProduct,
  type ApiProduct,
  type ProductPayload,
} from '../../lib/api'

interface FormState {
  slug: string
  name: string
  series: string
  category: string
  btu: string
  coverage: string
  price: string
  compareAt: string
  rating: string
  reviews: string
  noise: string
  energyClass: string
  badge: string
  blurb: string
  description: string
  modes: string
  features: string
  specs: string
  hue: string
  accent: string
  vents: string
  proportions: 'slim' | 'standard' | 'stout'
  active: boolean
  onHand: string
  lowStockThreshold: string
  backorderable: boolean
}

const EMPTY: FormState = {
  slug: '',
  name: '',
  series: '',
  category: 'portable',
  btu: '8000',
  coverage: '350',
  price: '449',
  compareAt: '',
  rating: '4.5',
  reviews: '0',
  noise: '52',
  energyClass: 'A',
  badge: '',
  blurb: '',
  description: '',
  modes: 'cool, fan, dry',
  features: '',
  specs: '',
  hue: '170',
  accent: '#4fe3d0',
  vents: '6',
  proportions: 'standard',
  active: true,
  onHand: '10',
  lowStockThreshold: '3',
  backorderable: false,
}

/** `label: value` per line — easier to edit in a textarea than a grid. */
function parseSpecs(raw: string): { label: string; value: string }[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf(':')
      if (index === -1) return { label: line, value: '' }
      return { label: line.slice(0, index).trim(), value: line.slice(index + 1).trim() }
    })
    .filter((s) => s.label && s.value)
}

function specsToText(specs: { label: string; value: string }[]): string {
  return specs.map((s) => `${s.label}: ${s.value}`).join('\n')
}

function fromProduct(p: ApiProduct): FormState {
  const art = (p.art ?? {}) as { hue?: number; accent?: string; vents?: number; proportions?: FormState['proportions'] }
  return {
    slug: p.slug,
    name: p.name,
    series: p.series,
    category: p.category,
    btu: String(p.btu),
    coverage: String(p.coverage),
    price: (p.priceCents / 100).toFixed(2),
    compareAt: p.compareAtCents === null ? '' : (p.compareAtCents / 100).toFixed(2),
    rating: String(p.rating),
    reviews: String(p.reviews),
    noise: String(p.noise),
    energyClass: p.energyClass,
    badge: p.badge ?? '',
    blurb: p.blurb,
    description: p.description,
    modes: p.modes.join(', '),
    features: p.features.join('\n'),
    specs: specsToText(p.specs),
    hue: String(art.hue ?? 170),
    accent: art.accent ?? '#4fe3d0',
    vents: String(art.vents ?? 6),
    proportions: art.proportions ?? 'standard',
    active: p.stockStatus !== undefined,
    onHand: '0',
    lowStockThreshold: '3',
    backorderable: false,
  }
}

function toPayload(f: FormState): ProductPayload {
  const priceCents = Math.round(Number(f.price) * 100)
  if (!Number.isFinite(priceCents)) throw new Error('Price must be a number.')
  const compareAt = f.compareAt.trim() === '' ? null : Math.round(Number(f.compareAt) * 100)
  if (compareAt !== null && !Number.isFinite(compareAt)) throw new Error('Compare-at price must be a number.')

  return {
    slug: f.slug.trim().toLowerCase(),
    name: f.name.trim(),
    series: f.series.trim(),
    category: f.category,
    btu: Math.round(Number(f.btu)),
    coverage: Math.round(Number(f.coverage)),
    priceCents,
    compareAtCents: compareAt,
    rating: Number(f.rating),
    reviews: Math.round(Number(f.reviews)),
    noise: Math.round(Number(f.noise)),
    energyClass: f.energyClass.trim(),
    modes: f.modes
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    features: f.features
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean),
    badge: f.badge.trim() === '' ? null : f.badge.trim(),
    blurb: f.blurb.trim(),
    description: f.description.trim(),
    specs: parseSpecs(f.specs),
    art: {
      hue: Number(f.hue),
      accent: f.accent,
      vents: Number(f.vents),
      proportions: f.proportions,
    },
    active: f.active,
  }
}

export function AdminProducts() {
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [editing, setEditing] = useState<ApiProduct | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminProducts({ q: search || undefined, includeInactive })
      setProducts(res.items)
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof ApiError ? err.message : 'Could not load products.' })
    } finally {
      setLoading(false)
    }
  }, [search, includeInactive])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setForm(EMPTY)
    setEditing(null)
    setCreating(true)
    setMessage(null)
  }

  const openEdit = (p: ApiProduct) => {
    setForm(fromProduct(p))
    setEditing(p)
    setCreating(false)
    setMessage(null)
  }

  const closeForm = () => {
    setEditing(null)
    setCreating(false)
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const payload = toPayload(form)
      if (editing) {
        await adminUpdateProduct(editing.id, payload)
        setMessage({ kind: 'ok', text: `Updated “${payload.name}”.` })
      } else {
        await adminCreateProduct({
          ...payload,
          onHand: Math.max(0, Math.round(Number(form.onHand) || 0)),
          lowStockThreshold: Math.max(0, Math.round(Number(form.lowStockThreshold) || 0)),
          backorderable: form.backorderable,
        })
        setMessage({ kind: 'ok', text: `Created “${payload.name}”.` })
      }
      closeForm()
      await load()
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors
        const detail = Object.entries(fields)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ')
        setMessage({ kind: 'err', text: detail || err.message })
      } else {
        setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Could not save the product.' })
      }
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: ApiProduct) => {
    if (!window.confirm(`Delete “${p.name}”? Products with order history are deactivated instead.`)) return
    try {
      const res = await adminDeleteProduct(p.id)
      setMessage({
        kind: 'ok',
        text: res.deleted ? `Deleted “${p.name}”.` : res.reason ?? `Deactivated “${p.name}”.`,
      })
      await load()
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof ApiError ? err.message : 'Could not delete the product.' })
    }
  }

  const restore = async (p: ApiProduct) => {
    try {
      await adminRestoreProduct(p.id)
      setMessage({ kind: 'ok', text: `Restored “${p.name}”.` })
      await load()
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof ApiError ? err.message : 'Could not restore the product.' })
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const text = (key: keyof FormState, label: string, span = false) => (
    <label className={`admin-field${span ? ' admin-field--span' : ''}`}>
      <span className="admin-field__label">{label}</span>
      <input value={String(form[key])} onChange={(e) => set(key, e.target.value as never)} />
    </label>
  )

  return (
    <>
      <div className="admin__title--row">
        <h1 className="admin__title">Products</h1>
        <button className="admin-btn admin-btn--primary" onClick={openCreate}>
          + New product
        </button>
      </div>

      {message && (
        <div className={`admin-msg admin-msg--${message.kind}`} role="status">
          {message.text}
        </div>
      )}

      {(creating || editing) && (
        <div className="admin-card">
          <h2 className="admin-card__title">{editing ? `Edit “${editing.name}”` : 'New product'}</h2>
          <p className="admin-card__hint">
            Prices are entered in whole dollars and stored as cents. Artwork drives the parametric SVG on the
            storefront.
          </p>

          <div className="admin-form">
            {text('name', 'Name')}
            {text('slug', 'Slug (lowercase, hyphens)')}
            {text('series', 'Series')}
            <label className="admin-field">
              <span className="admin-field__label">Category</span>
              <select value={form.category} onChange={(e) => set('category', e.target.value)}>
                <option value="portable">portable</option>
                <option value="windowless">windowless</option>
                <option value="evaporative">evaporative</option>
                <option value="pro">pro</option>
              </select>
            </label>
            {text('btu', 'BTU')}
            {text('coverage', 'Coverage (sq ft)')}
            {text('price', 'Price ($)')}
            {text('compareAt', 'Compare-at ($, optional)')}
            {text('rating', 'Rating (0–5)')}
            {text('reviews', 'Review count')}
            {text('noise', 'Noise (dB)')}
            {text('energyClass', 'Energy class')}
            {text('badge', 'Badge (optional)')}
            {text('modes', 'Modes (comma separated)')}
            {text('hue', 'Art hue (0–360)')}
            {text('accent', 'Art accent (hex)')}
            {text('vents', 'Art vents')}
            <label className="admin-field">
              <span className="admin-field__label">Art proportions</span>
              <select
                value={form.proportions}
                onChange={(e) => set('proportions', e.target.value as FormState['proportions'])}
              >
                <option value="slim">slim</option>
                <option value="standard">standard</option>
                <option value="stout">stout</option>
              </select>
            </label>

            <label className="admin-field admin-field--span">
              <span className="admin-field__label">Blurb</span>
              <input value={form.blurb} onChange={(e) => set('blurb', e.target.value)} />
            </label>

            <label className="admin-field admin-field--span">
              <span className="admin-field__label">Description</span>
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
            </label>

            <label className="admin-field admin-field--span">
              <span className="admin-field__label">Features (one per line)</span>
              <textarea value={form.features} onChange={(e) => set('features', e.target.value)} />
            </label>

            <label className="admin-field admin-field--span">
              <span className="admin-field__label">Specs (one “Label: value” per line)</span>
              <textarea value={form.specs} onChange={(e) => set('specs', e.target.value)} />
            </label>

            {!editing && (
              <>
                {text('onHand', 'Opening stock')}
                {text('lowStockThreshold', 'Low-stock threshold')}
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={form.backorderable}
                    onChange={(e) => set('backorderable', e.target.checked)}
                  />
                  Backorderable
                </label>
              </>
            )}

            <label className="admin-check">
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
              Active (visible on the storefront)
            </label>
          </div>

          <div className="admin-row" style={{ marginTop: '1.25rem' }}>
            <button className="admin-btn admin-btn--primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
            </button>
            <button className="admin-btn" onClick={closeForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-row">
          <label className="admin-field" style={{ flex: 1, minWidth: 200 }}>
            <span className="admin-field__label">Search</span>
            <input
              value={search}
              placeholder="Name or slug"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="admin-check" style={{ marginTop: '1.2rem' }}>
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>

        <div className="admin-spacer-sm" />

        {loading ? (
          <p className="admin-empty">Loading…</p>
        ) : products.length === 0 ? (
          <p className="admin-empty">No products match.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="admin-mono">{p.slug}</td>
                  <td>{p.category}</td>
                  <td>${(p.priceCents / 100).toFixed(2)}</td>
                  <td>
                    <span
                      className={`admin-badge ${
                        p.stockStatus === 'in_stock'
                          ? 'admin-badge--ok'
                          : p.stockStatus === 'out_of_stock'
                            ? 'admin-badge--bad'
                            : 'admin-badge--warn'
                      }`}
                    >
                      {p.stockStatus.replace('_', ' ')} · {p.available}
                    </span>
                  </td>
                  <td>
                    <div className="admin-table__actions">
                      <button className="admin-btn admin-btn--sm" onClick={() => openEdit(p)}>
                        Edit
                      </button>
                      <button className="admin-btn admin-btn--sm admin-btn--danger" onClick={() => void remove(p)}>
                        Delete
                      </button>
                      {p.stockStatus === 'out_of_stock' && (
                        <button className="admin-btn admin-btn--sm" onClick={() => void restore(p)}>
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
