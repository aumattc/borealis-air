export interface OrderLine {
  name: string
  qty: number
  price: number
  slug: string
}

export interface Order {
  ref: string
  placedAt: string
  email: string
  name: string
  address: string
  lines: OrderLine[]
  subtotal: number
  shipping: number
  tax: number
  total: number
}

const KEY = 'borealis.orders.v1'

export function saveOrder(order: Order) {
  try {
    const all = readOrders()
    all[order.ref] = order
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable */
  }
}

export function getOrder(ref: string): Order | null {
  return readOrders()[ref] ?? null
}

function readOrders(): Record<string, Order> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Order>
  } catch {
    return {}
  }
}
