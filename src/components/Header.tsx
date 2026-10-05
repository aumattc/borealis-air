import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useCart } from '../hooks/useCart'

const NAV = [
  { to: '/shop', label: 'All units' },
  { to: '/shop?category=portable', label: 'Portable' },
  { to: '/shop?category=windowless', label: 'Windowless' },
  { to: '/shop?category=evaporative', label: 'Evaporative' },
  { to: '/shop?category=pro', label: 'Pro' },
]

export function Header() {
  const { count } = useCart()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`site-head${scrolled ? ' is-scrolled' : ''}`}>
      <div className="wrap site-head__inner">
        <Link to="/" className="brand" aria-label="Borealis Air, home">
          <svg viewBox="0 0 32 32" aria-hidden="true" className="brand__mark">
            <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeOpacity="0.35" />
            <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="16" y1="5" x2="16" y2="27" />
              <line x1="6.5" y1="10.5" x2="25.5" y2="21.5" />
              <line x1="25.5" y1="10.5" x2="6.5" y2="21.5" />
            </g>
            <circle cx="16" cy="16" r="3" fill="currentColor" />
          </svg>
          <span className="brand__word">
            Borealis<span className="brand__thin">&nbsp;Air</span>
          </span>
        </Link>

        <nav className="site-nav" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="site-nav__link">
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-head__actions">
          <Link to="/shop" className="head-link mono">
            Shop
          </Link>
          <Link to="/cart" className="cart-btn" aria-label={`Cart, ${count} items`}>
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none">
              <path
                d="M4 7h16l-1.4 11.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8L4 7Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="M9 7a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {count > 0 && <span className="cart-btn__count">{count}</span>}
          </Link>
          <button
            className="burger"
            aria-expanded={open}
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className={open ? 'is-x' : ''} />
            <span className={open ? 'is-x' : ''} />
          </button>
        </div>
      </div>

      <div className={`mobile-nav${open ? ' is-open' : ''}`}>
        {NAV.map((item) => (
          <Link key={item.to} to={item.to} className="mobile-nav__link">
            {item.label}
          </Link>
        ))}
        <Link to="/cart" className="mobile-nav__link">
          Cart {count > 0 && `(${count})`}
        </Link>
      </div>
    </header>
  )
}
