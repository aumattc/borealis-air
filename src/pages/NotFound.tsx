import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="wrap cart">
      <div className="empty panel">
        <p className="eyebrow">404</p>
        <h1 className="display" style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>
          This page ran <em>out of coolant.</em>
        </h1>
        <p className="lede">
          The page you were looking for is not here. The units, however, very much are.
        </p>
        <Link to="/shop" className="btn btn--ember">
          Back to the range
        </Link>
      </div>
    </div>
  )
}
