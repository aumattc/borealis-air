import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatPrice } from '../data/products'
import { useCart } from '../hooks/useCart'
import { ApiError, createCheckout, fetchCheckoutConfig, syncCart, type CheckoutConfig } from '../lib/api'

interface Fields {
  email: string
  firstName: string
  lastName: string
  address: string
  city: string
  postcode: string
  country: string
}

const EMPTY: Fields = {
  email: '',
  firstName: '',
  lastName: '',
  address: '',
  city: '',
  postcode: '',
  country: 'United States',
}

export function Checkout() {
  const { items, subtotal, shipping, tax, total, clear } = useCart()
  const navigate = useNavigate()
  const [f, setF] = useState<Fields>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [config, setConfig] = useState<CheckoutConfig | null>(null)

  useEffect(() => {
    fetchCheckoutConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [])

  if (items.length === 0) {
    return (
      <div className="wrap cart">
        <div className="empty panel">
          <p className="eyebrow">Checkout</p>
          <h1 className="display" style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>
            Nothing to <em>check out.</em>
          </h1>
          <p className="lede">Add a unit to your cart first and we will take it from there.</p>
          <Link to="/shop" className="btn btn--ember">
            Browse the range
          </Link>
        </div>
      </div>
    )
  }

  const set = (k: keyof Fields) => (e: ChangeEvent<HTMLInputElement>) => {
    setF((prev) => ({ ...prev, [k]: e.target.value }))
    setErrors((prev) => ({ ...prev, [k]: undefined }))
  }

  const validate = (): boolean => {
    const next: Partial<Record<keyof Fields, string>> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) next.email = 'Enter a valid email'
    if (!f.firstName.trim()) next.firstName = 'Required'
    if (!f.lastName.trim()) next.lastName = 'Required'
    if (!f.address.trim()) next.address = 'Required'
    if (!f.city.trim()) next.city = 'Required'
    if (!f.postcode.trim()) next.postcode = 'Required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) {
      document.querySelector('.field--error input')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    setBusy(true)
    setFormError(null)
    void submit()
  }

  const submit = async () => {
    try {
      // The server prices and reserves stock; the local cart only tells it what
      // was chosen.
      await syncCart(items.map((i) => ({ productId: i.productId, qty: i.qty })))

      const { order, payment } = await createCheckout({
        email: f.email,
        firstName: f.firstName,
        lastName: f.lastName,
        addressLine1: f.address,
        city: f.city,
        postcode: f.postcode,
        country: f.country,
      })

      clear()

      if (payment.checkoutUrl) {
        // Hosted checkout: the shopper pays on Stripe's page (or, in
        // development, the in-app mock page) and comes back to the order.
        window.location.assign(payment.checkoutUrl)
        return
      }

      // Provider without a hosted page: fall back to the confirmation screen.
      navigate(`/order/${order.ref}`, { replace: true, state: { intentId: payment.intentId } })
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors
        if (Object.keys(fields).length > 0) {
          setErrors(fields as Partial<Record<keyof Fields, string>>)
        } else {
          setFormError(err.message)
        }
      } else {
        setFormError('Something went wrong. Please try again.')
      }
      setBusy(false)
    }
  }

  const field = (
    k: keyof Fields,
    label: string,
    opts?: { type?: string; placeholder?: string; span?: boolean; inputMode?: 'numeric' | 'text' },
  ) => (
    <label className={`field${errors[k] ? ' field--error' : ''}${opts?.span ? ' field--span' : ''}`}>
      <span className="field__label mono dim">{label}</span>
      <input
        type={opts?.type ?? 'text'}
        value={f[k]}
        onChange={set(k)}
        placeholder={opts?.placeholder}
        inputMode={opts?.inputMode}
        autoComplete="off"
        aria-invalid={Boolean(errors[k])}
      />
      {errors[k] && <span className="field__err">{errors[k]}</span>}
    </label>
  )

  const usingStripe = config?.checkoutStyle === 'stripe'

  return (
    <div className="wrap checkout">
      <div className="checkout__head">
        <p className="eyebrow">Checkout</p>
        <h1 className="display checkout__title">
          Almost <em>cold.</em>
        </h1>
      </div>

      <form className="checkout__layout" onSubmit={onSubmit} noValidate>
        <div className="checkout__form">
          <section className="form-section panel">
            <h2 className="form-section__title">
              <span className="mono dim">01</span> Contact
            </h2>
            <div className="fields">
              {field('email', 'Email', { type: 'email', placeholder: 'you@example.com', span: true })}
            </div>
          </section>

          <section className="form-section panel">
            <h2 className="form-section__title">
              <span className="mono dim">02</span> Delivery address
            </h2>
            <div className="fields">
              {field('firstName', 'First name')}
              {field('lastName', 'Last name')}
              {field('address', 'Street address', { span: true })}
              {field('city', 'City')}
              {field('postcode', 'Postcode')}
              {field('country', 'Country', { span: true })}
            </div>
          </section>

          <section className="form-section panel">
            <h2 className="form-section__title">
              <span className="mono dim">03</span> Payment
            </h2>
            <p className="lede" style={{ marginTop: 0 }}>
              {usingStripe
                ? 'You will be taken to Stripe to enter your card securely. Card details are never entered on this site or stored by us.'
                : 'You will be taken to a secure payment step to complete your order. Card details are never entered on this site or stored by us.'}
            </p>
            <p className="form-section__note dim">
              {usingStripe
                ? `Payments are processed by Stripe${config?.stripeMode === 'sandbox' ? ' (test mode)' : ''}.`
                : 'Demonstration mode: no card is charged and no payment details are stored or transmitted.'}
            </p>
          </section>
        </div>

        <aside className="summary panel">
          <h2 className="summary__title mono">Your order</h2>
          <ul className="summary__items">
            {items.map((i) => (
              <li key={i.productId}>
                <span>
                  {i.product.name} <span className="dim mono">× {i.qty}</span>
                </span>
                <span>{formatPrice(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="summary__rows">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{shipping === 0 ? 'Free' : formatPrice(shipping)}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd>{formatPrice(tax)}</dd>
            </div>
          </dl>
          <div className="summary__total">
            <span>Total</span>
            <strong>{formatPrice(total)}</strong>
          </div>
          <button className="btn btn--ember btn--block" type="submit" disabled={busy}>
            {busy ? 'Opening secure payment…' : `Continue to payment · ${formatPrice(total)}`}
          </button>
          {formError && (
            <p className="field__err" role="alert" style={{ marginTop: '0.75rem' }}>
              {formError}
            </p>
          )}
          <p className="summary__note dim">Encrypted end to end · 30-day returns</p>
        </aside>
      </form>
    </div>
  )
}
