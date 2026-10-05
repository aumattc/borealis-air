import { useEffect, useRef } from 'react'

/**
 * Adds the `is-in` class once an element scrolls into view.
 * Pair with the `.reveal` class for the staggered entrance.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number
  once?: boolean
}) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in')
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            if (options?.once !== false) observer.unobserve(entry.target)
          }
        }
      },
      { threshold: options?.threshold ?? 0.15, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [options?.threshold, options?.once])

  return ref
}
