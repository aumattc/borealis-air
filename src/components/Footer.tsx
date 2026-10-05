import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="site-foot__grid">
          <div className="site-foot__brand">
            <p className="display" style={{ fontSize: 'clamp(1.6rem,3vw,2.2rem)' }}>
              Cool air,
              <br />
              <em>engineered.</em>
            </p>
            <p className="lede" style={{ maxWidth: '34ch', marginTop: '1rem' }}>
              Portable climate control designed around real rooms, real noise budgets, and real
              energy bills.
            </p>
          </div>

          <div className="site-foot__col">
            <h3 className="mono dim">Shop</h3>
            <Link to="/shop?category=portable">Portable units</Link>
            <Link to="/shop?category=windowless">Windowless</Link>
            <Link to="/shop?category=evaporative">Evaporative</Link>
            <Link to="/shop?category=pro">Pro &amp; commercial</Link>
          </div>

          <div className="site-foot__col">
            <h3 className="mono dim">Support</h3>
            <Link to="/shop">Find your BTU</Link>
            <a href="#faq">Shipping &amp; returns</a>
            <a href="#faq">Warranty</a>
            <a href="#faq">Contact</a>
          </div>

          <div className="site-foot__col">
            <h3 className="mono dim">Studio</h3>
            <a href="#about">Our approach</a>
            <a href="#about">Sustainability</a>
            <a href="#about">Press</a>
          </div>
        </div>

        <div className="site-foot__base">
          <p className="mono dim">© {new Date().getFullYear()} Borealis Air</p>
          <p className="mono dim">Designed for the cold front</p>
        </div>
      </div>
    </footer>
  )
}
