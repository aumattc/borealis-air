export function Stars({ value, count }: { value: number; count?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100))
  return (
    <span className="stars" aria-label={`Rated ${value} out of 5`}>
      <span className="stars__track" aria-hidden="true">
        ★★★★★
      </span>
      <span className="stars__fill" style={{ width: `${pct}%` }} aria-hidden="true">
        ★★★★★
      </span>
      {count !== undefined && <span className="stars__count mono">{count.toLocaleString()}</span>}
    </span>
  )
}
