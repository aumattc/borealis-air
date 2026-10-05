import type { Product } from '../data/products'

/**
 * Draws each air conditioner as a parametric vector machine.
 * Proportions, vent count and accent hue all derive from the product
 * so no two units read the same — and nothing depends on a bitmap.
 */
export function UnitArt({ product, className }: { product: Product; className?: string }) {
  const { hue, accent, vents, proportions } = product.art
  const uid = product.id

  const body =
    proportions === 'slim'
      ? { w: 150, h: 250 }
      : proportions === 'stout'
        ? { w: 214, h: 268 }
        : { w: 182, h: 258 }

  const cx = 200
  const top = 118
  const left = cx - body.w / 2
  const right = cx + body.w / 2
  const bottom = top + body.h

  const grilleTop = top + 34
  const grilleH = 92
  const ventGap = grilleH / (vents + 1)

  return (
    <svg
      viewBox="0 0 400 460"
      className={className}
      role="img"
      aria-label={`${product.name} portable air conditioner`}
    >
      <defs>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue} 22% 26%)`} />
          <stop offset="55%" stopColor={`hsl(${hue} 26% 15%)`} />
          <stop offset="100%" stopColor={`hsl(${hue} 30% 9%)`} />
        </linearGradient>
        <linearGradient id={`${uid}-edge`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={`hsl(${hue} 60% 60%)`} stopOpacity="0.55" />
          <stop offset="12%" stopColor={`hsl(${hue} 60% 60%)`} stopOpacity="0" />
          <stop offset="88%" stopColor={`hsl(${hue} 60% 60%)`} stopOpacity="0" />
          <stop offset="100%" stopColor={`hsl(${hue} 60% 60%)`} stopOpacity="0.4" />
        </linearGradient>
        <radialGradient id={`${uid}-breathe`} cx="0.5" cy="0.32" r="0.7">
          <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-plume`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}-soft`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>

      {/* cold plume rising from the louvres */}
      <g opacity="0.85">
        <path
          d={`M ${left + 16} ${grilleTop} C ${left - 30} ${grilleTop - 70}, ${right + 34} ${grilleTop - 96}, ${cx + 10} ${grilleTop - 150}`}
          fill="none"
          stroke={`url(#${uid}-plume)`}
          strokeWidth="22"
          strokeLinecap="round"
          filter={`url(#${uid}-soft)`}
        />
      </g>

      {/* floor shadow */}
      <ellipse
        cx={cx}
        cy={bottom + 12}
        rx={body.w * 0.62}
        ry="14"
        fill="#000"
        opacity="0.5"
        filter={`url(#${uid}-soft)`}
      />

      {/* caster wheels */}
      <g fill={`hsl(${hue} 20% 12%)`} stroke={`hsl(${hue} 40% 34%)`} strokeWidth="1.5">
        <circle cx={left + 26} cy={bottom + 4} r="10" />
        <circle cx={right - 26} cy={bottom + 4} r="10" />
      </g>

      {/* main chassis */}
      <rect
        x={left}
        y={top}
        width={body.w}
        height={body.h}
        rx="18"
        fill={`url(#${uid}-body)`}
        stroke={`hsl(${hue} 40% 30%)`}
        strokeWidth="1.5"
      />
      <rect x={left} y={top} width={body.w} height={body.h} rx="18" fill={`url(#${uid}-edge)`} />

      {/* top intake grille */}
      <rect
        x={left + 14}
        y={top + 14}
        width={body.w - 28}
        height="14"
        rx="7"
        fill={`hsl(${hue} 30% 8%)`}
        stroke={`hsl(${hue} 40% 26%)`}
        strokeWidth="1"
      />
      <g stroke={accent} strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round">
        {Array.from({ length: Math.round(body.w / 16) }).map((_, i) => (
          <line
            key={i}
            x1={left + 24 + i * 16}
            y1={top + 17}
            x2={left + 24 + i * 16}
            y2={top + 25}
          />
        ))}
      </g>

      {/* cool-air louvre block */}
      <rect
        x={left + 16}
        y={grilleTop}
        width={body.w - 32}
        height={grilleH}
        rx="10"
        fill={`hsl(${hue} 32% 8%)`}
        stroke={`hsl(${hue} 40% 26%)`}
        strokeWidth="1"
      />
      <rect
        x={left + 16}
        y={grilleTop}
        width={body.w - 32}
        height={grilleH}
        rx="10"
        fill={`url(#${uid}-breathe)`}
      />
      {/* louvre slats */}
      <g stroke={accent} strokeWidth="3" strokeLinecap="round">
        {Array.from({ length: vents }).map((_, i) => {
          const y = grilleTop + ventGap * (i + 1)
          const inset = 14 + (i % 2) * 6
          return (
            <line
              key={i}
              x1={left + 16 + inset}
              y1={y}
              x2={right - 16 - inset}
              y2={y}
              opacity={0.35 + (i / vents) * 0.45}
            />
          )
        })}
      </g>

      {/* control panel */}
      <rect
        x={left + 16}
        y={bottom - 78}
        width={body.w - 32}
        height="46"
        rx="8"
        fill={`hsl(${hue} 30% 10%)`}
        stroke={`hsl(${hue} 40% 26%)`}
        strokeWidth="1"
      />
      {/* temperature readout */}
      <text
        x={cx}
        y={bottom - 48}
        textAnchor="middle"
        fontFamily="'Space Mono', monospace"
        fontSize="22"
        fontWeight="700"
        fill={accent}
        style={{ letterSpacing: '0.08em' }}
      >
        16°C
      </text>
      {/* status LEDs */}
      <g>
        <circle cx={left + 30} cy={bottom - 38} r="3.5" fill={accent} />
        <circle cx={right - 30} cy={bottom - 38} r="3.5" fill={accent} opacity="0.45" />
        <circle cx={right - 42} cy={bottom - 38} r="3.5" fill={accent} opacity="0.25" />
      </g>

      {/* series mark */}
      <text
        x={cx}
        y={top + 60}
        textAnchor="middle"
        fontFamily="'Fraunces', serif"
        fontStyle="italic"
        fontSize="17"
        fill="#eaf4f1"
        fillOpacity="0.82"
      >
        Borealis
      </text>
      <text
        x={cx}
        y={top + 78}
        textAnchor="middle"
        fontFamily="'Space Mono', monospace"
        fontSize="8.5"
        letterSpacing="4"
        fill={accent}
        fillOpacity="0.85"
      >
        {product.series.toUpperCase()}
      </text>

      {/* BTU plate */}
      <text
        x={cx}
        y={bottom + 30}
        textAnchor="middle"
        fontFamily="'Space Mono', monospace"
        fontSize="9"
        letterSpacing="3"
        fill="#8ba39c"
      >
        {product.btu.toLocaleString()} BTU
      </text>
    </svg>
  )
}
