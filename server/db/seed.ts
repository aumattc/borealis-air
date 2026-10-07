import { queryOne, run, transaction } from '../db/index.ts'
import { products, type Product } from '../../src/data/products.ts'

/**
 * Seeds the catalog from the storefront's own product file, so the frontend
 * and the database can never drift apart. Prices are converted to cents here
 * and only here.
 */

/** Deterministic opening stock, so reseeding is reproducible. */
const STOCK: Record<string, { onHand: number; lowStockThreshold: number; backorderable?: boolean }> = {
  'ba-01': { onHand: 42, lowStockThreshold: 5 },
  'ba-02': { onHand: 28, lowStockThreshold: 5 },
  'ba-03': { onHand: 4, lowStockThreshold: 5 },
  'ba-04': { onHand: 16, lowStockThreshold: 4 },
  'ba-05': { onHand: 21, lowStockThreshold: 5 },
  'ba-06': { onHand: 33, lowStockThreshold: 5 },
  'ba-07': { onHand: 3, lowStockThreshold: 5 },
  // Tundra is the flagship backorder unit in the storefront copy.
  'ba-08': { onHand: 0, lowStockThreshold: 2, backorderable: true },
}

const DEFAULT_STOCK = { onHand: 10, lowStockThreshold: 3 }

function productParams(p: Product): unknown[] {
  const now = new Date().toISOString()
  return [
    p.id,
    p.slug,
    p.name,
    p.series,
    p.category,
    p.btu,
    p.coverage,
    // The storefront stores whole dollars; the database stores cents.
    p.price * 100,
    p.compareAt ? p.compareAt * 100 : null,
    p.rating,
    p.reviews,
    p.noise,
    p.energyClass,
    JSON.stringify(p.modes),
    JSON.stringify(p.features),
    p.badge ?? null,
    p.blurb,
    p.description,
    JSON.stringify(p.specs),
    JSON.stringify(p.art),
    1,
    now,
    now,
  ]
}

export interface SeedResult {
  products: number
  inventory: number
}

/**
 * Inserts any product that is missing. Existing rows are left untouched so
 * reseeding never clobbers a price or stock level that was changed in
 * production.
 */
export function seedCatalog(): SeedResult {
  return transaction(() => {
    let insertedProducts = 0
    let insertedInventory = 0
    const now = new Date().toISOString()

    for (const product of products) {
      const existing = queryOne<{ id: string }>('SELECT id FROM products WHERE id = ?', [product.id])
      if (existing) continue

      run(
        `INSERT INTO products (
           id, slug, name, series, category, btu, coverage,
           price_cents, compare_at_cents, rating, reviews, noise, energy_class,
           modes, features, badge, blurb, description, specs, art, active,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        productParams(product),
      )
      insertedProducts++

      const stock = STOCK[product.id] ?? DEFAULT_STOCK
      run(
        `INSERT INTO inventory
           (product_id, on_hand, reserved, low_stock_threshold, backorderable, updated_at)
         VALUES (?, ?, 0, ?, ?, ?)`,
        [product.id, stock.onHand, stock.lowStockThreshold, stock.backorderable ? 1 : 0, now],
      )
      run(
        `INSERT INTO stock_movements
           (id, product_id, on_hand_delta, reserved_delta, reason, order_id, note, created_at)
         VALUES (?, ?, ?, 0, 'seed', NULL, 'initial stock', ?)`,
        [`seed_${product.id}`, product.id, stock.onHand, now],
      )
      insertedInventory++
    }

    return { products: insertedProducts, inventory: insertedInventory }
  })
}

export const seedStockConfig = STOCK

