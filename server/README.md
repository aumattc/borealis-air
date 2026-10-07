# Borealis Air — Storefront API

Backend for the Borealis Air storefront: catalog, inventory, cart, checkout,
customers, and payments.

It runs on **Node 24 built-ins only** — `node:http`, `node:sqlite`, and Node's
native TypeScript execution. There are no runtime npm dependencies and no native
build steps.

## Running it

```bash
npm run api                 # start on 0.0.0.0:12001
npm run api:dev             # same, restarting on change
npm run api:test            # integration tests
npm run api:admin -- --email you@example.com   # create or promote an admin
```

The database is created on first boot at `server/data/borealis.db` (SQLite,
WAL mode). Migrations and the catalog seed run automatically at startup.

During development, run the API and the storefront together. Vite proxies `/api`
to `127.0.0.1:12001`, so cookies are first-party and no CORS setup is needed.

```bash
npm run api    # terminal 1
npm run dev    # terminal 2
```

## Configuration

All settings come from the environment; every one has a working default for
local development. See `server/config.ts` for the full list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `12001` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `NODE_ENV` | `development` | `production` enforces real secrets |
| `DATABASE_PATH` | `server/data/borealis.db` | SQLite file, or `:memory:` |
|  `CORS_ORIGINS` | `http://localhost:12000` | Allowed CORS origin |
| `SESSION_SECRET` | dev value | Required in production |
| `SETTINGS_ENCRYPTION_KEY` | falls back to `SESSION_SECRET` | Encrypts stored Stripe credentials. Required in production |
| `STOREFRONT_URL` | `http://localhost:12000` | Origin used for checkout success/cancel redirects |
| `CURRENCY` | `usd` | Currency for new orders |
| `PAYMENT_PROVIDER` | `mock` | `mock` or `stripe` — the fallback when the CMS has no choice stored |
| `STRIPE_SECRET_KEY` | — | Fallback for `stripe` |
| `STRIPE_WEBHOOK_SECRET` | — | Fallback for `stripe` |
| `STRIPE_PUBLISHABLE_KEY` | — | Fallback for `stripe`; returned to the client |
| `TRUST_PROXY` | `true` | Honour `X-Forwarded-For` |
| `RL_*` | see config | Request throttles |

Stripe credentials are normally managed in the admin CMS (see below); the
environment variables are the fallback for deployments that keep secrets out of
the database.

## API

All request and response bodies are JSON. Money is an **integer number of
cents**; the frontend converts to whole dollars for display. Session and cart
cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.

### Catalog

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/products` | Filters: `category`, `series`, `minBtu`, `maxBtu`, `minPrice`, `maxPrice`, `inStock`, `search`, `sort`, `page`, `limit` |
| `GET` | `/api/products/:slug` | Includes live `available` and `stockStatus` |
| `GET` | `/api/categories` | Categories with product counts |
| `GET` | `/api/health` | Liveness probe |

### Cart

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/cart` | Creates a guest cart if none exists |
| `POST` | `/api/cart/items` | `{ productId, qty }` |
| `PATCH` | `/api/cart/items/:productId` | `{ qty }`; `0` removes the line |
| `DELETE` | `/api/cart/items/:productId` | Remove a line |
| `DELETE` | `/api/cart` | Empty the cart |

Totals are always recomputed server-side.

### Checkout and orders

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/checkout/config` | Public: active checkout style, mode, publishable key |
| `POST` | `/api/checkout` | Places an order, reserves stock, returns a hosted `checkoutUrl` |
| `GET` | `/api/orders/:ref` | Order lookup by reference |
| `POST` | `/api/orders/:ref/cancel` | Cancel a pending order and release its hold |
| `POST` | `/api/webhooks/payments` | Provider webhook (signature verified) |
| `POST` | `/api/dev/payments/:intentId/confirm` | **Development only** payment simulator |

`POST /api/checkout` expects the same fields the storefront collects:

```json
{
  "email": "you@example.com",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "addressLine1": "12 Frost Lane",
  "city": "Reykjavik",
  "postcode": "101",
  "country": "Iceland"
}
```

It responds with the order and the redirect target:

```json
{
  "order": { "ref": "BA-XXXXXXXX", "status": "pending", "totalCents": 140509, "...": "..." },
  "payment": {
    "provider": "stripe",
    "intentId": "pi_...",
    "clientSecret": null,
    "status": "requires_payment",
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_...",
    "sessionId": "cs_...",
    "checkoutStyle": "stripe"
  }
}
```

The shopper is redirected to `checkoutUrl`; card details are entered there and
never reach this server. The order settles when the provider webhook arrives.

### Authentication

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Creates a customer and signs them in |
| `POST` | `/api/auth/login` | Signs in |
| `POST` | `/api/auth/logout` | Ends the session |
| `GET` | `/api/auth/me` | Current customer |
| `PATCH` | `/api/auth/me` | Update name |
| `POST` | `/api/auth/password` | Change password; revokes other sessions |
| `GET` | `/api/account/orders` | The customer's order history |

Passwords are hashed with scrypt and a per-user salt. Session tokens are random
and stored hashed, so a database leak does not expose usable tokens. A guest
cart is adopted by the account on sign-in.

### Admin

All admin routes require an `admin` role.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/admin/overview` | Order, revenue, and stock summary |
| `GET` | `/api/admin/inventory` | Stock levels and status |
| `PATCH` | `/api/admin/inventory/:productId` | `{ onHandDelta, note }` — adjust stock |
| `GET` | `/api/admin/inventory/:productId/movements` | Stock ledger |
| `POST` | `/api/admin/inventory/release-expired` | Release expired reservations |
| `GET` | `/api/admin/orders` | List and filter orders |
| `GET` | `/api/admin/orders/:ref` | Order detail |
| `POST` | `/api/admin/orders/:ref/fulfill` | Mark a paid order fulfilled |
| `POST` | `/api/admin/orders/:ref/refund` | Refund a paid order |

### Admin CMS

Product CRUD and payment settings, also admin-only.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/admin/products` | Filters: `q`, `category`, `includeInactive`, `limit`, `offset` |
| `GET` | `/api/admin/products/:id` | Product detail, including stock |
| `POST` | `/api/admin/products` | Create a product and its inventory row |
| `PUT` | `/api/admin/products/:id` | Update a product |
| `DELETE` | `/api/admin/products/:id` | Delete, or deactivate if it has order history |
| `POST` | `/api/admin/products/:id/restore` | Reactivate a deactivated product |
| `GET` | `/api/admin/settings/payments` | Stripe settings; secrets are masked |
| `PUT` | `/api/admin/settings/payments` | Set keys, active mode, checkout style, or clear a mode |

A product's stock row is created in the same transaction as the product, so a
product is never visible without inventory tracking. Prices are sent and stored
as integer cents. `DELETE` keeps historical order lines intact by deactivating
products that appear on an order rather than removing them.

## How inventory works

Stock is tracked as two counters per product: `on_hand` and `reserved`.

```
available = on_hand - reserved
```

The lifecycle of a unit:

1. **Reserve** — checkout takes a hold on the units and records a `reservation`
   movement. The order is `pending` and `requires_payment`.
2. **Sell** — a signed payment webhook moves the hold to a sale: `on_hand`
   decreases, `reserved` decreases, a `sale` movement is recorded, and the order
   becomes `paid`.
3. **Release** — a failed payment, a cancellation, or an expired hold frees the
   units and records a `release` movement.

Every change is written to `stock_movements`, so the current figures can always
be reconciled against a full ledger. Adjustments go through
`server/services/inventory.ts`; nothing writes to `inventory` directly.

Reservations are taken inside a transaction, so two shoppers cannot both buy the
last unit. The loser gets a `409` with the remaining quantity.

## Payments

`server/payments/` defines a small `PaymentProvider` interface with two
implementations.

- **`mock`** — the default for development. It produces hosted-checkout
  stand-ins and correctly signed webhooks, so the real redirect-and-return path
  is exercised end to end. `POST /api/checkout` returns a `checkoutUrl` pointing
  at the storefront's `/checkout/mock` page; confirming there calls
  `/api/dev/payments/:intentId/confirm`, which signs a genuine webhook and feeds
  it through the same handler production uses. This provider is refused when
  `NODE_ENV=production`.
- **`stripe`** — a real client over the Stripe REST API using `fetch`. Checkout
  uses **Stripe-hosted Checkout Sessions** (`POST /v1/checkout/sessions`), so card
  data is entered on Stripe's page and never reaches this server. Webhook
  signatures are verified with a timing-safe comparison and a timestamp
  tolerance window.

Webhook handling is idempotent: each event id is recorded once, and an order
that is already settled is not settled again. Amounts are checked against the
order total, and a mismatch is rejected rather than trusted.

### Managing Stripe credentials in the CMS

Sign in at `/admin/payments`. Credentials are stored per mode — **sandbox** and
**production** — encrypted at rest with AES-256-GCM (key derived from
`SETTINGS_ENCRYPTION_KEY`). The API never returns a stored secret; the admin UI
sees only a masked preview. Two switches decide what the storefront charges
with: the active mode (`sandbox` or `production`) and the checkout style
(`stripe` or `mock`). `getProvider()` reads these per request, so a change takes
effect without a restart. Clearing a mode removes its keys entirely.

Environment fallback still works: if no CMS value is stored, the matching
`STRIPE_*` variable is used, and the admin UI labels it `(environment)`.

### Using Stripe

Either configure the keys in `/admin/payments`, or set them in the environment:

```bash
export PAYMENT_PROVIDER=stripe
export STRIPE_SECRET_KEY=sk_live_...
export STRIPE_WEBHOOK_SECRET=whsec_...
export STRIPE_PUBLISHABLE_KEY=pk_live_...
export SETTINGS_ENCRYPTION_KEY=<32+ random bytes>
export NODE_ENV=production
```

Point a Stripe webhook endpoint at `/api/webhooks/payments` and subscribe to
`checkout.session.completed`, `checkout.session.expired`,
`checkout.session.async_payment_succeeded`/`_failed`, and the
`payment_intent.*` equivalents.

## Tests

```bash
npm run api:test
```

The suite boots the real app against an in-memory database and exercises the
catalog, cart, checkout, payments, auth, and admin flows. It covers the cases
that matter most: oversell protection under concurrent checkouts, webhook
idempotency, rejected unsigned or forged webhooks, amount mismatches, and admin
authorization.

## Layout

```
server/
  config.ts            environment and validation
  index.ts             entry point
  app.ts               route wiring
  db/                  connection, migrations, seed
  http/                server, router, cookies, auth guards, responses
  lib/                 errors, crypto, validation, logging, rate limiting
  payments/            provider interface, mock, stripe
  routes/              HTTP handlers grouped by area
  scripts/             admin bootstrap
  services/            business logic
  tests/               integration tests
```
