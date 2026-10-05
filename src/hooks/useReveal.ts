import { useEffect } from 'react'

/**
 * Reveals every `.reveal` element as it scrolls into view.
 *
 * Two deliberate safety choices:
 *  - The hidden state is gated behind a `js-motion` class added here, so if
 *    this effect never runs the content stays fully visible instead of
 *    disappearing.
 *  - Positions are measured with getBoundingClientRect on the main thread.
 *    IntersectionObserver and requestAnimationFrame callbacks do not fire in
 *    headless renderers or some webviews, which would otherwise leave the
 *    page stuck at opacity 0.
 *
 * Runs globally from the app shell, so components only need the CSS class.
 * A MutationObserver re-checks after DOM changes, covering filtered grids
 * and route transitions.
 */
export function useRevealObserver() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('js-motion')

    let last = 0
    const check = () => {
      last = Date.now()
      const viewport = window.innerHeight || root.clientHeight
      document.querySelectorAll('.reveal:not(.is-in)').forEach((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.top < viewport * 0.94 && rect.bottom > 0) el.classList.add('is-in')
      })
    }

    check()

    const onScroll = () => {
      if (Date.now() - last > 80) check()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    const mutations = new MutationObserver(check)
    mutations.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      mutations.disconnect()
      root.classList.remove('js-motion')
    }
  }, [])
}
