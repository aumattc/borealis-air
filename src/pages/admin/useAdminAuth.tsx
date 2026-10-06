import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ApiError,
  currentCustomer,
  login as loginRequest,
  logout as logoutRequest,
  type AdminCustomer,
} from '../../lib/api'

interface AdminAuthValue {
  customer: AdminCustomer | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null)

/**
 * Admin session state. The session cookie is HttpOnly, so the browser cannot
 * read it directly — we ask the API who we are on mount and treat a 401 as
 * "signed out".
 */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<AdminCustomer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    currentCustomer()
      .then((res) => {
        if (!cancelled) setCustomer(res.customer)
      })
      .catch((err) => {
        if (cancelled) return
        // A 401 simply means no session yet; anything else is worth surfacing.
        if (!(err instanceof ApiError) || err.status !== 401) {
          setError(err instanceof Error ? err.message : 'Could not reach the API.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null)
    try {
      const res = await loginRequest(email, password)
      if (res.customer.role !== 'admin') {
        // The API issues the session; revoke it so a customer cannot sit on an
        // admin route with a non-admin cookie.
        await logoutRequest().catch(() => undefined)
        throw new ApiError(403, 'forbidden', 'This account does not have administrator access.')
      }
      setCustomer(res.customer)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not sign in.'
      setError(message)
      throw err
    }
  }, [])

  const signOut = useCallback(async () => {
    await logoutRequest().catch(() => undefined)
    setCustomer(null)
  }, [])

  const value = useMemo<AdminAuthValue>(
    () => ({ customer, loading, error, signIn, signOut }),
    [customer, loading, error, signIn, signOut],
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth(): AdminAuthValue {
  const value = useContext(AdminAuthContext)
  if (!value) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return value
}
