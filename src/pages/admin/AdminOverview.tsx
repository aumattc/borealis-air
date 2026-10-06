import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, adminInventory, adminOrders, type ApiStockLevel, type ApiOrderSummary } from '../../lib/api'

export function AdminOverview() {
  const [orders, setOrders] = useState<ApiOrderSummary[]>([])
  const [inventory, setInventory] = useState<ApiStockLevel[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([adminOrders(), adminInventory()])
      .then(([o, i]) => {
        if (cancelled) return
        setOrders(o.items)
        setInventory(i.inventory)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load the overview.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const paid = orders.filter((o) => o.status === 'paid' || o.status === 'fulfilled')
  const revenue = paid.reduce((sum, o) => sum + o.totalCents, 0)
  const pending = orders.filter((o) => o.status === 'pending').length
  const lowStock = inventory.filter((i) => i.stockStatus === 'low_stock' || i.stockStatus === 'out_of_stock')

  return (
    <>
      <h1 className="admin__title">Overview</h1>

      {error && <div className="admin-msg admin-msg--err">{error}</div>}

      <div className="admin-grid">
        <div className="stat">
          <div className="stat__label">Revenue</div>
          <div className="stat__value">${(revenue / 100).toFixed(2)}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Orders</div>
          <div className="stat__value">{orders.length}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Awaiting payment</div>
          <div className="stat__value">{pending}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Low / out of stock</div>
          <div className="stat__value">{lowStock.length}</div>
        </div>
      </div>

      <div className="admin-card" style={{ marginTop: '1.25rem' }}>
        <h2 className="admin-card__title">Needs attention</h2>
        {lowStock.length === 0 ? (
          <p className="admin-card__hint">Every unit is comfortably in stock.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Available</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lowStock.map((l) => (
                <tr key={l.productId}>
                  <td>{l.name}</td>
                  <td>{l.available}</td>
                  <td>
                    <span className={`admin-badge ${l.stockStatus === 'out_of_stock' ? 'admin-badge--bad' : 'admin-badge--warn'}`}>
                      {l.stockStatus.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <Link className="admin-btn admin-btn--sm" to="/admin/inventory">
                      Restock
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-card">
        <h2 className="admin-card__title">Recent orders</h2>
        {orders.length === 0 ? (
          <p className="admin-card__hint">No orders yet.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Placed</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 8).map((o) => (
                <tr key={o.ref}>
                  <td className="admin-mono">{o.ref}</td>
                  <td className="admin-mono">{new Date(o.placedAt).toLocaleString()}</td>
                  <td>${(o.totalCents / 100).toFixed(2)}</td>
                  <td>
                    <span className="admin-badge">{o.status}</span>
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
