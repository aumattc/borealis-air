import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { useRevealObserver } from './hooks/useReveal'
import { Home } from './pages/Home'
import { Shop } from './pages/Shop'
import { ProductDetail } from './pages/ProductDetail'
import { Cart } from './pages/Cart'
import { Checkout } from './pages/Checkout'
import { MockCheckout } from './pages/MockCheckout'
import { Confirmation } from './pages/Confirmation'
import { NotFound } from './pages/NotFound'
import { AdminApp } from './pages/admin/AdminApp'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])
  return null
}

export function App() {
  useRevealObserver()
  const { pathname } = useLocation()

  // The admin CMS is a separate surface: its own chrome, its own auth gate.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return <AdminApp />
  }

  return (
    <div className="app-shell">
      <ScrollToTop />
      <a href="#main" className="skip">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/product/:slug" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/checkout/mock" element={<MockCheckout />} />
          <Route path="/order/:ref" element={<Confirmation />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
