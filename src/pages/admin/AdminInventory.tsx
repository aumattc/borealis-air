import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  adminAdjustStock,
  adminInventory,
  adminStockMovements,
  type ApiStockLevel,
  type ApiStockMovement,
} from '../../lib/api'

export function AdminInventory() {
  const [levels, setLevels] = useState<ApiStockLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [selected, setSelected] = useState<ApiStockLevel | null>(null)
  const [movements, setMovements] = useState<ApiStockMovement[]>([])
  const [delta, setDelta] = useState('0')
  const [threshold, setThreshold] = useState('')
  const [note, setNote] = useState('')
  const [backorderable, setBackorderable] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminInventory()
      setLevels(res.inventory)
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof ApiError ? err.message : 'Could not load inventory.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openRow = async (level: ApiStockLevel) => {
    setSelected(level)
    setDelta('0')
    setThreshold(String(level.lowStockThreshold))
    setNote('')
    setBackorderable(level.backorderable)
    setMovements([])
    try {
      const res = await adminStockMovements(level.productId)
      setMovements(res.movements)
    } catch {
      /* the ledger is a nicety; the adjustment form still works */
    }
  }

  const apply = async () => {
    if (!selected) return
    setSaving(true)
    setMessage(null)
    try {
      const payload: { onHandDelta?: number; lowStockThreshold?: number; backorderable?: boolean; note?: string } = {}
      const d = Math.round(Number(delta) || 0)
      if (d !== 0) payload.onHandDelta = d
      const t = Number(threshold)
      if (Number.isFinite(t) && t !== selected.lowStockThreshold) payload.lowStockThreshold = Math.round(t)
      if (backorderable !== selected.backorderable) payload.backorderable = backorderable
      if (note.trim()) payload.note = note.trim()

      if (Object.keys(payload).length === 0) {
        setMessage({ kind: 'err', text: 'Nothing to change.' })
        setSaving(false)
        return
      }

      const res = await adminAdjustStock(selected.productId, payload)
      setMessage({ kind: 'ok', text: `Updated stock for “${selected.name}”.` })
      setSelected(res.inventory)
      await load()
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof ApiError ? err.message : 'Could not update stock.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h1 className="admin__title">Inventory</h1>

      {message && (
        <div className={`admin-msg admin-msg--${message.kind}`} role="status">
          {message.text}
        </div>
      )}

      {selected && (
        <div className="admin-card">
          <h2 className="admin-card__title">Adjust “{selected.name}”</h2>
          <p className="admin-card__hint">
            On hand {selected.onHand} · reserved {selected.reserved} · available {selected.available}. A positive
            delta restocks; a negative delta corrects shrink.
          </p>
          <div className="admin-form">
            <label className="admin-field">
              <span className="admin-field__label">On-hand change</span>
              <input value={delta} onChange={(e) => setDelta(e.target.value)} inputMode="numeric" />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">Low-stock threshold</span>
              <input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" />
            </label>
            <label className="admin-field admin-field--span">
              <span className="admin-field__label">Note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={backorderable}
                onChange={(e) => setBackorderable(e.target.checked)}
              />
              Backorderable
            </label>
          </div>
          <div className="admin-row" style={{ marginTop: '1.25rem' }}>
            <button className="admin-btn admin-btn--primary" onClick={() => void apply()} disabled={saving}>
              {saving ? 'Applying…' : 'Apply adjustment'}
            </button>
            <button className="admin-btn" onClick={() => setSelected(null)} disabled={saving}>
              Close
            </button>
          </div>

          {movements.length > 0 && (
            <>
              <h3 className="admin-card__title" style={{ marginTop: '1.5rem' }}>
                Recent movements
              </h3>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Reason</th>
                    <th>On hand</th>
                    <th>Reserved</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.slice(0, 12).map((m) => (
                    <tr key={m.id}>
                      <td className="admin-mono">{new Date(m.createdAt).toLocaleString()}</td>
                      <td>{m.reason}</td>
                      <td>{m.onHandDelta > 0 ? `+${m.onHandDelta}` : m.onHandDelta}</td>
                      <td>{m.reservedDelta > 0 ? `+${m.reservedDelta}` : m.reservedDelta}</td>
                      <td className="admin-mono">{m.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <div className="admin-card">
        {loading ? (
          <p className="admin-empty">Loading…</p>
        ) : levels.length === 0 ? (
          <p className="admin-empty">No inventory records.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Threshold</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.productId}>
                  <td>{l.name}</td>
                  <td>{l.onHand}</td>
                  <td>{l.reserved}</td>
                  <td>{l.available}</td>
                  <td>{l.lowStockThreshold}</td>
                  <td>
                    <span
                      className={`admin-badge ${
                        l.stockStatus === 'in_stock'
                          ? 'admin-badge--ok'
                          : l.stockStatus === 'out_of_stock'
                            ? 'admin-badge--bad'
                            : 'admin-badge--warn'
                      }`}
                    >
                      {l.stockStatus.replace('_', ' ')}
                    </span>
                    {l.backorderable && <span className="admin-badge" style={{ marginLeft: 6 }}>backorder</span>}
                  </td>
                  <td>
                    <button className="admin-btn admin-btn--sm" onClick={() => void openRow(l)}>
                      Adjust
                    </button>
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
