import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  adminPaymentSettings,
  adminUpdatePaymentSettings,
  type PaymentSettingsUpdate,
  type StripeModeView,
  type StripeSettings,
} from '../../lib/api'

type Mode = 'sandbox' | 'production'

interface KeyDraft {
  secretKey: string
  publishableKey: string
  webhookSecret: string
}

const EMPTY_DRAFT: KeyDraft = { secretKey: '', publishableKey: '', webhookSecret: '' }

/**
 * Stripe credential and mode management.
 *
 * Stored secrets are never returned by the API — only a masked preview. Leaving
 * a field blank keeps the stored value; typing a value replaces it. A separate
 * clear action removes keys for a mode entirely.
 */
export function AdminPayments() {
  const [settings, setSettings] = useState<StripeSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const [mode, setMode] = useState<Mode>('sandbox')
  const [checkoutStyle, setCheckoutStyle] = useState<'stripe' | 'mock'>('mock')
  const [sandbox, setSandbox] = useState<KeyDraft>(EMPTY_DRAFT)
  const [production, setProduction] = useState<KeyDraft>(EMPTY_DRAFT)

  const apply = useCallback((s: StripeSettings) => {
    setSettings(s)
    setMode(s.mode)
    setCheckoutStyle(s.checkoutStyle)
    setSandbox(EMPTY_DRAFT)
    setProduction(EMPTY_DRAFT)
  }, [])

  useEffect(() => {
    let cancelled = false
    adminPaymentSettings()
      .then((res) => {
        if (!cancelled) apply(res.stripe)
      })
      .catch((err) => {
        if (!cancelled) {
          setMessage({ kind: 'err', text: err instanceof ApiError ? err.message : 'Could not load settings.' })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apply])

  const save = async (payload: PaymentSettingsUpdate, okText: string) => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await adminUpdatePaymentSettings(payload)
      apply(res.stripe)
      setMessage({ kind: 'ok', text: okText })
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof ApiError ? err.message : 'Could not save settings.' })
    } finally {
      setSaving(false)
    }
  }

  const saveModeAndStyle = () =>
    save({ mode, checkoutStyle }, `Active mode set to ${mode}, checkout set to ${checkoutStyle}.`)

  const saveKeys = (which: Mode) => {
    const draft = which === 'sandbox' ? sandbox : production
    const payload: PaymentSettingsUpdate = {}
    if (which === 'sandbox') {
      if (draft.secretKey) payload.sandboxSecretKey = draft.secretKey
      if (draft.publishableKey) payload.sandboxPublishableKey = draft.publishableKey
      if (draft.webhookSecret) payload.sandboxWebhookSecret = draft.webhookSecret
    } else {
      if (draft.secretKey) payload.productionSecretKey = draft.secretKey
      if (draft.publishableKey) payload.productionPublishableKey = draft.publishableKey
      if (draft.webhookSecret) payload.productionWebhookSecret = draft.webhookSecret
    }
    if (Object.keys(payload).length === 0) {
      setMessage({ kind: 'err', text: 'Enter at least one key to save.' })
      return
    }
    void save(payload, `${which} credentials updated.`)
  }

  const clearMode = (which: Mode) => {
    if (!window.confirm(`Remove all stored ${which} Stripe credentials?`)) return
    void save(which === 'sandbox' ? { clearSandbox: true } : { clearProduction: true }, `${which} credentials cleared.`)
  }

  const keyFields = (which: Mode, view: StripeModeView, draft: KeyDraft, setDraft: (d: KeyDraft) => void) => (
    <div className="admin-card">
      <h2 className="admin-card__title">{which === 'sandbox' ? 'Sandbox (test) keys' : 'Production (live) keys'}</h2>
      <p className="admin-card__hint">
        Stored values are encrypted and never shown in full. Leave a field blank to keep the current value.
      </p>

      <div className="admin-form">
        <label className="admin-field">
          <span className="admin-field__label">Secret key {sourceLabel(view.source.secretKey, view.secretKey)}</span>
          <input
            type="password"
            value={draft.secretKey}
            placeholder={view.secretKey || 'sk_…'}
            onChange={(e) => setDraft({ ...draft, secretKey: e.target.value })}
            autoComplete="off"
          />
        </label>
        <label className="admin-field">
          <span className="admin-field__label">
            Publishable key {sourceLabel(view.source.publishableKey, view.publishableKey)}
          </span>
          <input
            type="password"
            value={draft.publishableKey}
            placeholder={view.publishableKey || 'pk_…'}
            onChange={(e) => setDraft({ ...draft, publishableKey: e.target.value })}
            autoComplete="off"
          />
        </label>
        <label className="admin-field">
          <span className="admin-field__label">
            Webhook signing secret {sourceLabel(view.source.webhookSecret, view.webhookSecret)}
          </span>
          <input
            type="password"
            value={draft.webhookSecret}
            placeholder={view.webhookSecret || 'whsec_…'}
            onChange={(e) => setDraft({ ...draft, webhookSecret: e.target.value })}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="admin-row" style={{ marginTop: '1rem' }}>
        <button className="admin-btn admin-btn--primary" onClick={() => saveKeys(which)} disabled={saving}>
          Save {which} keys
        </button>
        <button className="admin-btn admin-btn--danger" onClick={() => clearMode(which)} disabled={saving}>
          Clear stored keys
        </button>
      </div>
    </div>
  )

  if (loading) {
    return (
      <>
        <h1 className="admin__title">Payments</h1>
        <p className="admin-empty">Loading…</p>
      </>
    )
  }

  if (!settings) {
    return (
      <>
        <h1 className="admin__title">Payments</h1>
        {message && <div className="admin-msg admin-msg--err">{message.text}</div>}
      </>
    )
  }

  return (
    <>
      <h1 className="admin__title">Payments</h1>

      {message && (
        <div className={`admin-msg admin-msg--${message.kind}`} role="status">
          {message.text}
        </div>
      )}

      <div className="admin-card">
        <h2 className="admin-card__title">Active mode</h2>
        <p className="admin-card__hint">
          Which credential set the storefront charges with. Production takes real money — switch only when the
          live keys are in place.
        </p>
        <div className="admin-row">
          <label className="admin-check">
            <input type="radio" checked={mode === 'sandbox'} onChange={() => setMode('sandbox')} />
            Sandbox (test)
          </label>
          <label className="admin-check">
            <input type="radio" checked={mode === 'production'} onChange={() => setMode('production')} />
            Production (live)
          </label>
        </div>

        <div className="admin-spacer-sm" />

        <h2 className="admin-card__title">Checkout</h2>
        <p className="admin-card__hint">
          Stripe sends the shopper to Stripe's hosted checkout page to pay — card details never touch this site.
          The mock option is a development simulator and is refused in production.
        </p>
        <div className="admin-row">
          <label className="admin-check">
            <input
              type="radio"
              checked={checkoutStyle === 'stripe'}
              onChange={() => setCheckoutStyle('stripe')}
            />
            Stripe hosted checkout
          </label>
          <label className="admin-check">
            <input type="radio" checked={checkoutStyle === 'mock'} onChange={() => setCheckoutStyle('mock')} />
            Mock (development)
          </label>
        </div>

        <div className="admin-row" style={{ marginTop: '1rem' }}>
          <button className="admin-btn admin-btn--primary" onClick={() => void saveModeAndStyle()} disabled={saving}>
            {saving ? 'Saving…' : 'Save mode'}
          </button>
        </div>
      </div>

      {keyFields('sandbox', settings.sandbox, sandbox, setSandbox)}
      {keyFields('production', settings.production, production, setProduction)}

      <div className="admin-card">
        <h2 className="admin-card__title">Webhook endpoint</h2>
        <p className="admin-card__hint">
          Point Stripe at this URL for <code>checkout.session.completed</code> and related events. The signing
          secret above must match the endpoint's secret.
        </p>
        <p className="admin-secret">{`${window.location.origin.replace(/:\d+$/, '')}:12001/api/webhooks/payments`}</p>
      </div>
    </>
  )
}

function sourceLabel(source: string, masked: string): string {
  if (!masked) return '(not set)'
  return `(${source})`
}
