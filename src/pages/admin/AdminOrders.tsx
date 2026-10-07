import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  adminFulfillOrder,
  adminOrders,
  adminRefundOrder,
  type ApiOrderSummary,
} from '../../lib/api'

const STATUSES = ['', 'pending', 'paid', 'failed', 'cancelled', 'fulfilled', 'refunded']

export function AdminOrders() {
  const [orders, setOrders] = useState<ApiOrderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busyRef, setBusyRef] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminOrders({ status: status || undefined, email: email || undefined })
      setOrders(res.items)
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof ApiError ? err.message : 'Could not load orders.' })
    } finally {
      setLoading(false)
    }
  }, [status, email])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (ref: string, action: 'fulfill' | 'refund') => {
    if (action === 'refund' && !window.confirm(`Refund order ${ref} in full?`)) return
    setBusyRef(ref)
    setMessage(null)
    try {
      if (action === 'fulfill') await adminFulfillOrder(ref)
      else await adminRefundOrder(ref)
      setMessage({ kind: 'ok', text: `${action === 'fulfill' ? 'Fulfilled' : 'Refunded'} ${ref}.` })
      await load()
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof ApiError ? err.message : `Could not ${action} ${ref}.` })
    } finally {
      setBusyRef(null)
    }
  }

  return (
    <>
      <h1 className="admin__title">Orders</h1>

      {message && (
        <div className={`admin-msg admin-msg--${message.kind}`} role="status">
          {message.text}
        </div>
      )}

      <div className="admin-card">
        <div className="admin-row">
          <label className="admin-field" style={{ minWidth: 180 }}>
            <span className="admin-field__label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s || 'All'}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field" style={{ flex: 1, minWidth: 220 }}>
            <span className="admin-field__label">Email</span>
            <input value={email} placeholder="customer@example.com" onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>

        <div className="admin-spacer-sm" />

        {loading ? (
          <p className="admin-empty">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="admin-empty">No orders match.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Placed</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.ref}>
                  <td className="admin-mono">{o.ref}</td>
                  <td className="admin-mono">{new Date(o.placedAt).toLocaleString()}</td>
                  <td>{o.email}</td>
                  <td>${(o.totalCents / 100).toFixed(2)}</td>
                  <td>
                    <span
                      className={`admin-badge ${
                        o.status === 'paid' || o.status === 'fulfilled'
                          ? 'admin-badge--ok'
                          : o.status === 'failed' || o.status === 'cancelled'
                            ? 'admin-badge--bad'
                            : 'admin-badge--warn'
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="admin-mono">{o.paymentStatus ?? '—'}</td>
                  <td>
                    <div className="admin-table__actions">
                      <button
                        className="admin-btn admin-btn--sm"
                        disabled={o.status !== 'paid' || busyRef === o.ref}
                        onClick={() => void act(o.ref, 'fulfill')}
                      >
                        Fulfill
                      </button>
                      <button
                        className="admin-btn admin-btn--sm admin-btn--danger"
                        disabled={(o.status !== 'paid' && o.status !== 'fulfilled') || busyRef === o.ref}
                        onClick={() => void act(o.ref, 'refund')}
                      >
                        Refund
                      </button>
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
