import { NavLink, Outlet } from 'react-router-dom'
import { useAdminAuth } from './useAdminAuth'

const TABS = [
  { to: '/admin', end: true, label: 'Overview' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/payments', label: 'Payments' },
]

export function AdminLayout() {
  const { customer, signOut } = useAdminAuth()

  return (
    <div className="admin">
      <div className="admin__bar">
        <NavLink to="/admin" className="admin__brand">
          Borealis<span>Admin</span>
        </NavLink>
        <nav className="admin__nav">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <span className="admin__spacer" />
        <span className="admin__user">{customer?.email}</span>
        <NavLink to="/" className="admin-btn admin-btn--sm">
          View store
        </NavLink>
        <button className="admin-btn admin-btn--sm" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      <div className="admin__main">
        <Outlet />
      </div>
    </div>
  )
}
