# Borealis Air — working notes

Storefront for portable air conditioners. Vite + React 18 + TypeScript, React Router.

## Commands
- `npm run dev` — dev server on `0.0.0.0:12000` (the work-host port).
- `npm run build` — `tsc -b` then `vite build`. Type errors fail the build.
- `npm run preview` — serve `dist/` on port 12000.

## Conventions
- `server.allowedHosts: true` in `vite.config.ts` is required, otherwise the
  `*.prod-runtime.all-hands.dev` proxy returns "Blocked request".
- Styling is plain CSS, no framework. Two layers:
  - `src/styles/global.css` — tokens (`:root`), resets, typography, buttons, layout.
  - `src/styles/app.css` — component and page styles, ordered to override global.
  Class naming is BEM-ish (`card__body`, `.btn--ember`).
- Design language is "Cold Front": dark green-tinted ink, frost type, glacier-cyan
  accent, ember/coral reserved for CTAs and sale flags. Keep that split.
- Fonts: Fraunces (display), Outfit (body), Space Mono (labels/prices) via Google Fonts.

## Things worth knowing
- Product imagery is **parametric SVG** (`src/components/UnitArt.tsx`), generated from
  each product's `art` config (`hue`, `accent`, `vents`, `proportions`). No bitmaps —
  never introduce image URLs for products.
- Catalog lives in `src/data/products.ts`. Prices are integers in USD.
- Cart state: `src/hooks/useCart.tsx`, persisted to `localStorage` under `borealis.cart.v1`.
- Orders are simulated and stored locally (`src/lib/orders.ts`, `borealis.orders.v1`).
  Checkout never transmits card data.
- Scroll reveals use `useReveal` + the `.reveal`/`.is-in` classes.
- Respect `prefers-reduced-motion` — global.css already disables animation for it.
