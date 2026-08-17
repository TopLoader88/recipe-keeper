/* Local nutrition helpers. Recipes may carry an optional per-serving nutrition
   block { calories, protein, carbs, fat }; the diary logs what you actually ate
   (servings x per-serving), stored as resolved totals so history stays stable
   even if the recipe changes later. Everything here is pure + offline. */

export const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', emoji: '\uD83C\uDF73' },
  { key: 'lunch', label: 'Lunch', emoji: '\uD83E\uDD6A' },
  { key: 'dinner', label: 'Dinner', emoji: '\uD83C\uDF7D\uFE0F' },
  { key: 'snack', label: 'Snack', emoji: '\uD83C\uDF4E' }
]

export const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat']

export function mealLabel(key) {
  const m = MEAL_TYPES.find((x) => x.key === key)
  return m ? m.label : key
}

function round(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10) / 10
}

/** The per-serving block if the recipe has any nutrition value set, else null. */
export function perServingNutrition(recipe) {
  const n = recipe && recipe.nutrition
  if (!n) return null
  return MACRO_KEYS.some((k) => n[k] != null && n[k] !== '') ? n : null
}

export function hasNutrition(recipe) {
  return perServingNutrition(recipe) != null
}

/** Multiply a per-serving block by a serving count; keeps nulls as null. */
export function scaleNutrition(n, servings) {
  if (!n) return null
  const s = Number(servings)
  if (!Number.isFinite(s)) return null
  const out = {}
  for (const k of MACRO_KEYS) out[k] = n[k] != null && n[k] !== '' ? round(Number(n[k]) * s) : null
  return out
}

/** Add up resolved totals across diary entries for a day. */
export function sumNutrition(entries) {
  const total = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  for (const e of entries || []) {
    for (const k of MACRO_KEYS) total[k] += Number(e[k]) || 0
  }
  for (const k of MACRO_KEYS) total[k] = Math.round(total[k])
  return total
}

export function formatCalories(n) {
  if (n == null || n === '') return '\u2014'
  return Math.round(Number(n)).toLocaleString()
}

export function formatGrams(n) {
  if (n == null || n === '') return '\u2014'
  return `${Math.round(Number(n))}g`
}

const NUM = '(\\d+(?:\\.\\d+)?)'

/** Best-effort pull of nutrition from a caption/description. Only matches when a
    nutrition keyword is present, so it never mistakes an oven temp or a timer for
    calories. Returns a block with only the fields it actually found. */
export function extractNutrition(text) {
  const s = String(text || '')
  if (!s) return null
  const out = {}

  const cal = s.match(new RegExp(NUM + '\\s*(?:kcal|calories|cals|cal)\\b', 'i')) ||
              s.match(new RegExp('calories?\\s*[:=\\-]?\\s*' + NUM, 'i'))
  if (cal) {
    const v = parseFloat(cal[1])
    if (v >= 10 && v <= 5000) out.calories = v
  }

  const macro = (label) => {
    let m = s.match(new RegExp(NUM + '\\s*g(?:rams?)?\\s*(?:of\\s*)?' + label, 'i'))
    if (!m) m = s.match(new RegExp(label + '\\s*[:=\\-]?\\s*' + NUM + '\\s*g', 'i'))
    if (!m) return null
    const v = parseFloat(m[1])
    return v >= 0 && v <= 500 ? v : null
  }

  const p = macro('protein')
  if (p != null) out.protein = p
  const c = macro('(?:carbs?|carbohydrates?)')
  if (c != null) out.carbs = c
  const f = macro('fat')
  if (f != null) out.fat = f

  return Object.keys(out).length ? out : null
}

/** Normalizes editor/text input into a clean nutrition block or null. */
export function cleanNutrition(raw) {
  if (!raw) return null
  const out = {}
  for (const k of MACRO_KEYS) {
    const v = raw[k]
    if (v == null || v === '') continue
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n * 10) / 10
  }
  return Object.keys(out).length ? out : null
}
