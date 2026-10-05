import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react'
import { products, type Product } from '../data/products'

export interface CartLine {
  productId: string
  qty: number
}

type Action =
  | { type: 'add'; productId: string; qty: number }
  | { type: 'setQty'; productId: string; qty: number }
  | { type: 'remove'; productId: string }
  | { type: 'clear' }

const STORAGE_KEY = 'borealis.cart.v1'

function reducer(lines: CartLine[], action: Action): CartLine[] {
  switch (action.type) {
    case 'add': {
      const existing = lines.find((l) => l.productId === action.productId)
      if (existing) {
        return lines.map((l) =>
          l.productId === action.productId ? { ...l, qty: Math.min(l.qty + action.qty, 99) } : l,
        )
      }
      return [...lines, { productId: action.productId, qty: action.qty }]
    }
    case 'setQty':
      if (action.qty <= 0) return lines.filter((l) => l.productId !== action.productId)
      return lines.map((l) =>
        l.productId === action.productId ? { ...l, qty: Math.min(action.qty, 99) } : l,
      )
    case 'remove':
      return lines.filter((l) => l.productId !== action.productId)
    case 'clear':
      return []
    default:
      return lines
  }
}

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CartLine[]
    return parsed.filter((l) => products.some((p) => p.id === l.productId))
  } catch {
    return []
  }
}

export interface CartItem extends CartLine {
  product: Product
  lineTotal: number
}

interface CartValue {
  items: CartItem[]
  count: number
  subtotal: number
  shipping: number
  tax: number
  total: number
  lastAdded: Product | null
  add: (productId: string, qty?: number) => void
  setQty: (productId: string, qty: number) => void
  remove: (productId: string) => void
  clear: () => void
}

const CartContext = createContext<CartValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(reducer, undefined, load)
  const [lastAdded, setLastAdded] = useState<Product | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      /* storage unavailable — cart simply won't persist */
    }
  }, [lines])

  const value = useMemo<CartValue>(() => {
    const items: CartItem[] = lines.flatMap((l) => {
      const product = products.find((p) => p.id === l.productId)
      if (!product) return []
      return [{ ...l, product, lineTotal: product.price * l.qty }]
    })
    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0)
    const shipping = subtotal === 0 || subtotal >= 300 ? 0 : 29
    const tax = Math.round(subtotal * 0.0825)
    return {
      items,
      count: items.reduce((sum, i) => sum + i.qty, 0),
      subtotal,
      shipping,
      tax,
      total: subtotal + shipping + tax,
      lastAdded,
      add: (productId, qty = 1) => {
        dispatch({ type: 'add', productId, qty })
        const p = products.find((x) => x.id === productId) ?? null
        setLastAdded(p)
      },
      setQty: (productId, qty) => dispatch({ type: 'setQty', productId, qty }),
      remove: (productId) => dispatch({ type: 'remove', productId }),
      clear: () => dispatch({ type: 'clear' }),
    }
  }, [lines, lastAdded])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}
