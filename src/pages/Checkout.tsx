import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatPrice } from '../data/products'
import { useCart } from '../hooks/useCart'
import { saveOrder, type Order } from '../lib/orders'

interface Fields {
  email: string
  firstName: string
  lastName: string
  address: string
  city: string
  postcode: string
  country: string
  card: string
  expiry: string
  cvc: string
  nameOnCard: string
}

const EMPTY: Fields = {
  email: '',
  firstName: '',
  lastName: '',
  address: '',
  city: '',
  postcode: '',
  country: 'United States',
  card: '',
  expiry: '',
  cvc: '',
  nameOnCard: '',
}

export function Checkout() {
  const { items, subtotal, shipping, tax, total, clear } = useCart()
  const navigate = useNavigate()
  const [f, setF] = useState<Fields>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({})
  const [busy, setBusy] = useState(false)

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
    const digits = f.card.replace(/\s/g, '')
    if (!/^\d{15,16}$/.test(digits)) next.card = 'Card number looks wrong'
    if (!/^\d{2}\s?\/\s?\d{2}$/.test(f.expiry)) next.expiry = 'Use MM/YY'
    if (!/^\d{3,4}$/.test(f.cvc)) next.cvc = '3 or 4 digits'
    if (!f.nameOnCard.trim()) next.nameOnCard = 'Required'
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
    const ref = `BA-${Date.now().toString(36).toUpperCase().slice(-6)}`
    const order: Order = {
      ref,
      placedAt: new Date().toISOString(),
      email: f.email,
      name: `${f.firstName} ${f.lastName}`,
      address: `${f.address}, ${f.city} ${f.postcode}, ${f.country}`,
      lines: items.map((i) => ({
        name: i.product.name,
        qty: i.qty,
        price: i.product.price,
        slug: i.product.slug,
      })),
      subtotal,
      shipping,
      tax,
      total,
    }
    // Simulated payment authorisation — no network call, no card data stored.
    window.setTimeout(() => {
      saveOrder(order)
      clear()
      navigate(`/order/${ref}`, { replace: true })
    }, 1100)
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
            <div className="fields">
              {field('nameOnCard', 'Name on card', { span: true })}
              {field('card', 'Card number', { placeholder: '4242 4242 4242 4242', span: true, inputMode: 'numeric' })}
              {field('expiry', 'Expiry', { placeholder: 'MM/YY' })}
              {field('cvc', 'CVC', { placeholder: '123', inputMode: 'numeric' })}
            </div>
            <p className="form-section__note dim">
              This is a demonstration storefront. No card is charged and no payment details are
              stored or transmitted.
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
            {busy ? 'Authorising…' : `Pay ${formatPrice(total)}`}
          </button>
          <p className="summary__note dim">Encrypted end to end · 30-day returns</p>
        </aside>
      </form>
    </div>
  )
}
