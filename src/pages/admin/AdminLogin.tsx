import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../lib/api'
import { useAdminAuth } from './useAdminAuth'

export function AdminLogin() {
  const { signIn, error: contextError } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-login">
      <form className="admin-login__box" onSubmit={onSubmit}>
        <h1 className="admin-login__title">
          Borealis <span style={{ color: '#4fe3d0' }}>Admin</span>
        </h1>
        <p className="admin-login__hint">Sign in to manage products, inventory, orders and payments.</p>

        {(error ?? contextError) && (
          <div className="admin-msg admin-msg--err" role="alert">
            {error ?? contextError}
          </div>
        )}

        <label className="admin-field">
          <span className="admin-field__label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="admin-field">
          <span className="admin-field__label">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <button className="admin-btn admin-btn--primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="admin-login__hint" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
          <Link to="/" className="dim">
            ← Back to the store
          </Link>
        </p>
      </form>
    </div>
  )
}
