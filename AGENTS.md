# Borealis Air тАФ working notes

Storefront for portable air conditioners. Vite + React 18 + TypeScript, React Router.

## Commands
- `npm run dev` тАФ dev server on `0.0.0.0:12000` (the work-host port).
- `npm run build` тАФ `tsc -b` then `vite build`. Type errors fail the build.
- `npm run preview` тАФ serve `dist/` on port 12000.
- `npm run api` тАФ storefront API on `0.0.0.0:12001`.
- `npm run api:dev` тАФ same, with `--watch`.
- `npm run api:test` тАФ backend test suite (`node:test`).
- `npm run api:admin -- --email you@example.com` тАФ create/promote an admin.

## Backend (`server/`)
A zero-dependency API on Node 24 built-ins (`node:http`, `node:sqlite`, native
TypeScript). No npm packages, no native builds. Details in `server/README.md`.

- Entry `server/index.ts`; wiring in `server/app.ts`; env in `server/config.ts`.
- Money is **integer cents** everywhere in the backend. `src/data/products.ts` stays
  the single source of truth for the catalog; `server/db/seed.ts` imports it.
- Inventory uses a reservation model: checkout *reserves*, a paid webhook *sells*,
  a failed/expired payment *releases*. `available = on_hand - reserved`. Never write
  to `inventory` directly тАФ go through `server/services/inventory.ts` so the
  `stock_movements` ledger stays complete.
- Payments go through `server/payments/` (`mock` for dev, `stripe` for production).
  Webhooks are signature-verified and idempotent. The mock provider is refused in
  production.
- The frontend talks to the API via `src/lib/api.ts`. Vite proxies `/api` to
  `127.0.0.1:12001` so session and cart cookies stay first-party.

## Conventions
- `server.allowedHosts: true` in `vite.config.ts` is required, otherwise the
  `*.prod-runtime.all-hands.dev` proxy returns "Blocked request".
- Styling is plain CSS, no framework. Two layers:
  - `src/styles/global.css` тАФ tokens (`:root`), resets, typography, buttons, layout.
  - `src/styles/app.css` тАФ component and page styles, ordered to override global.
  Class naming is BEM-ish (`card__body`, `.btn--ember`).
- Design language is "Cold Front": dark green-tinted ink, frost type, glacier-cyan
  accent, ember/coral reserved for CTAs and sale flags. Keep that split.
- Fonts: Fraunces (display), Outfit (body), Space Mono (labels/prices) via Google Fonts.

## Things worth knowing
- Product imagery is **parametric SVG** (`src/components/UnitArt.tsx`), generated from
  each product's `art` config (`hue`, `accent`, `vents`, `proportions`). No bitmaps тАФ
  never introduce image URLs for products.
- Catalog lives in `src/data/products.ts`. Prices are integers in USD.
- Cart state: `src/hooks/useCart.tsx`, persisted to `localStorage` under `borealis.cart.v1`.
- Orders are now persisted by the backend and read back via `src/lib/api.ts`.
  `src/lib/orders.ts` (`borealis.orders.v1`) is kept only for its types and legacy
  reads; it is no longer written on checkout.
- **Payments use hosted checkout.** The storefront never collects card data.
  `POST /api/checkout` creates an order, reserves stock, and returns a
  `checkoutUrl`; the browser redirects there (Stripe Checkout in production, an
  in-app mock page in development) and returns to `/order/:ref?checkout=success`.
  The webhook settles the order. `src/pages/MockCheckout.tsx` is the dev-only
  stand-in and is only reachable when the mock provider is active.
- **Admin CMS lives at `/admin`** (`src/pages/admin/`), a separate surface with
  its own chrome and auth gate (`useAdminAuth`). It manages products, inventory,
  orders and Stripe credentials. Backend routes are under `/api/admin/*` and all
  call `requireAdmin`. Product CRUD is in `server/services/products.ts`.
- Stripe credentials are managed at runtime: `server/services/settings.ts` stores
  them encrypted (AES-256-GCM, `server/lib/secrets.ts`) with separate sandbox and
  production slots and an active-mode switch. Env vars remain the fallback.
  `getProvider()` resolves credentials per request, so a mode change needs no
  restart. The admin UI only ever sees a masked preview.
- Scroll reveals use `useRevealObserver()` (mounted once in `App.tsx`) plus the
  `.reveal` / `.is-in` classes. Two constraints to keep in mind:
  - The hidden state lives under `.js-motion .reveal` in global.css. That class is
    added at runtime, so if the effect ever fails the content stays visible rather
    than disappearing. Do not move `opacity: 0` back onto bare `.reveal`.
  - Reveal positions are measured with `getBoundingClientRect`, not
    IntersectionObserver тАФ IO and `requestAnimationFrame` callbacks do not fire in
    headless renderers or some webviews, which leaves the page stuck invisible.
- Respect `prefers-reduced-motion` тАФ global.css already disables animation for it.
