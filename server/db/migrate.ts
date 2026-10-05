import { getDb, run, transaction } from './index.ts'

/**
 * Versioned migrations. Each entry runs exactly once, in order, and is
 * recorded in `schema_migrations`. Never edit a shipped migration — add a
 * new one, so existing databases upgrade in place.
 */
interface Migration {
  id: string
  sql: string
}

const migrations: Migration[] = [
  {
    id: '001_core_schema',
    sql: `
      -- ------------------------------------------------------------------
      -- Catalog
      -- ------------------------------------------------------------------
      CREATE TABLE products (
        id                TEXT PRIMARY KEY,
        slug              TEXT NOT NULL UNIQUE,
        name              TEXT NOT NULL,
        series            TEXT NOT NULL,
        category          TEXT NOT NULL,
        btu               INTEGER NOT NULL,
        coverage          INTEGER NOT NULL,
        price_cents       INTEGER NOT NULL CHECK (price_cents >= 0),
        compare_at_cents  INTEGER CHECK (compare_at_cents IS NULL OR compare_at_cents >= 0),
        rating            REAL NOT NULL DEFAULT 0,
        reviews           INTEGER NOT NULL DEFAULT 0,
        noise             INTEGER NOT NULL,
        energy_class      TEXT NOT NULL,
        modes             TEXT NOT NULL,   -- JSON string[]
        features          TEXT NOT NULL,   -- JSON string[]
        badge             TEXT,
        blurb             TEXT NOT NULL,
        description       TEXT NOT NULL,
        specs             TEXT NOT NULL,   -- JSON {label,value}[]
        art               TEXT NOT NULL,   -- JSON, seeds the parametric SVG
        active            INTEGER NOT NULL DEFAULT 1,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      );
      CREATE INDEX idx_products_category ON products(category);
      CREATE INDEX idx_products_active ON products(active);

      -- Stock is kept apart from the catalog row so inventory writes never
      -- contend with catalog reads.
      CREATE TABLE inventory (
        product_id            TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
        on_hand               INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
        reserved              INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
        low_stock_threshold   INTEGER NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0),
        backorderable         INTEGER NOT NULL DEFAULT 0,
        updated_at            TEXT NOT NULL,
        CHECK (reserved <= on_hand)
      );

      -- ------------------------------------------------------------------
      -- Customers and sessions
      -- ------------------------------------------------------------------
      CREATE TABLE customers (
        id             TEXT PRIMARY KEY,
        email          TEXT NOT NULL UNIQUE,
        password_hash  TEXT NOT NULL,
        first_name     TEXT NOT NULL,
        last_name      TEXT NOT NULL,
        role           TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      -- Only a digest of the session token is stored.
      CREATE TABLE sessions (
        id           TEXT PRIMARY KEY,
        customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        created_at   TEXT NOT NULL,
        expires_at   TEXT NOT NULL,
        user_agent   TEXT,
        ip           TEXT
      );
      CREATE INDEX idx_sessions_customer ON sessions(customer_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      -- ------------------------------------------------------------------
      -- Carts
      -- ------------------------------------------------------------------
      CREATE TABLE carts (
        id           TEXT PRIMARY KEY,
        customer_id  TEXT REFERENCES customers(id) ON DELETE SET NULL,
        status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted','abandoned')),
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      CREATE INDEX idx_carts_customer ON carts(customer_id);

      CREATE TABLE cart_items (
        cart_id     TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        qty         INTEGER NOT NULL CHECK (qty > 0 AND qty <= 99),
        added_at    TEXT NOT NULL,
        PRIMARY KEY (cart_id, product_id)
      );

      -- ------------------------------------------------------------------
      -- Orders
      -- ------------------------------------------------------------------
      CREATE TABLE orders (
        id                 TEXT PRIMARY KEY,
        ref                TEXT NOT NULL UNIQUE,
        customer_id        TEXT REFERENCES customers(id) ON DELETE SET NULL,
        email              TEXT NOT NULL,
        first_name         TEXT NOT NULL,
        last_name          TEXT NOT NULL,
        address_line1      TEXT NOT NULL,
        address_line2      TEXT,
        city               TEXT NOT NULL,
        postcode           TEXT NOT NULL,
        country            TEXT NOT NULL,
        subtotal_cents     INTEGER NOT NULL CHECK (subtotal_cents >= 0),
        shipping_cents     INTEGER NOT NULL CHECK (shipping_cents >= 0),
        tax_cents          INTEGER NOT NULL CHECK (tax_cents >= 0),
        total_cents        INTEGER NOT NULL CHECK (total_cents >= 0),
        currency           TEXT NOT NULL DEFAULT 'usd',
        status             TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','paid','failed','cancelled','fulfilled','refunded')),
        payment_provider   TEXT,
        payment_intent_id  TEXT,
        payment_status     TEXT
                             CHECK (payment_status IS NULL OR payment_status IN
                               ('requires_payment','processing','succeeded','failed','refunded')),
        placed_at          TEXT NOT NULL,
        updated_at         TEXT NOT NULL
      );
      CREATE INDEX idx_orders_customer ON orders(customer_id);
      CREATE INDEX idx_orders_email ON orders(email);
      CREATE INDEX idx_orders_status ON orders(status);
      CREATE INDEX idx_orders_payment_intent ON orders(payment_intent_id);

      CREATE TABLE order_items (
        id                TEXT PRIMARY KEY,
        order_id          TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id        TEXT REFERENCES products(id) ON DELETE SET NULL,
        slug              TEXT NOT NULL,
        name              TEXT NOT NULL,
        unit_price_cents  INTEGER NOT NULL CHECK (unit_price_cents >= 0),
        qty               INTEGER NOT NULL CHECK (qty > 0),
        line_total_cents  INTEGER NOT NULL CHECK (line_total_cents >= 0)
      );
      CREATE INDEX idx_order_items_order ON order_items(order_id);

      -- ------------------------------------------------------------------
      -- Audit trails
      -- ------------------------------------------------------------------
      CREATE TABLE stock_movements (
        id              TEXT PRIMARY KEY,
        product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        on_hand_delta   INTEGER NOT NULL DEFAULT 0,
        reserved_delta  INTEGER NOT NULL DEFAULT 0,
        reason          TEXT NOT NULL
                          CHECK (reason IN ('seed','reservation','release','sale','restock','adjustment')),
        order_id        TEXT REFERENCES orders(id) ON DELETE SET NULL,
        note            TEXT,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
      CREATE INDEX idx_stock_movements_order ON stock_movements(order_id);

      CREATE TABLE payment_events (
        id                 TEXT PRIMARY KEY,
        order_id           TEXT REFERENCES orders(id) ON DELETE SET NULL,
        provider           TEXT NOT NULL,
        type               TEXT NOT NULL,
        provider_event_id  TEXT,
        amount_cents       INTEGER,
        payload            TEXT NOT NULL,   -- JSON
        created_at         TEXT NOT NULL
      );
      CREATE INDEX idx_payment_events_order ON payment_events(order_id);

      -- Provider webhook ids already handled, so retries are idempotent.
      CREATE TABLE webhook_events (
        id           TEXT PRIMARY KEY,
        provider     TEXT NOT NULL,
        received_at  TEXT NOT NULL
      );
    `,
  },
  {
    id: '002_inventory_ledger_view',
    sql: `
      -- Available-to-promise is on_hand minus what active orders are holding.
      CREATE VIEW inventory_levels AS
        SELECT
          p.id                AS product_id,
          p.slug,
          p.name,
          p.price_cents,
          i.on_hand,
          i.reserved,
          (i.on_hand - i.reserved) AS available,
          i.low_stock_threshold,
          i.backorderable,
          CASE
            WHEN (i.on_hand - i.reserved) > i.low_stock_threshold THEN 'in_stock'
            WHEN (i.on_hand - i.reserved) > 0                        THEN 'low_stock'
            WHEN i.backorderable = 1                                 THEN 'backorder'
            ELSE 'out_of_stock'
          END AS stock_status
        FROM products p
        JOIN inventory i ON i.product_id = p.id;
    `,
  },
  {
    id: '003_stock_reservations',
    sql: `
      -- Exactly what each order is holding, so commit/release are precise and
      -- idempotent, and abandoned checkouts can be swept.
      CREATE TABLE stock_reservations (
        order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        qty         INTEGER NOT NULL CHECK (qty > 0),
        status      TEXT NOT NULL DEFAULT 'held'
                      CHECK (status IN ('held','committed','released')),
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (order_id, product_id)
      );
      CREATE INDEX idx_stock_reservations_status ON stock_reservations(status, created_at);
      CREATE INDEX idx_stock_reservations_product ON stock_reservations(product_id);
    `,
  },
]

export function migrate(): { applied: string[] } {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL
    );
  `)

  const already = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]).map((r) => r.id),
  )

  const applied: string[] = []
  for (const migration of migrations) {
    if (already.has(migration.id)) continue
    transaction(() => {
      db.exec(migration.sql)
      run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
        migration.id,
        new Date().toISOString(),
      ])
    })
    applied.push(migration.id)
  }

  return { applied }
}

export const migrationIds = migrations.map((m) => m.id)
