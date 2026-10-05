export type CoolingMode = 'cool' | 'fan' | 'dry' | 'heat'
export type Category = 'portable' | 'windowless' | 'evaporative' | 'pro'

export interface Spec {
  label: string
  value: string
}

export interface Product {
  id: string
  slug: string
  name: string
  series: string
  category: Category
  btu: number
  /** Recommended room area in square feet. */
  coverage: number
  price: number
  compareAt?: number
  rating: number
  reviews: number
  /** Decibels on the low fan setting. */
  noise: number
  energyClass: string
  modes: CoolingMode[]
  features: string[]
  badge?: string
  blurb: string
  description: string
  specs: Spec[]
  inStock: boolean
  /** Seeds the parametric artwork so each unit reads as its own machine. */
  art: {
    hue: number
    accent: string
    vents: number
    proportions: 'slim' | 'standard' | 'stout'
  }
}

export const CATEGORIES: { id: Category | 'all'; label: string; note: string }[] = [
  { id: 'all', label: 'All units', note: 'Every machine we build' },
  { id: 'portable', label: 'Portable', note: 'Roll anywhere, vent out a window' },
  { id: 'windowless', label: 'Windowless', note: 'No exterior venting required' },
  { id: 'evaporative', label: 'Evaporative', note: 'Dry-climate cooling' },
  { id: 'pro', label: 'Pro / Commercial', note: 'Workshops, studios, server rooms' },
]

export const products: Product[] = [
  {
    id: 'ba-01',
    slug: 'borealis-one',
    name: 'Borealis One',
    series: 'Core',
    category: 'portable',
    btu: 8000,
    coverage: 350,
    price: 449,
    compareAt: 529,
    rating: 4.6,
    reviews: 1284,
    noise: 51,
    energyClass: 'A+',
    modes: ['cool', 'fan', 'dry'],
    features: ['Self-evaporative', '24h timer', 'Remote control', 'Washable filter'],
    badge: 'Best seller',
    blurb: 'The one that started it all — quiet, efficient, and sized for a real bedroom.',
    description:
      'Borealis One is the machine we hand to people who have never owned a portable air conditioner. It cools a 350 sq ft room without the jet-engine roar you expect from a portable, and its self-evaporative system means you rarely empty a tank. Set it, forget it, sleep through August.',
    specs: [
      { label: 'Cooling capacity', value: '8,000 BTU (ASHRAE)' },
      { label: 'Room coverage', value: 'Up to 350 sq ft' },
      { label: 'Noise (low / high)', value: '51 / 56 dB' },
      { label: 'Energy class', value: 'A+' },
      { label: 'Refrigerant', value: 'R32, low GWP' },
      { label: 'Dimensions', value: '13.4 × 12.2 × 27.6 in' },
      { label: 'Weight', value: '54 lb' },
      { label: 'Warranty', value: '2 years, parts & labour' },
    ],
    inStock: true,
    art: { hue: 168, accent: '#4fe3d0', vents: 5, proportions: 'standard' },
  },
  {
    id: 'ba-02',
    slug: 'borealis-glacier',
    name: 'Borealis Glacier',
    series: 'Core',
    category: 'portable',
    btu: 12000,
    coverage: 550,
    price: 649,
    compareAt: 729,
    rating: 4.8,
    reviews: 942,
    noise: 53,
    energyClass: 'A++',
    modes: ['cool', 'fan', 'dry', 'heat'],
    features: ['Inverter compressor', 'Heat pump mode', 'Dual filtration', 'Smart scheduling'],
    badge: 'Editor’s pick',
    blurb: 'A true four-season inverter unit. Cool in July, heat in November.',
    description:
      'Glacier runs a variable-speed inverter compressor, so it holds a temperature instead of slamming on and off. That means less noise, less energy, and a room that actually stays where you set it. The reverse-cycle heat pump earns its keep the other nine months of the year.',
    specs: [
      { label: 'Cooling capacity', value: '12,000 BTU (ASHRAE)' },
      { label: 'Heating capacity', value: '10,500 BTU' },
      { label: 'Room coverage', value: 'Up to 550 sq ft' },
      { label: 'Noise (low / high)', value: '53 / 58 dB' },
      { label: 'Energy class', value: 'A++' },
      { label: 'Refrigerant', value: 'R32, low GWP' },
      { label: 'Dimensions', value: '15.1 × 13.8 × 29.5 in' },
      { label: 'Weight', value: '68 lb' },
      { label: 'Warranty', value: '3 years, parts & labour' },
    ],
    inStock: true,
    art: { hue: 182, accent: '#8ff0e2', vents: 7, proportions: 'standard' },
  },
  {
    id: 'ba-03',
    slug: 'borealis-mist',
    name: 'Borealis Mist',
    series: 'Evaporative',
    category: 'evaporative',
    btu: 5000,
    coverage: 400,
    price: 279,
    rating: 4.3,
    reviews: 611,
    noise: 44,
    energyClass: 'A+++',
    modes: ['cool', 'fan'],
    features: ['Honeycomb pad', '3 fan speeds', 'Ice pack included', 'Castors'],
    badge: 'Lowest energy',
    blurb: 'For dry heat. Sips power, adds gentle humidity, moves a lot of air.',
    description:
      'Mist is an evaporative cooler, not a compressor — which is why it draws a fraction of the power and sounds like a fan rather than a fridge. It shines in dry climates where the air is begging for moisture. In humid regions, choose a compressor unit instead.',
    specs: [
      { label: 'Air flow', value: '1,200 m³/h' },
      { label: 'Room coverage', value: 'Up to 400 sq ft (dry climate)' },
      { label: 'Noise (low / high)', value: '44 / 52 dB' },
      { label: 'Energy class', value: 'A+++' },
      { label: 'Water tank', value: '5.3 gal' },
      { label: 'Dimensions', value: '14.6 × 11.4 × 25.2 in' },
      { label: 'Weight', value: '26 lb' },
      { label: 'Warranty', value: '2 years, parts & labour' },
    ],
    inStock: true,
    art: { hue: 158, accent: '#7fe6c0', vents: 6, proportions: 'slim' },
  },
  {
    id: 'ba-04',
    slug: 'borealis-vault',
    name: 'Borealis Vault',
    series: 'Pro',
    category: 'pro',
    btu: 14000,
    coverage: 700,
    price: 899,
    rating: 4.7,
    reviews: 388,
    noise: 56,
    energyClass: 'A+',
    modes: ['cool', 'fan', 'dry'],
    features: ['Server-room rated', 'Continuous drain', 'Lockable castors', 'Duct kit'],
    badge: 'Pro',
    blurb: 'Built for the room you cannot afford to let overheat.',
    description:
      'Vault is the unit we ship to home labs, edit suites, and small server rooms. It runs continuous-drain out of the box, tolerates high ambient heat, and holds temperature within a degree. Steel chassis, lockable castors, and a duct kit for exhausting into a ceiling void.',
    specs: [
      { label: 'Cooling capacity', value: '14,000 BTU (ASHRAE)' },
      { label: 'Room coverage', value: 'Up to 700 sq ft' },
      { label: 'Noise (low / high)', value: '56 / 62 dB' },
      { label: 'Energy class', value: 'A+' },
      { label: 'Duty cycle', value: 'Continuous' },
      { label: 'Dimensions', value: '17.9 × 15.7 × 32.3 in' },
      { label: 'Weight', value: '92 lb' },
      { label: 'Warranty', value: '3 years, parts & labour' },
    ],
    inStock: true,
    art: { hue: 172, accent: '#5fd8c8', vents: 9, proportions: 'stout' },
  },
  {
    id: 'ba-05',
    slug: 'borealis-drift',
    name: 'Borealis Drift',
    series: 'Windowless',
    category: 'windowless',
    btu: 7000,
    coverage: 300,
    price: 519,
    rating: 4.4,
    reviews: 274,
    noise: 49,
    energyClass: 'A++',
    modes: ['cool', 'fan', 'dry'],
    features: ['No window needed', 'Condensate re-use', 'Night mode', 'Anti-mould filter'],
    blurb: 'Cooling with nowhere to vent. Perfect for basement flats and sealed studios.',
    description:
      'Drift solves the awkward rooms — basements, sealed glazing, listed buildings where you cannot hang a hose out of the sash. It rejects heat through a compact rear exchanger and recovers its own condensate, so there is no window adapter and no drip tray to babysit.',
    specs: [
      { label: 'Cooling capacity', value: '7,000 BTU (ASHRAE)' },
      { label: 'Room coverage', value: 'Up to 300 sq ft' },
      { label: 'Noise (low / high)', value: '49 / 54 dB' },
      { label: 'Energy class', value: 'A++' },
      { label: 'Venting', value: 'None required' },
      { label: 'Dimensions', value: '13.0 × 12.6 × 26.8 in' },
      { label: 'Weight', value: '52 lb' },
      { label: 'Warranty', value: '2 years, parts & labour' },
    ],
    inStock: true,
    art: { hue: 190, accent: '#6fd4e6', vents: 4, proportions: 'standard' },
  },
  {
    id: 'ba-06',
    slug: 'borealis-aurora',
    name: 'Borealis Aurora',
    series: 'Core',
    category: 'portable',
    btu: 10000,
    coverage: 450,
    price: 579,
    rating: 4.5,
    reviews: 803,
    noise: 52,
    energyClass: 'A++',
    modes: ['cool', 'fan', 'dry'],
    features: ['Inverter compressor', 'App control', 'Follow-me remote', 'Auto-swing louvres'],
    blurb: 'The connected middle child — app control, follow-me sensing, zero guesswork.',
    description:
      'Aurora sits between One and Glacier and adds the smart layer. Follow-me mode tracks the remote’s temperature so the machine cools where you actually are, not where it is. The app schedules by tariff, and auto-swing keeps the air moving rather than pooling.',
    specs: [
      { label: 'Cooling capacity', value: '10,000 BTU (ASHRAE)' },
      { label: 'Room coverage', value: 'Up to 450 sq ft' },
      { label: 'Noise (low / high)', value: '52 / 57 dB' },
      { label: 'Energy class', value: 'A++' },
      { label: 'Connectivity', value: 'Wi-Fi 2.4 GHz + BLE' },
      { label: 'Dimensions', value: '14.2 × 13.0 × 28.4 in' },
      { label: 'Weight', value: '61 lb' },
      { label: 'Warranty', value: '3 years, parts & labour' },
    ],
    inStock: true,
    art: { hue: 164, accent: '#4fe3d0', vents: 6, proportions: 'standard' },
  },
  {
    id: 'ba-07',
    slug: 'borealis-rime',
    name: 'Borealis Rime',
    series: 'Compact',
    category: 'portable',
    btu: 6000,
    coverage: 250,
    price: 329,
    compareAt: 379,
    rating: 4.2,
    reviews: 1490,
    noise: 47,
    energyClass: 'A+',
    modes: ['cool', 'fan'],
    features: ['Under 50 dB', 'Slim footprint', 'Window seal kit', 'Carry handles'],
    badge: 'Quietest',
    blurb: 'The smallest, quietest machine we make. Built for studios and box rooms.',
    description:
      'Rime is for the room you sleep in and the room you record in. At 47 dB on low it is quieter than a conversation, and its footprint fits between a bed and a wall. If your space is under 250 sq ft, this is the one.',
    specs: [
      { label: 'Cooling capacity', value: '6,000 BTU (ASHRAE)' },
      { label: 'Room coverage', value: 'Up to 250 sq ft' },
      { label: 'Noise (low / high)', value: '47 / 52 dB' },
      { label: 'Energy class', value: 'A+' },
      { label: 'Refrigerant', value: 'R32, low GWP' },
      { label: 'Dimensions', value: '12.2 × 11.0 × 24.6 in' },
      { label: 'Weight', value: '46 lb' },
      { label: 'Warranty', value: '2 years, parts & labour' },
    ],
    inStock: true,
    art: { hue: 176, accent: '#8ff0e2', vents: 4, proportions: 'slim' },
  },
  {
    id: 'ba-08',
    slug: 'borealis-tundra',
    name: 'Borealis Tundra',
    series: 'Pro',
    category: 'pro',
    btu: 16000,
    coverage: 850,
    price: 1149,
    rating: 4.9,
    reviews: 176,
    noise: 58,
    energyClass: 'A+',
    modes: ['cool', 'fan', 'dry', 'heat'],
    features: ['Dual-duct', 'Heat pump', 'Continuous drain', 'Redundant sensors'],
    badge: 'Flagship',
    blurb: 'Our flagship. Dual-duct, four-season, and utterly unbothered by a heatwave.',
    description:
      'Tundra uses a dual-duct design — one hose in for outside air, one out for exhaust — so it does not depressurise the room it is cooling. Add the reverse-cycle heat pump and redundant sensors, and you have a machine that holds an 850 sq ft space through the worst of a continental summer and the shoulder seasons either side.',
    specs: [
      { label: 'Cooling capacity', value: '16,000 BTU (ASHRAE)' },
      { label: 'Heating capacity', value: '14,000 BTU' },
      { label: 'Room coverage', value: 'Up to 850 sq ft' },
      { label: 'Noise (low / high)', value: '58 / 64 dB' },
      { label: 'Energy class', value: 'A+' },
      { label: 'Venting', value: 'Dual-duct kit included' },
      { label: 'Dimensions', value: '19.3 × 16.9 × 34.1 in' },
      { label: 'Weight', value: '108 lb' },
      { label: 'Warranty', value: '5 years, parts & labour' },
    ],
    inStock: false,
    art: { hue: 160, accent: '#3fd0be', vents: 11, proportions: 'stout' },
  },
]

export const bySlug = (slug: string) => products.find((p) => p.slug === slug)

export const formatPrice = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
