import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES, products } from '../data/products'
import { ProductCard } from '../components/ProductCard'
import { UnitArt } from '../components/UnitArt'
import { useReveal } from '../hooks/useReveal'

const HERO = products.find((p) => p.slug === 'borealis-glacier')!

function BtuFinder() {
  const [area, setArea] = useState(400)
  const [sunny, setSunny] = useState(true)
  const [occupants, setOccupants] = useState(2)

  const { btu, match } = useMemo(() => {
    // 20 BTU per sq ft, +10% for a sun-exposed room, +600 per extra occupant.
    const base = area * 20
    const sun = sunny ? base * 0.1 : 0
    const people = Math.max(0, occupants - 2) * 600
    const needed = Math.round((base + sun + people) / 100) * 100
    const sorted = [...products].sort((a, b) => a.btu - b.btu)
    const match = sorted.find((p) => p.btu >= needed) ?? sorted[sorted.length - 1]
    return { btu: needed, match }
  }, [area, sunny, occupants])

  return (
    <div className="finder panel reveal">
      <div className="finder__head">
        <p className="eyebrow">BTU finder</p>
        <h3 className="display finder__title">
          Size it <em>right.</em>
        </h3>
        <p className="lede finder__lede">
          Undersize and it never catches up. Oversize and it short-cycles. Three questions gets you
          the honest answer.
        </p>
      </div>

      <div className="finder__controls">
        <label className="field">
          <span className="field__label mono dim">Room size — {area} sq ft</span>
          <input
            type="range"
            min={100}
            max={1000}
            step={25}
            value={area}
            onChange={(e) => setArea(Number(e.target.value))}
            className="range"
          />
        </label>

        <label className="field">
          <span className="field__label mono dim">Extra occupants — {occupants}</span>
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={occupants}
            onChange={(e) => setOccupants(Number(e.target.value))}
            className="range"
          />
        </label>

        <label className="switch">
          <input
            type="checkbox"
            checked={sunny}
            onChange={(e) => setSunny(e.target.checked)}
          />
          <span className="switch__track" aria-hidden="true">
            <span className="switch__thumb" />
          </span>
          <span>Room gets direct sun</span>
        </label>
      </div>

      <div className="finder__result">
        <div className="finder__number">
          <span className="mono dim">You need about</span>
          <strong>{btu.toLocaleString()}</strong>
          <span className="mono dim">BTU</span>
        </div>
        <div className="finder__match">
          <span className="mono dim">Best match</span>
          <Link to={`/product/${match.slug}`} className="finder__match-link">
            {match.name}
            <span className="mono"> {match.btu.toLocaleString()} BTU · {match.coverage} sq ft</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

export function Home() {
  const featured = products.filter((p) => ['ba-02', 'ba-01', 'ba-04', 'ba-07'].includes(p.id))
  const heroRef = useReveal<HTMLDivElement>({ threshold: 0.05 })

  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="hero">
        <div className="wrap hero__inner">
          <div className="hero__copy">
            <p className="eyebrow hero__eyebrow">Portable climate control</p>
            <h1 className="display hero__title">
              The cold front
              <br />
              <em>arrives at your desk.</em>
            </h1>
            <p className="lede hero__lede">
              Borealis Air builds portable air conditioners for people who actually read the spec
              sheet. Real BTU ratings. Honest decibel figures. No “cooling fan” nonsense.
            </p>
            <div className="hero__actions">
              <Link to="/shop" className="btn btn--ember">
                Shop the range
              </Link>
              <a href="#finder" className="btn btn--ghost">
                Find my BTU
              </a>
            </div>
            <dl className="hero__stats">
              <div>
                <dt className="mono dim">Units shipped</dt>
                <dd>62,400+</dd>
              </div>
              <div>
                <dt className="mono dim">Avg. rating</dt>
                <dd>4.7 / 5</dd>
              </div>
              <div>
                <dt className="mono dim">Quietest unit</dt>
                <dd>47 dB</dd>
              </div>
            </dl>
          </div>

          <div className="hero__art" ref={heroRef}>
            <div className="hero__art-frame reveal">
              <UnitArt product={HERO} className="hero__unit" />
            </div>
            <div className="hero__callout hero__callout--1 reveal" style={{ transitionDelay: '160ms' }}>
              <span className="mono dim">Now cooling</span>
              <strong>19.5°C</strong>
            </div>
            <div className="hero__callout hero__callout--2 reveal" style={{ transitionDelay: '320ms' }}>
              <span className="mono dim">Draw</span>
              <strong>740 W</strong>
            </div>
            <p className="hero__caption mono">
              Borealis Glacier · 12,000 BTU · Inverter
            </p>
          </div>
        </div>
        <div className="hero__marquee" aria-hidden="true">
          <div className="hero__marquee-track">
            {Array.from({ length: 2 }).map((_, dup) => (
              <span key={dup}>
                {[
                  'R32 refrigerant',
                  'Inverter compressors',
                  'Self-evaporative',
                  'Dual filtration',
                  '3-year warranty',
                  'Free shipping over $300',
                  'Low-GWP',
                  'Whisper mode',
                ].map((t) => (
                  <em key={t}>{t}</em>
                ))}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- BTU finder ---------------- */}
      <section className="section" id="finder">
        <div className="wrap">
          <BtuFinder />
        </div>
      </section>

      {/* ---------------- Categories ---------------- */}
      <section className="section">
        <div className="wrap">
          <div className="section__head">
            <p className="eyebrow">Browse</p>
            <h2 className="display section__title">
              Four ways <em>to get cold.</em>
            </h2>
          </div>
          <div className="cats">
            {CATEGORIES.filter((c) => c.id !== 'all').map((cat, i) => {
              const sample = products.find((p) => p.category === cat.id)!
              return (
                <Link
                  key={cat.id}
                  to={`/shop?category=${cat.id}`}
                  className="cat reveal"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <div className="cat__art">
                    <UnitArt product={sample} />
                  </div>
                  <div className="cat__text">
                    <h3>{cat.label}</h3>
                    <p className="dim">{cat.note}</p>
                    <span className="cat__count mono">
                      {products.filter((p) => p.category === cat.id).length} units →
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ---------------- Featured ---------------- */}
      <section className="section">
        <div className="wrap">
          <div className="section__head section__head--split">
            <div>
              <p className="eyebrow">The shortlist</p>
              <h2 className="display section__title">
                Units people <em>keep buying.</em>
              </h2>
            </div>
            <Link to="/shop" className="link-underline mono">
              All {products.length} units →
            </Link>
          </div>
          <div className="grid-3">
            {featured.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Editorial ---------------- */}
      <section className="section" id="about">
        <div className="wrap grid-2 editorial">
          <div className="editorial__text reveal">
            <p className="eyebrow">Why we exist</p>
            <h2 className="display section__title">
              Most portable ACs are
              <br />
              <em>marketing, not engineering.</em>
            </h2>
            <p className="lede">
              The category is full of inflated BTU numbers, “cooling fans” dressed up as air
              conditioners, and decibel claims measured in a lab you will never stand in. We publish
              the ASHRAE figure, the real noise floor, and the wattage at the wall.
            </p>
            <ul className="editorial__list">
              <li>
                <span className="mono dim">01</span> ASHRAE BTU, not the inflated SACC number
              </li>
              <li>
                <span className="mono dim">02</span> Noise measured at one metre, low fan speed
              </li>
              <li>
                <span className="mono dim">03</span> R32 refrigerant across the whole range
              </li>
              <li>
                <span className="mono dim">04</span> A BTU finder that will tell you to buy less
              </li>
            </ul>
          </div>

          <div className="editorial__panel panel reveal">
            <div className="editorial__grid">
              {[
                { k: '20', u: 'BTU per sq ft', d: 'The baseline before you adjust for sun.' },
                { k: '+10%', u: 'sun exposure', d: 'A west-facing window changes the maths.' },
                { k: '600', u: 'BTU per person', d: 'Every body past the first two adds load.' },
                { k: '47', u: 'dB floor', d: 'Our quietest unit, quieter than a fridge.' },
              ].map((cell) => (
                <div key={cell.u} className="editorial__cell">
                  <strong className="display">{cell.k}</strong>
                  <span className="mono">{cell.u}</span>
                  <p className="dim">{cell.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section className="section" id="faq">
        <div className="wrap faq">
          <div className="section__head">
            <p className="eyebrow">Good questions</p>
            <h2 className="display section__title">
              Before you <em>commit.</em>
            </h2>
          </div>
          <div className="faq__list">
            {[
              {
                q: 'Will it actually cool my room?',
                a: 'If you match the BTU to the space, yes — a portable unit will hold a room 8–12°C below outside. Undersized, it will run flat out and lose. Use the BTU finder above and err on the side of the larger unit.',
              },
              {
                q: 'Do I need a window?',
                a: 'Compressor units need somewhere to exhaust hot air — a window or a sliding door. If you have neither, look at Borealis Drift, our windowless model.',
              },
              {
                q: 'How loud is “quiet”?',
                a: 'Our range runs from 47 dB (Rime) to 58 dB (Tundra) on low. For reference, a normal conversation is about 60 dB. Inverter models are noticeably gentler because they ramp rather than switch on and off.',
              },
              {
                q: 'What does shipping and returns look like?',
                a: 'Free shipping on orders over $300, delivered in 2–4 working days. If the unit is not right, you have 30 days to return it in its original packaging and we cover the return freight.',
              },
              {
                q: 'Is it worth paying for an inverter?',
                a: 'If you use it daily, yes. A variable-speed inverter holds temperature instead of cycling, which cuts energy use by roughly a third and removes the on/off clatter. Glacier, Aurora and Tundra all use one.',
              },
            ].map((item) => (
              <details key={item.q} className="faq__item">
                <summary>
                  <span>{item.q}</span>
                  <span className="faq__plus" aria-hidden="true" />
                </summary>
                <p className="lede">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="section section--tight">
        <div className="wrap">
          <div className="cta panel">
            <div className="cta__glow" aria-hidden="true" />
            <p className="eyebrow">Next step</p>
            <h2 className="display cta__title">
              Your room is hot.
              <br />
              <em>We can fix that.</em>
            </h2>
            <div className="cta__actions">
              <Link to="/shop" className="btn btn--glacier">
                Shop all units
              </Link>
              <a href="#finder" className="btn btn--ghost">
                Find my BTU
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
