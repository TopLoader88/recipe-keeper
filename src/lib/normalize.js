/* Turns messy imported recipes into one consistent house style.

   The originals are never edited in place — this produces the clean copy that
   sits alongside the cached source. */

import { parseNumber, formatNumber, formatQuantity, replaceVulgarFractions, parseServings, parseDuration } from './format.js'

/* ---------- units ---------- */

const UNIT_DEFS = [
  { key: 'teaspoon', display: ['teaspoon', 'teaspoons'], aliases: ['teaspoon', 'teaspoons', 'tsp', 'tsps', 'teasp'] },
  { key: 'tablespoon', display: ['tablespoon', 'tablespoons'], aliases: ['tablespoon', 'tablespoons', 'tbsp', 'tbsps', 'tbs', 'tblsp', 'tbl'] },
  { key: 'cup', display: ['cup', 'cups'], aliases: ['cup', 'cups', 'c'] },
  { key: 'fluid ounce', display: ['fluid ounce', 'fluid ounces'], aliases: ['fluid ounce', 'fluid ounces', 'fl oz', 'fl ounce', 'fl ounces', 'floz'] },
  { key: 'ounce', display: ['ounce', 'ounces'], aliases: ['ounce', 'ounces', 'oz'] },
  { key: 'pound', display: ['pound', 'pounds'], aliases: ['pound', 'pounds', 'lb', 'lbs'] },
  { key: 'gram', display: ['g', 'g'], aliases: ['gram', 'grams', 'g', 'gr', 'gm', 'gms'] },
  { key: 'kilogram', display: ['kg', 'kg'], aliases: ['kilogram', 'kilograms', 'kilo', 'kilos', 'kg', 'kgs'] },
  { key: 'milliliter', display: ['ml', 'ml'], aliases: ['milliliter', 'milliliters', 'millilitre', 'millilitres', 'ml', 'mls'] },
  { key: 'liter', display: ['L', 'L'], aliases: ['liter', 'liters', 'litre', 'litres', 'l'] },
  { key: 'quart', display: ['quart', 'quarts'], aliases: ['quart', 'quarts', 'qt', 'qts'] },
  { key: 'pint', display: ['pint', 'pints'], aliases: ['pint', 'pints', 'pt', 'pts'] },
  { key: 'gallon', display: ['gallon', 'gallons'], aliases: ['gallon', 'gallons', 'gal'] },
  { key: 'pinch', display: ['pinch', 'pinches'], aliases: ['pinch', 'pinches'] },
  { key: 'dash', display: ['dash', 'dashes'], aliases: ['dash', 'dashes'] },
  { key: 'clove', display: ['clove', 'cloves'], aliases: ['clove', 'cloves'] },
  { key: 'can', display: ['can', 'cans'], aliases: ['can', 'cans', 'tin', 'tins'] },
  { key: 'package', display: ['package', 'packages'], aliases: ['package', 'packages', 'pkg', 'pkgs', 'packet', 'packets'] },
  { key: 'jar', display: ['jar', 'jars'], aliases: ['jar', 'jars'] },
  { key: 'bottle', display: ['bottle', 'bottles'], aliases: ['bottle', 'bottles'] },
  { key: 'bag', display: ['bag', 'bags'], aliases: ['bag', 'bags'] },
  { key: 'box', display: ['box', 'boxes'], aliases: ['box', 'boxes'] },
  { key: 'slice', display: ['slice', 'slices'], aliases: ['slice', 'slices'] },
  { key: 'piece', display: ['piece', 'pieces'], aliases: ['piece', 'pieces'] },
  { key: 'sprig', display: ['sprig', 'sprigs'], aliases: ['sprig', 'sprigs'] },
  { key: 'stick', display: ['stick', 'sticks'], aliases: ['stick', 'sticks'] },
  { key: 'bunch', display: ['bunch', 'bunches'], aliases: ['bunch', 'bunches'] },
  { key: 'handful', display: ['handful', 'handfuls'], aliases: ['handful', 'handfuls'] },
  { key: 'head', display: ['head', 'heads'], aliases: ['head', 'heads'] },
  { key: 'stalk', display: ['stalk', 'stalks'], aliases: ['stalk', 'stalks'] },
  { key: 'rib', display: ['rib', 'ribs'], aliases: ['rib', 'ribs'] },
  { key: 'ear', display: ['ear', 'ears'], aliases: ['ear', 'ears'] },
  { key: 'sheet', display: ['sheet', 'sheets'], aliases: ['sheet', 'sheets'] },
  { key: 'drop', display: ['drop', 'drops'], aliases: ['drop', 'drops'] },
  { key: 'scoop', display: ['scoop', 'scoops'], aliases: ['scoop', 'scoops'] },
  { key: 'splash', display: ['splash', 'splashes'], aliases: ['splash', 'splashes'] },
  { key: 'knob', display: ['knob', 'knobs'], aliases: ['knob', 'knobs'] },
  { key: 'inch', display: ['inch', 'inches'], aliases: ['inch', 'inches'] },
  { key: 'centimeter', display: ['cm', 'cm'], aliases: ['centimeter', 'centimeters', 'centimetre', 'centimetres', 'cm'] }
]

const UNIT_BY_ALIAS = new Map()
for (const def of UNIT_DEFS) {
  for (const alias of def.aliases) UNIT_BY_ALIAS.set(alias, def)
}
const MAX_UNIT_WORDS = 2

export function displayUnit(key, quantity) {
  const def = UNIT_DEFS.find((d) => d.key === key)
  if (!def) return key || ''
  const plural = quantity == null || quantity > 1 + 1e-9
  return def.display[plural ? 1 : 0]
}

/* ---------- text hygiene ---------- */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  deg: '°', frac12: '½', frac14: '¼', frac34: '¾', middot: '·', bull: '•', eacute: 'é', egrave: 'è'
}

export function decodeEntities(input) {
  return String(input ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, name) => ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? m)
}

function safeCodePoint(code) {
  try { return String.fromCodePoint(code) } catch { return '' }
}

export function stripHtml(input) {
  return decodeEntities(
    String(input ?? '')
      .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*\/?>/gi, '\n')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

function collapse(input) {
  return String(input ?? '').replace(/\s+/g, ' ').trim()
}

/* ---------- ingredients ---------- */

const PREP_NOTE = /^(?:and\s+)?(?:very\s+|finely\s+|roughly\s+|coarsely\s+|thinly\s+|freshly\s+|lightly\s+|well\s+|about\s+|preferably\s+)*(?:[a-z]+(?:ed|ing)\b|to taste|optional|divided|halved|quartered|cubed|room temperature|at room temperature|as needed|if needed|plus more\b.*|for (?:serving|garnish|frying|dusting|greasing|brushing|topping)\b.*)/i

const QUANTITY = String.raw`(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)`
const QTY_RE = new RegExp(`^(${QUANTITY})\\s*(?:(?:-|–|—|~|to)\\s*(${QUANTITY}))?\\s*`)

/**
 * "1 1/2 cups all-purpose flour, sifted"
 *   -> { quantity: 1.5, unit: 'cup', item: 'all-purpose flour', note: 'sifted' }
 */
export function parseIngredient(line) {
  const original = collapse(stripHtml(line))
  if (!original) return null

  let s = original.replace(/^[-–—•*·▢□◦•]\s*/, '').trim()
  if (!s) return null

  // "For the sauce:" style group headings.
  if (/^(?:for\b.*|.*\bsauce|.*\btopping|.*\bfilling|.*\bdough|.*\bmarinade|.*\bdressing|.*\bcrust|.*\bbase|.*\bglaze|.*\bgarnish)\s*:$/i.test(s) ||
      (/:$/.test(s) && s.length < 48 && !QTY_RE.test(replaceVulgarFractions(s)))) {
    return { section: s.replace(/:$/, '').trim(), raw: original }
  }

  s = replaceVulgarFractions(s)

  const optional = /\b(optional|if desired|to taste)\b/i.test(s)

  let quantity = null
  let quantityMax = null
  const qtyMatch = s.match(QTY_RE)
  if (qtyMatch) {
    quantity = parseNumber(qtyMatch[1])
    if (qtyMatch[2]) quantityMax = parseNumber(qtyMatch[2])
    s = s.slice(qtyMatch[0].length).trim()
  }

  let unit = null
  const words = s.split(' ')
  for (let take = Math.min(MAX_UNIT_WORDS, words.length); take >= 1; take--) {
    const candidate = words.slice(0, take).join(' ').toLowerCase().replace(/[.,]$/, '')
    const def = UNIT_BY_ALIAS.get(candidate)
    if (def) {
      unit = def.key
      s = words.slice(take).join(' ').trim()
      break
    }
  }

  s = s.replace(/^of\s+/i, '').trim()

  // A parenthetical after the quantity is usually a size note: "1 can (400 g) tomatoes"
  let note = ''
  const paren = s.match(/^\(([^)]{1,40})\)\s*/)
  if (paren) {
    note = paren[1].trim()
    s = s.slice(paren[0].length).trim()
  }

  let item = s
  const commaAt = item.indexOf(', ')
  if (commaAt > 0) {
    const tail = item.slice(commaAt + 2).trim()
    if (PREP_NOTE.test(tail)) {
      note = note ? `${note}, ${tail}` : tail
      item = item.slice(0, commaAt).trim()
    }
  }

  const trailingParen = item.match(/\s*\(([^)]{1,60})\)\s*$/)
  if (trailingParen) {
    note = note ? `${note}, ${trailingParen[1].trim()}` : trailingParen[1].trim()
    item = item.slice(0, trailingParen.index).trim()
  }

  item = item.replace(/[,;]+$/, '').trim()
  if (!item && !quantity) return { raw: original, item: original, quantity: null, quantityMax: null, unit: null, note: '', optional }

  return {
    raw: original,
    quantity,
    quantityMax,
    unit,
    item: item || original,
    note: note.replace(/^,\s*/, ''),
    optional
  }
}

export function normalizeIngredients(input) {
  const lines = toLines(input)
  const out = []
  for (const line of lines) {
    const parsed = parseIngredient(line)
    if (parsed) out.push(parsed)
  }
  return out
}

/** Renders a parsed ingredient in house style, optionally scaled. */
export function formatIngredient(ing, scale = 1) {
  if (!ing) return ''
  if (ing.section) return ing.section
  const parts = []
  if (ing.quantity != null) {
    const min = ing.quantity * scale
    const max = ing.quantityMax != null ? ing.quantityMax * scale : null
    parts.push(formatQuantity(min, max))
    if (ing.unit) parts.push(displayUnit(ing.unit, max ?? min))
  } else if (ing.unit) {
    parts.push(displayUnit(ing.unit, null))
  }
  parts.push(ing.item)
  let text = parts.filter(Boolean).join(' ')
  if (ing.note) text += `, ${ing.note}`
  return text
}

/* ---------- directions ---------- */

const ABBREVIATIONS = /\b(?:approx|approximately|tbsp|tsp|oz|lb|lbs|min|mins|sec|hr|hrs|qt|pt|gal|ml|cm|in|no|vs|etc|e\.g|i\.e|Dr|Mr|Mrs|St|temp|deg|F|C)\.$/i

const TIME_WORDS = [
  [/\bmins?\b\.?/gi, 'minutes'],
  [/\bsecs?\b\.?/gi, 'seconds'],
  [/\bhrs?\b\.?/gi, 'hours'],
  [/\bminute\b/gi, 'minute'],
  [/\bdegrees? fahrenheit\b/gi, '°F'],
  [/\bdegrees? (?:celsius|centigrade)\b/gi, '°C']
]

/** Rewrites oven temperatures so both scales are always present. */
export function normalizeTemperatures(text) {
  return String(text).replace(
    /(\d{2,3})\s*(?:°|º)?\s*(?:degrees?\s*)?\b(F|C|fahrenheit|celsius|centigrade)\b\.?/gi,
    (match, num, scale, offset, whole) => {
      const after = whole.slice(offset + match.length, offset + match.length + 3)
      if (/^\s*\(/.test(after)) return match // already converted
      const value = Number(num)
      if (!Number.isFinite(value)) return match
      const isF = /^f/i.test(scale)
      if (isF) {
        const c = Math.round(((value - 32) * 5) / 9 / 5) * 5
        return `${value}°F (${c}°C)`
      }
      const f = Math.round((value * 9) / 5 + 32)
      const rounded = Math.round(f / 5) * 5
      return `${value}°C (${rounded}°F)`
    }
  )
}

function cleanTemperature(value) {
  const s = collapse(String(value || ''))
  if (!s) return null
  const out = normalizeTemperatures(s)
  return out || null
}

function toLines(input) {
  if (input == null) return []
  if (Array.isArray(input)) {
    return input.flatMap((v) => toLines(v))
  }
  if (typeof input === 'object') {
    if (input.itemListElement) return toLines(input.itemListElement)
    const t = input.text || input.name || input.description || ''
    return t ? [String(t)] : []
  }
  return String(input)
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Flattens schema.org instruction shapes into a flat list of section/step markers. */
function flattenInstructions(input) {
  const out = []
  const walk = (node) => {
    if (node == null) return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (typeof node === 'object') {
      const type = String(node['@type'] || node.type || '')
      if (/HowToSection/i.test(type)) {
        const name = collapse(stripHtml(node.name || ''))
        if (name) out.push({ section: name })
        walk(node.itemListElement || node.steps || [])
        return
      }
      const text = node.text || node.name || node.description || ''
      if (text) out.push({ text: String(text) })
      else if (node.itemListElement) walk(node.itemListElement)
      return
    }
    out.push({ text: String(node) })
  }
  walk(input)
  return out
}

function splitIntoSentences(text) {
  const rough = text.split(/(?<=[.!?])\s+(?=["'“(]?[A-Z0-9])/)
  const merged = []
  for (const piece of rough) {
    const prev = merged[merged.length - 1]
    if (prev && (ABBREVIATIONS.test(prev.trim()) || prev.trim().length < 25)) {
      merged[merged.length - 1] = `${prev} ${piece}`.trim()
    } else {
      merged.push(piece.trim())
    }
  }
  return merged.filter(Boolean)
}

function splitBlob(text) {
  const clean = stripHtml(text)
  let lines = clean.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean)

  if (lines.length === 1) {
    // "1. Preheat... 2. Mix..." on a single line
    const numbered = lines[0]
      .split(/(?:^|\s)(?=(?:Step\s*)?\d{1,2}\s*[.):]\s+[A-Z])/g)
      .map((l) => l.trim())
      .filter(Boolean)
    if (numbered.length > 1) lines = numbered
    else if (lines[0].length > 260) lines = splitIntoSentences(lines[0])
  }

  // A single very long paragraph is still hard to cook from.
  return lines.flatMap((line) => (line.length > 320 ? splitIntoSentences(line) : [line]))
}

function cleanStepText(input) {
  let text = collapse(stripHtml(input))
  if (!text) return ''
  text = text.replace(/^(?:step\s*)?\d{1,2}\s*[.):-]\s*/i, '')
  text = text.replace(/^[-–—•*·▢□◦]\s*/, '')
  text = replaceVulgarFractions(text)
  for (const [re, replacement] of TIME_WORDS) text = text.replace(re, replacement)
  text = normalizeTemperatures(text)
  text = text.replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  text = text.charAt(0).toUpperCase() + text.slice(1)
  if (!/[.!?)"”']$/.test(text)) text += '.'
  return text
}

/** Pulls the first duration out of a step so it can drive a timer. */
export function extractMinutes(text) {
  const m = String(text).match(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?))?\s*(seconds?|minutes?|hours?)\b/i)
  if (!m) return null
  const value = Number(m[2] || m[1])
  const unit = m[3].toLowerCase()
  if (unit.startsWith('second')) return Math.max(1, Math.round(value / 60))
  if (unit.startsWith('hour')) return Math.round(value * 60)
  return Math.round(value)
}

export function normalizeSteps(input) {
  const nodes = flattenInstructions(input)
  const steps = []

  for (const node of nodes) {
    if (node.section) {
      steps.push({ section: node.section })
      continue
    }
    for (const line of splitBlob(node.text)) {
      const text = cleanStepText(line)
      if (!text || text.length < 3) continue
      steps.push({ text, minutes: extractMinutes(text) })
    }
  }

  // Drop a leading heading with nothing under it.
  while (steps.length && steps[steps.length - 1].section) steps.pop()
  return steps
}

/* ---------- whole recipe ---------- */

export const HOUSE_STYLE_NOTES = [
  'One action per step, numbered in order',
  'Sentence case, closing punctuation, no "Step 4:" prefixes',
  'Temperatures shown in both °F and °C',
  'Times written out (minutes, hours) so timers can be read off them',
  'Quantities as clean fractions with spelled-out imperial units'
]

/**
 * Takes whatever a parser produced and returns the canonical recipe shape.
 * Unknown/missing fields become null rather than throwing.
 */
export function normalizeRecipe(raw = {}) {
  const title = collapse(stripHtml(raw.title || raw.name || '')) || 'Untitled recipe'
  const description = collapse(stripHtml(raw.description || ''))
  const ingredients = normalizeIngredients(raw.ingredients ?? raw.recipeIngredient ?? [])
  const steps = normalizeSteps(raw.steps ?? raw.instructions ?? raw.recipeInstructions ?? [])

  const prepMinutes = parseDuration(raw.prepMinutes ?? raw.prepTime)
  const cookMinutes = parseDuration(raw.cookMinutes ?? raw.cookTime)
  const totalRaw = parseDuration(raw.totalMinutes ?? raw.totalTime)
  const totalMinutes = totalRaw ?? ((prepMinutes || cookMinutes) ? (prepMinutes || 0) + (cookMinutes || 0) : null)

  const tags = dedupe(
    []
      .concat(raw.tags || [], raw.keywords || [], raw.recipeCategory || [], raw.recipeCuisine || [])
      .flatMap((t) => String(t).split(','))
      .map((t) => collapse(t).toLowerCase())
      .filter((t) => t && t.length < 32)
  ).slice(0, 12)

  return {
    title,
    description,
    image: raw.image || null,
    servings: parseServings(raw.servings ?? raw.recipeYield),
    yieldText: collapse(String(Array.isArray(raw.recipeYield) ? raw.recipeYield[0] : (raw.yieldText || raw.recipeYield || ''))),
    prepMinutes,
    cookMinutes,
    totalMinutes,
    temperature: cleanTemperature(raw.temperature),
    ingredients,
    steps,
    tags,
    notes: raw.notes || '',
    video: raw.video || null,
    author: collapse(stripHtml(raw.author || '')),
    rating: 0,
    favorite: false
  }
}

function dedupe(list) {
  return Array.from(new Set(list))
}

/** Round-trips ingredients/steps through plain text for the editor. */
export function ingredientsToText(ingredients = []) {
  return ingredients.map((i) => (i.section ? `# ${i.section}` : formatIngredient(i))).join('\n')
}

export function stepsToText(steps = []) {
  return steps.map((s) => (s.section ? `# ${s.section}` : s.text)).join('\n')
}

export function textToIngredients(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith('# ')
      ? { section: line.slice(2).trim(), raw: line }
      : parseIngredient(line)))
    .filter(Boolean)
}

export function textToSteps(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('# ')) return { section: line.slice(2).trim() }
      const cleaned = cleanStepText(line)
      return cleaned ? { text: cleaned, minutes: extractMinutes(cleaned) } : null
    })
    .filter(Boolean)
}

export { formatNumber, formatQuantity }
