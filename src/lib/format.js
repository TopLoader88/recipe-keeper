/* Number, quantity and duration formatting shared by the parser and the UI. */

const VULGAR = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6,
  '⅐': 1 / 7, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  '⅑': 1 / 9, '⅒': 0.1
}

const FRACTIONS = [
  [1, 8], [1, 6], [1, 5], [1, 4], [1, 3], [3, 8], [2, 5],
  [1, 2], [3, 5], [5, 8], [2, 3], [3, 4], [4, 5], [5, 6], [7, 8]
]

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'r-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** "1½ cups" -> "1 1/2 cups" so a single numeric parser handles every source. */
export function replaceVulgarFractions(input) {
  return String(input ?? '')
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]/g, (m) => ' ' + toAsciiFraction(VULGAR[m]) + ' ')
    .replace(/(\d)\s+(\d+\/\d+)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function toAsciiFraction(value) {
  let best = null
  let bestErr = Infinity
  for (const [a, b] of FRACTIONS) {
    const err = Math.abs(value - a / b)
    if (err < bestErr) { bestErr = err; best = [a, b] }
  }
  return `${best[0]}/${best[1]}`
}

/** Parses "1", "1.5", "1,5", "1/2" and "1 1/2" from the start of a string. */
export function parseNumber(input) {
  if (input == null) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  const s = replaceVulgarFractions(input)
  if (!s) return null
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)/)
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2])
  const dec = s.match(/^(\d+(?:[.,]\d+)?)/)
  if (dec) return Number(dec[1].replace(',', '.'))
  return null
}

/** Renders a number back as a cook-friendly fraction: 1.5 -> "1 1/2". */
export function formatNumber(n) {
  if (n == null || !Number.isFinite(n)) return ''
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const whole = Math.floor(abs + 1e-9)
  const frac = abs - whole

  if (frac < 0.02) return sign + String(whole)
  if (frac > 0.98) return sign + String(whole + 1)

  let best = null
  let bestErr = Infinity
  for (const [a, b] of FRACTIONS) {
    const err = Math.abs(frac - a / b)
    if (err < bestErr) { bestErr = err; best = [a, b] }
  }
  if (bestErr <= 0.022) {
    return sign + (whole ? `${whole} ${best[0]}/${best[1]}` : `${best[0]}/${best[1]}`)
  }
  return sign + String(Math.round(abs * 100) / 100)
}

/** A quantity that may be a range: 1–2 */
export function formatQuantity(min, max) {
  if (min == null) return ''
  if (max != null && Math.abs(max - min) > 1e-9) return `${formatNumber(min)}–${formatNumber(max)}`
  return formatNumber(min)
}

export function formatMinutes(mins) {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return ''
  const total = Math.round(mins)
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!m) return `${h} hr`
  return `${h} hr ${m} min`
}

/** Accepts ISO-8601 durations ("PT1H30M"), plain numbers, or free text ("1 hr 30 mins"). */
export function parseDuration(value) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null

  const s = String(value).trim()
  if (!s) return null

  const iso = s.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i)
  if (iso && (iso[1] || iso[2] || iso[3] || iso[4])) {
    const d = Number(iso[1] || 0), h = Number(iso[2] || 0)
    const m = Number(iso[3] || 0), sec = Number(iso[4] || 0)
    const total = d * 1440 + h * 60 + m + sec / 60
    return total > 0 ? Math.round(total) : null
  }

  let total = 0
  let matched = false
  const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|days?|d)\b/gi
  let m
  while ((m = re.exec(s))) {
    matched = true
    const n = Number(m[1])
    const unit = m[2].toLowerCase()
    if (unit.startsWith('d')) total += n * 1440
    else if (unit.startsWith('h')) total += n * 60
    else total += n
  }
  if (matched) return total > 0 ? Math.round(total) : null

  const bare = Number(s)
  return Number.isFinite(bare) && bare > 0 ? Math.round(bare) : null
}

/** "Serves 4-6" / "4 servings" -> 4 */
export function parseServings(value) {
  if (value == null) return null
  if (Array.isArray(value)) value = value[0]
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const m = String(value).match(/\d+(?:[.,]\d+)?/)
  return m ? Number(m[0].replace(',', '.')) : null
}

export function formatDate(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}
