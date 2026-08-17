/* Offline "where is it in the store" grouping for the grocery list.

   There is no public Safeway/Albertsons API for real per-store aisle numbers
   (only Kroger exposes that, and it needs a server-side key). So we do what
   AnyList / Paprika / Bring! do: bundle a keyword dictionary that maps an
   ingredient name to a standard US supermarket department. It gets the large
   majority right, needs no network, and works for any store. The user can
   re-file anything that lands in the wrong aisle. */

import { formatQuantity } from './format.js'
import { displayUnit } from './normalize.js'

/* Ordered the way you actually walk a store: perimeter first (produce, bakery,
   deli, meat, dairy), then frozen and the center aisles, then non-food. `key`
   is what we store on each item; `label`/`emoji` are for display. */
export const SECTIONS = [
  { key: 'produce', label: 'Produce', emoji: '🥦' },
  { key: 'bakery', label: 'Bakery', emoji: '🍞' },
  { key: 'deli', label: 'Deli', emoji: '🧀' },
  { key: 'meat', label: 'Meat & Seafood', emoji: '🥩' },
  { key: 'dairy', label: 'Dairy & Eggs', emoji: '🥛' },
  { key: 'frozen', label: 'Frozen', emoji: '🧊' },
  { key: 'canned', label: 'Canned & Jarred', emoji: '🥫' },
  { key: 'grains', label: 'Pasta & Grains', emoji: '🍝' },
  { key: 'baking', label: 'Baking', emoji: '🧁' },
  { key: 'condiments', label: 'Condiments & Sauces', emoji: '🫙' },
  { key: 'spices', label: 'Spices & Seasoning', emoji: '🧂' },
  { key: 'breakfast', label: 'Breakfast & Cereal', emoji: '🥣' },
  { key: 'snacks', label: 'Snacks', emoji: '🍿' },
  { key: 'beverages', label: 'Beverages', emoji: '🧃' },
  { key: 'alcohol', label: 'Beer & Wine', emoji: '🍷' },
  { key: 'household', label: 'Household', emoji: '🧻' },
  { key: 'personal', label: 'Personal Care', emoji: '🧴' },
  { key: 'other', label: 'Other', emoji: '🛒' }
]

const SECTION_BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]))
export function sectionMeta(key) { return SECTION_BY_KEY.get(key) || SECTION_BY_KEY.get('other') }
export function sectionOrder(key) {
  const i = SECTIONS.findIndex((s) => s.key === key)
  return i < 0 ? SECTIONS.length : i
}

const HERB_RE = /\b(basil|cilantro|parsley|mint|dill|chive|oregano|thyme|rosemary|sage|tarragon)\b/

/* First keyword that appears in the (singularized) name wins, so specific
   multi-word entries are listed before the general word they contain. */
const RULES = [
  // spreads / butters that contain a nut or fruit word
  ['peanut butter', 'condiments'], ['almond butter', 'condiments'], ['cashew butter', 'condiments'],
  ['apple butter', 'condiments'], ['cocoa butter', 'baking'],
  // creams / milks (order: specific before "cream" / "milk")
  ['ice cream', 'frozen'], ['whipped cream', 'dairy'], ['whipping cream', 'dairy'],
  ['sour cream', 'dairy'], ['cream cheese', 'dairy'], ['heavy cream', 'dairy'], ['half and half', 'dairy'],
  ['coconut cream', 'canned'], ['coconut milk', 'canned'], ['coconut water', 'beverages'],
  ['coconut oil', 'condiments'], ['coconut flour', 'baking'], ['coconut flake', 'baking'],
  ['almond milk', 'dairy'], ['oat milk', 'dairy'], ['soy milk', 'dairy'],
  ['condensed milk', 'canned'], ['evaporated milk', 'canned'], ['powdered milk', 'baking'],
  ['buttermilk', 'dairy'], ['milk', 'dairy'], ['cream', 'dairy'],
  // tomatoes
  ['tomato paste', 'canned'], ['tomato sauce', 'canned'], ['tomato puree', 'canned'],
  ['crushed tomato', 'canned'], ['diced tomato', 'canned'], ['canned tomato', 'canned'],
  ['sun dried tomato', 'condiments'], ['cherry tomato', 'produce'], ['tomato', 'produce'],
  // onions / garlic (powders are spice)
  ['onion powder', 'spices'], ['garlic powder', 'spices'], ['green onion', 'produce'],
  ['red onion', 'produce'], ['yellow onion', 'produce'], ['onion', 'produce'],
  ['garlic', 'produce'], ['shallot', 'produce'], ['scallion', 'produce'], ['leek', 'produce'],
  // breads that contain a grain word (before flour/grain rules)
  ['tortilla', 'bakery'],
  // sugars / flours
  ['brown sugar', 'baking'], ['powdered sugar', 'baking'], ['confectioner', 'baking'],
  ['almond flour', 'baking'], ['bread flour', 'baking'], ['all purpose flour', 'baking'],
  ['flour', 'baking'], ['sugar', 'baking'],
  // oils / vinegars
  ['olive oil', 'condiments'], ['vegetable oil', 'condiments'], ['canola oil', 'condiments'],
  ['sesame oil', 'condiments'], ['avocado oil', 'condiments'], ['oil', 'condiments'],
  ['balsamic', 'condiments'], ['vinegar', 'condiments'],
  // broths / stocks
  ['chicken broth', 'canned'], ['beef broth', 'canned'], ['vegetable broth', 'canned'],
  ['chicken stock', 'canned'], ['broth', 'canned'], ['stock', 'canned'], ['bouillon', 'canned'],
  // sauces / condiments / spreads
  ['soy sauce', 'condiments'], ['fish sauce', 'condiments'], ['hot sauce', 'condiments'],
  ['bbq sauce', 'condiments'], ['barbecue sauce', 'condiments'], ['oyster sauce', 'condiments'],
  ['pasta sauce', 'canned'], ['marinara', 'canned'], ['worcestershire', 'condiments'],
  ['ketchup', 'condiments'], ['mustard', 'condiments'], ['mayonnaise', 'condiments'],
  ['mayo', 'condiments'], ['sriracha', 'condiments'], ['hoisin', 'condiments'],
  ['teriyaki', 'condiments'], ['salsa', 'condiments'], ['pesto', 'condiments'],
  ['gravy', 'condiments'], ['ranch', 'condiments'], ['dressing', 'condiments'],
  ['relish', 'condiments'], ['jam', 'condiments'], ['jelly', 'condiments'],
  ['marmalade', 'condiments'], ['honey', 'condiments'], ['maple syrup', 'condiments'],
  ['syrup', 'condiments'], ['nutella', 'condiments'], ['tahini', 'condiments'],
  ['chipotle', 'canned'],
  // cheeses
  ['parmesan', 'dairy'], ['parmigiano', 'dairy'], ['mozzarella', 'dairy'], ['cheddar', 'dairy'],
  ['feta', 'dairy'], ['ricotta', 'dairy'], ['gouda', 'dairy'], ['brie', 'dairy'],
  ['gruyere', 'dairy'], ['provolone', 'dairy'], ['goat cheese', 'dairy'], ['cheese', 'dairy'],
  // dairy staples
  ['egg', 'dairy'], ['butter', 'dairy'], ['yogurt', 'dairy'], ['yoghurt', 'dairy'],
  ['ghee', 'dairy'], ['margarine', 'dairy'], ['cottage', 'dairy'],
  // deli / cured
  ['prosciutto', 'deli'], ['salami', 'deli'], ['pepperoni', 'deli'], ['lunch meat', 'deli'],
  ['deli', 'deli'], ['rotisserie', 'deli'],
  // meat & seafood
  ['chicken', 'meat'], ['drumstick', 'meat'], ['beef', 'meat'], ['pork', 'meat'],
  ['bacon', 'meat'], ['sausage', 'meat'], ['turkey', 'meat'], ['lamb', 'meat'],
  ['veal', 'meat'], ['steak', 'meat'], ['brisket', 'meat'], ['sirloin', 'meat'],
  ['tenderloin', 'meat'], ['meatball', 'meat'], ['pancetta', 'meat'], ['chorizo', 'meat'],
  ['ham', 'meat'], ['rib', 'meat'], ['mince', 'meat'], ['hot dog', 'meat'],
  ['shrimp', 'meat'], ['prawn', 'meat'], ['salmon', 'meat'], ['tuna', 'meat'],
  ['cod', 'meat'], ['tilapia', 'meat'], ['halibut', 'meat'], ['trout', 'meat'],
  ['crab', 'meat'], ['lobster', 'meat'], ['scallop', 'meat'], ['clam', 'meat'],
  ['mussel', 'meat'], ['oyster', 'meat'], ['calamari', 'meat'], ['squid', 'meat'],
  ['anchovy', 'canned'], ['sardine', 'canned'], ['fish', 'meat'],
  // beans / canned (green/vanilla bean are not canned)
  ['green bean', 'produce'], ['vanilla bean', 'baking'], ['bean sprout', 'produce'],
  ['black bean', 'canned'], ['kidney bean', 'canned'], ['pinto bean', 'canned'],
  ['cannellini', 'canned'], ['garbanzo', 'canned'], ['chickpea', 'canned'],
  ['refried bean', 'canned'], ['baked bean', 'canned'], ['lentil', 'grains'],
  ['bean', 'canned'], ['olive', 'canned'], ['pickle', 'canned'], ['artichoke', 'canned'],
  ['water chestnut', 'canned'], ['corn', 'produce'], ['coconut', 'baking'],
  // produce - vegetables
  ['potato', 'produce'], ['carrot', 'produce'], ['celery', 'produce'], ['lettuce', 'produce'],
  ['spinach', 'produce'], ['kale', 'produce'], ['arugula', 'produce'], ['cabbage', 'produce'],
  ['broccoli', 'produce'], ['cauliflower', 'produce'], ['cucumber', 'produce'],
  ['zucchini', 'produce'], ['squash', 'produce'], ['bell pepper', 'produce'],
  ['jalapeno', 'produce'], ['pepper', 'produce'], ['mushroom', 'produce'], ['pea', 'produce'],
  ['asparagus', 'produce'], ['eggplant', 'produce'], ['avocado', 'produce'],
  ['radish', 'produce'], ['beet', 'produce'], ['turnip', 'produce'], ['fennel', 'produce'],
  ['sprout', 'produce'], ['chard', 'produce'], ['ginger', 'produce'], ['cilantro', 'produce'],
  ['parsley', 'produce'], ['basil', 'produce'], ['mint', 'produce'], ['dill', 'produce'],
  ['chive', 'produce'],
  // produce - fruit
  ['lemon', 'produce'], ['lime', 'produce'], ['orange', 'produce'], ['apple', 'produce'],
  ['banana', 'produce'], ['strawberry', 'produce'], ['blueberry', 'produce'],
  ['raspberry', 'produce'], ['blackberry', 'produce'], ['berry', 'produce'], ['grape', 'produce'],
  ['mango', 'produce'], ['pineapple', 'produce'], ['melon', 'produce'], ['peach', 'produce'],
  ['pear', 'produce'], ['plum', 'produce'], ['cherry', 'produce'], ['apricot', 'produce'],
  ['kiwi', 'produce'], ['pomegranate', 'produce'], ['fig', 'produce'], ['date', 'produce'],
  // grains / pasta
  ['spaghetti', 'grains'], ['penne', 'grains'], ['macaroni', 'grains'], ['noodle', 'grains'],
  ['pasta', 'grains'], ['orzo', 'grains'], ['ramen', 'grains'], ['rice', 'grains'],
  ['quinoa', 'grains'], ['couscous', 'grains'], ['barley', 'grains'], ['farro', 'grains'],
  ['bulgur', 'grains'], ['polenta', 'grains'], ['cornmeal', 'grains'], 
  // breakfast
  ['cereal', 'breakfast'], ['oatmeal', 'breakfast'], ['oat', 'breakfast'], ['granola', 'breakfast'],
  ['pancake', 'breakfast'], ['waffle', 'breakfast'], ['grits', 'breakfast'],
  // baking
  ['baking soda', 'baking'], ['baking powder', 'baking'], ['yeast', 'baking'],
  ['cornstarch', 'baking'], ['corn starch', 'baking'], ['cocoa', 'baking'],
  ['chocolate chip', 'baking'], ['vanilla', 'baking'], ['molasses', 'baking'],
  ['shortening', 'baking'], ['breadcrumb', 'baking'], ['bread crumb', 'baking'],
  ['panko', 'baking'], ['cake mix', 'baking'], ['frosting', 'baking'], ['sprinkle', 'baking'],
  ['gelatin', 'baking'],
  // spices
  ['salt', 'spices'], ['black pepper', 'spices'], ['cumin', 'spices'], ['paprika', 'spices'],
  ['chili powder', 'spices'], ['cayenne', 'spices'], ['coriander', 'spices'], ['turmeric', 'spices'],
  ['curry', 'spices'], ['oregano', 'spices'], ['thyme', 'spices'], ['rosemary', 'spices'],
  ['sage', 'spices'], ['cinnamon', 'spices'], ['nutmeg', 'spices'], ['clove', 'spices'],
  ['allspice', 'spices'], ['cardamom', 'spices'], ['bay leaf', 'spices'],
  ['red pepper flake', 'spices'], ['italian seasoning', 'spices'], ['seasoning', 'spices'],
  ['spice', 'spices'], ['vanilla extract', 'baking'],
  // bakery
  ['bread', 'bakery'], ['baguette', 'bakery'], ['pita', 'bakery'], ['naan', 'bakery'],
  ['bagel', 'bakery'], ['bun', 'bakery'], ['roll', 'bakery'], ['croissant', 'bakery'],
  ['sourdough', 'bakery'], ['english muffin', 'bakery'], ['muffin', 'bakery'],
  // snacks / nuts
  ['chip', 'snacks'], ['cracker', 'snacks'], ['pretzel', 'snacks'], ['popcorn', 'snacks'],
  ['cookie', 'snacks'], ['candy', 'snacks'], ['almond', 'snacks'], ['peanut', 'snacks'],
  ['cashew', 'snacks'], ['walnut', 'snacks'], ['pecan', 'snacks'], ['pistachio', 'snacks'],
  ['raisin', 'snacks'], ['jerky', 'snacks'], ['chocolate', 'snacks'],
  // beverages
  ['sparkling water', 'beverages'], ['water', 'beverages'], ['juice', 'beverages'],
  ['soda', 'beverages'], ['cola', 'beverages'], ['coffee', 'beverages'], ['tea', 'beverages'],
  ['lemonade', 'beverages'], ['kombucha', 'beverages'], ['seltzer', 'beverages'],
  // alcohol
  ['wine', 'alcohol'], ['beer', 'alcohol'], ['vodka', 'alcohol'], ['whiskey', 'alcohol'],
  ['bourbon', 'alcohol'], ['tequila', 'alcohol'], ['brandy', 'alcohol'], ['champagne', 'alcohol'],
  ['prosecco', 'alcohol'], ['sake', 'alcohol'], ['sherry', 'alcohol'], ['vermouth', 'alcohol'],
  ['liqueur', 'alcohol'], ['rum', 'alcohol'],
  // non-food
  ['paper towel', 'household'], ['toilet paper', 'household'], ['napkin', 'household'],
  ['aluminum foil', 'household'], ['foil', 'household'], ['plastic wrap', 'household'],
  ['parchment', 'household'], ['trash bag', 'household'], ['dish soap', 'household'],
  ['detergent', 'household'], ['sponge', 'household'],
  ['shampoo', 'personal'], ['toothpaste', 'personal'], ['deodorant', 'personal'],
  ['soap', 'personal'], ['lotion', 'personal']
]

const RE_CACHE = new Map()
function wordRe(kw) {
  let re = RE_CACHE.get(kw)
  if (!re) { re = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'); RE_CACHE.set(kw, re) }
  return re
}

function singular(w) {
  if (w.length <= 3) return w
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (/(ses|xes|zes|ches|shes|oes)$/.test(w)) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

function normName(raw) {
  const n = String(raw || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!n) return ''
  return n.split(' ').map(singular).join(' ')
}

/** Best-effort store department for an ingredient/item name. */
export function sectionForItem(raw) {
  const name = normName(raw)
  if (!name) return 'other'
  if (HERB_RE.test(name) && /\bfresh\b/.test(name)) return 'produce'
  if (/\bfrozen\b/.test(name)) return 'frozen'
  if (/\bcanned\b/.test(name) || name.includes('can of')) return 'canned'
  for (const [kw, section] of RULES) {
    if (kw.includes(' ') ? name.includes(kw) : wordRe(kw).test(name)) return section
  }
  return 'other'
}

/** Merge key so "2 large yellow onions" and "onion" collapse to one line. */
export function groceryKey(name) {
  const n = normName(name).replace(/\b(fresh|organic|large|small|medium|ripe|whole|boneless|skinless)\b/g, ' ').replace(/\s+/g, ' ').trim()
  return n || normName(name)
}

function newId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID()
  return 'g-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/* Amounts are kept as a small list so different units stay readable
   ("2 cups + 3 tbsp"); same-unit adds are summed. */
export function mergeAmounts(amounts, amt) {
  const list = Array.isArray(amounts) ? amounts.slice() : []
  if (!amt || (amt.quantity == null && !amt.unit)) return list
  if (amt.quantity == null) {
    if (!list.some((a) => (a.unit || null) === (amt.unit || null))) list.push({ unit: amt.unit || null, quantity: null, quantityMax: null })
    return list
  }
  const i = list.findIndex((a) => (a.unit || null) === (amt.unit || null) && a.quantity != null)
  if (i >= 0) {
    const a = list[i]
    const hasMax = a.quantityMax != null || amt.quantityMax != null
    list[i] = {
      unit: a.unit || null,
      quantity: (a.quantity || 0) + (amt.quantity || 0),
      quantityMax: hasMax ? (a.quantityMax != null ? a.quantityMax : a.quantity) + (amt.quantityMax != null ? amt.quantityMax : amt.quantity) : null
    }
    return list
  }
  list.push({ unit: amt.unit || null, quantity: amt.quantity, quantityMax: amt.quantityMax != null ? amt.quantityMax : null })
  return list
}

/** Renders an item's combined amounts, e.g. "2 cups + 1 tbsp". */
export function formatAmounts(amounts) {
  if (!amounts || !amounts.length) return ''
  const parts = []
  for (const a of amounts) {
    if (a.quantity == null && !a.unit) continue
    if (a.quantity == null && a.unit) { parts.push(displayUnit(a.unit, null)); continue }
    const q = formatQuantity(a.quantity, a.quantityMax != null ? a.quantityMax : null)
    parts.push(a.unit ? `${q} ${displayUnit(a.unit, a.quantityMax != null ? a.quantityMax : a.quantity)}` : q)
  }
  return parts.join(' + ')
}

/** Builds a single staged grocery line from a parsed ingredient. */
export function lineFromIngredient(ing, scale = 1) {
  if (!ing || ing.section) return null
  const item = String(ing.item || ing.raw || '').trim()
  if (!item) return null
  return {
    name: item,
    key: groceryKey(item),
    section: sectionForItem(item),
    amount: {
      unit: ing.unit || null,
      quantity: ing.quantity != null ? ing.quantity * scale : null,
      quantityMax: ing.quantityMax != null ? ing.quantityMax * scale : null
    },
    note: ing.note || ''
  }
}

/** Adds a staged line into an existing list, merging with an unchecked match. */
export function addLine(items, line, opts = {}) {
  const list = Array.isArray(items) ? items.slice() : []
  if (!line) return list
  const idx = list.findIndex((it) => !it.checked && it.key === line.key)
  if (idx >= 0) {
    const it = list[idx]
    list[idx] = { ...it, amounts: mergeAmounts(it.amounts, line.amount), updatedAt: Date.now() }
    return list
  }
  const maxOrder = list.reduce((m, x) => Math.max(m, x.order || 0), 0)
  list.push({
    id: newId(),
    name: line.name,
    key: line.key,
    section: line.section,
    amounts: mergeAmounts([], line.amount),
    note: line.note || '',
    checked: false,
    manual: !!opts.manual,
    source: opts.source || '',
    createdAt: Date.now(),
    order: maxOrder + 1
  })
  return list
}

/** Groups items into store sections, in aisle-walk order. */
export function groupBySection(items) {
  const groups = new Map()
  for (const it of items) {
    const key = it.section || 'other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(it)
  }
  return [...groups.entries()]
    .sort((a, b) => sectionOrder(a[0]) - sectionOrder(b[0]))
    .map(([key, list]) => ({
      section: sectionMeta(key),
      items: list.sort((a, b) => (a.order || 0) - (b.order || 0))
    }))
}

/** Plain-text export, grouped by section (unchecked items only by default). */
export function groceryToText(items, { includeChecked = false } = {}) {
  const use = includeChecked ? items : items.filter((it) => !it.checked)
  const groups = groupBySection(use)
  const lines = ['🛒 Grocery list', '']
  for (const g of groups) {
    lines.push(`${g.section.emoji} ${g.section.label}`)
    for (const it of g.items) {
      const amt = formatAmounts(it.amounts)
      lines.push(`- ${amt ? amt + ' ' : ''}${it.name}${it.note ? ' (' + it.note + ')' : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

export const INSTACART_SAFEWAY = 'https://www.instacart.com/store/safeway/storefront'
/** Opens an Instacart search at Safeway for one item (no backend needed). */
export function instacartSearchUrl(name) {
  return `https://www.instacart.com/store/safeway/search?k=${encodeURIComponent(String(name || '').trim())}`
}
