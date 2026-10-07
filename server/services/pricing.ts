import { config } from '../config.ts'

/**
 * Money is handled in integer cents everywhere. All totals the customer sees
 * are recomputed here from catalog prices — the client is never trusted to
 * send an amount.
 */

export interface PricedLine {
  productId: string
  slug: string
  name: string
  unitPriceCents: number
  qty: number
  lineTotalCents: number
}

export interface Totals {
  lines: PricedLine[]
  subtotalCents: number
  shippingCents: number
  taxCents: number
  totalCents: number
  currency: 'usd'
  freeShippingRemainingCents: number
}

export function computeTotals(lines: PricedLine[]): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0)

  const shippingCents =
    subtotalCents === 0 || subtotalCents >= config.freeShippingThresholdCents
      ? 0
      : config.shippingFlatCents

  // Tax applies to goods, not to shipping — the common US treatment.
  const taxCents = Math.round(subtotalCents * config.taxRate)

  return {
    lines,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents: subtotalCents + shippingCents + taxCents,
    currency: 'usd',
    freeShippingRemainingCents: Math.max(config.freeShippingThresholdCents - subtotalCents, 0),
  }
}

/** Rescales a discount proportionally across lines, preserving the total. */
export function applyDiscount(totals: Totals, discountCents: number): Totals {
  const discount = Math.min(Math.max(discountCents, 0), totals.subtotalCents)
  if (discount === 0) return totals

  const ratio = (totals.subtotalCents - discount) / totals.subtotalCents
  const lines = totals.lines.map((l) => {
    const lineTotalCents = Math.round(l.lineTotalCents * ratio)
    return { ...l, lineTotalCents, unitPriceCents: Math.round(lineTotalCents / l.qty) }
  })

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0)
  const shippingCents =
    subtotalCents >= config.freeShippingThresholdCents ? 0 : totals.shippingCents
  const taxCents = Math.round(subtotalCents * config.taxRate)

  return {
    ...totals,
    lines,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents: subtotalCents + shippingCents + taxCents,
    freeShippingRemainingCents: Math.max(config.freeShippingThresholdCents - subtotalCents, 0),
  }
}
