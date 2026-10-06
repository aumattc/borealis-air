import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminAuthProvider, useAdminAuth } from './useAdminAuth'
import { AdminLogin } from './AdminLogin'
import { AdminLayout } from './AdminLayout'
import { AdminOverview } from './AdminOverview'
import { AdminProducts } from './AdminProducts'
import { AdminInventory } from './AdminInventory'
import { AdminOrders } from './AdminOrders'
import { AdminPayments } from './AdminPayments'
import './admin.css'

/**
 * Mounted at `/admin/*`. The whole tree is gated on an authenticated admin
 * session; anyone else sees the sign-in form.
 */
function AdminRoutes() {
  const { customer, loading } = useAdminAuth()

  if (loading) {
    return (
      <div className="admin-login">
        <div className="admin-login__box">
          <p className="admin-empty">Checking your session…</p>
        </div>
      </div>
    )
  }

  if (!customer || customer.role !== 'admin') return <AdminLogin />

  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="inventory" element={<AdminInventory />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  )
}

export function AdminApp() {
  return (
    <AdminAuthProvider>
      <AdminRoutes />
    </AdminAuthProvider>
  )
}
