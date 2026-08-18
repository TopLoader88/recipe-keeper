/* Turn the noisy, per-frame OCR text captured from a cooking reel's on-screen
   captions into a best-effort, de-duplicated recipe DRAFT for the user to review.

   Client-side OCR of stylised text burned over a busy video is inherently messy -
   words get mashed together and background noise leaks in - so this favours
   RECALL (don't drop a real step) while cutting the obvious junk. The result is a
   rough draft the user cleans up against the playing video, not a finished recipe. */

const VERBS = ['brown', 'season', 'drain', 'melt', 'whisk', 'add', 'stir', 'mix', 'cook', 'bake', 'simmer', 'pour', 'combine', 'top', 'serve', 'remove', 'heat', 'boil', 'fry', 'blend', 'fold', 'spread', 'garnish', 'saute', 'marinate', 'preheat', 'slice', 'dice', 'chop', 'mash', 'sprinkle', 'cover', 'reduce', 'bring', 'place', 'beat', 'coat', 'layer', 'grease', 'knead', 'fill', 'shape', 'transfer', 'return', 'drizzle', 'toss', 'crumble', 'scoop', 'flip', 'rinse', 'soak']
const UNITS = ['cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'gram', 'grams', 'stick', 'sticks', 'can', 'cans', 'clove', 'cloves', 'pinch', 'dash', 'slices', 'pkg', 'package', 'quart', 'pint', 'handful', 'scoop']
const INGRED = ['beef', 'chicken', 'pork', 'turkey', 'onion', 'onions', 'garlic', 'salt', 'pepper', 'paprika', 'powder', 'broth', 'bouillon', 'butter', 'flour', 'milk', 'water', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'cream', 'noodles', 'pasta', 'macaroni', 'rice', 'egg', 'eggs', 'oil', 'sugar', 'vanilla', 'tomato', 'sauce', 'bacon', 'sausage', 'beans', 'corn', 'potato', 'cornstarch', 'seasoning', 'cumin', 'oregano', 'basil', 'parsley', 'vinegar', 'honey', 'ketchup', 'mustard', 'mayo', 'ranch', 'taco', 'italian', 'cajun', 'lemon', 'lime', 'spinach', 'mushroom', 'chili', 'shrimp', 'dough', 'yeast', 'baking', 'cinnamon', 'chocolate', 'grease', 'diced', 'thicken', 'minced', 'shredded']
const SIGNAL = new Set([...VERBS, ...UNITS, ...INGRED])

/* Canonical phrases we try to snap heavily-mangled chunks back to. */
const PHRASES = ['ground beef', 'diced onion', 'garlic salt', 'onion powder', 'garlic powder', 'beef broth', 'beef bouillon', 'chicken broth', 'cream cheese', 'cheddar cheese', 'cooked noodles', 'elbow macaroni', 'tomato sauce', 'excess grease', 'remove from pan', 'season with', 'add seasoning', 'thicken sauce', 'cover to melt', 'serve and enjoy', 'ground turkey', 'sour cream', 'green onion', 'bell pepper', 'olive oil', 'brown sugar']

const JUNK_RE = /\b(pov|follow|comment|subscribe|link in bio|full recipe below|recipe below|save this|tag a|credit|ig ?:|@\w|#\w|\bviews?\b|\blikes?\b|for more|part \d)\b/i
const KEEP = new Set(['with', 'and', 'to', 'in', 'the', 'or', 'of', 'on', 'then', 'until', 'over', 'into', 'from', 'for', 'up', 'a', 'an', 'your', 'some', 'more', 'plus', 'if', 'you', 'it', 'at', 'let', 'set'])

function lev(a, b) {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  const dp = Array.from({ length: m + 1 }, (_, i) => i)
  for (let j = 1; j <= n; j++) {
    let prev = dp[0]
    dp[0] = j
    for (let i = 1; i <= m; i++) {
      const t = dp[i]
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = t
    }
  }
  return dp[m]
}
const sim = (a, b) => { const L = Math.max(a.length, b.length); return L ? 1 - lev(a, b) / L : 1 }
const alpha = (s) => (s.match(/[a-z]/gi) || []).length
const key = (s) => s.toLowerCase().replace(/[^a-z]/g, '')
const cap = (s) => s.replace(/^\w/, (c) => c.toUpperCase())
const isNum = (t) => /[\d½¼¾⅓⅔⅛]/.test(t)

function vocabHit(w) {
  if (w.length >= 4) { for (const s of SIGNAL) { if (w.includes(s)) return true } }
  return SIGNAL.has(w)
}

function goodTok(t) {
  const w = t.toLowerCase().replace(/[^a-z]/g, '')
  if (isNum(t)) return true
  if (KEEP.has(w)) return true
  if (vocabHit(w)) return true
  if (w.length >= 4 && /[aeiou]/.test(w) && alpha(t) / t.length >= 0.7) return true
  return false
}

function scoreLine(line) {
  const low = line.toLowerCase()
  if (JUNK_RE.test(low)) return -10
  const letters = alpha(line)
  if (letters < 5) return -10
  const compact = line.replace(/\s/g, '')
  if (letters / Math.max(1, compact.length) < 0.48) return -10
  const kk = low.replace(/[^a-z]/g, '')
  if (kk.length < 5) return -10
  let sc = 0
  let hits = 0
  if (isNum(line)) sc += 1
  const seen = new Set()
  for (const w of SIGNAL) {
    if (w.length >= 4 && kk.includes(w) && !seen.has(w)) { sc += 2; hits++; seen.add(w) }
  }
  for (const p of PHRASES) { const pk = key(p); if (pk.length >= 7 && kk.includes(pk)) { sc += 3; hits++ } }
  if (hits === 0) return -5
  return sc
}

/* Snap obvious garbled tokens back to a known cooking word/phrase, and normalise
   "1c" -> "1 cup". Conservative: only replaces when very close. */
function repair(line) {
  const kk = key(line)
  for (const p of PHRASES) {
    const pk = key(p)
    if (pk.length >= 6 && sim(kk, pk) >= 0.72) return cap(p)
  }
  let out = line.replace(/[A-Za-z][A-Za-z']{2,}/g, (tok) => {
    const t = tok.toLowerCase()
    if (SIGNAL.has(t) || KEEP.has(t)) return tok
    let best = null
    let bestS = 0
    for (const s of SIGNAL) { const v = sim(t, s); if (v > bestS) { bestS = v; best = s } }
    for (const p of PHRASES) { const v = sim(t.replace(/[^a-z]/g, ''), key(p)); if (v > bestS) { bestS = v; best = p } }
    return bestS >= 0.82 ? best : tok
  })
  out = out.replace(/(\d)\s*c\b/gi, '$1 cup')
  return out
}

function tidy(line) {
  let toks = line.split(/\s+/).filter(Boolean)
  while (toks.length && !goodTok(toks[0])) toks.shift()
  while (toks.length && !goodTok(toks[toks.length - 1])) toks.pop()
  toks = toks.filter((t) => {
    const w = t.toLowerCase().replace(/[^a-z]/g, '')
    if (isNum(t) || KEEP.has(w) || vocabHit(w)) return true
    if (w.length <= 3 && !/[aeiou]/.test(w)) return false
    return true
  })
  return toks.join(' ').replace(/\s{2,}/g, ' ').trim()
}

function cleanliness(line) {
  const toks = line.split(/\s+/).filter(Boolean)
  if (!toks.length) return 0
  let h = 0
  for (const t of toks) { const w = t.toLowerCase().replace(/[^a-z]/g, ''); if (vocabHit(w) || KEEP.has(w) || isNum(t)) h++ }
  return h / toks.length + (alpha(line) / Math.max(1, line.replace(/\s/g, '').length)) * 0.3
}

/**
 * @param {string[]|{txt:string}[]|string} frames per-frame OCR text
 * @returns {string} a de-duplicated, junk-filtered recipe draft (one line per step)
 */
export function cleanVideoText(frames) {
  const list = Array.isArray(frames) ? frames : String(frames || '').split(/\n\n+/)
  const kept = []
  for (const f of list) {
    const txt = typeof f === 'string' ? f : (f && f.txt) || ''
    for (let raw of String(txt).split('\n')) {
      let line = raw.replace(/[^\S ]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
      line = line.replace(/^[^A-Za-z0-9½¼¾]+/, '').replace(/[^A-Za-z0-9%).!]+$/, '').trim()
      if (scoreLine(line) < 2) continue
      const fixed = tidy(repair(line))
      const fk = key(fixed)
      if (fk.length < 4 || scoreLine(fixed) < 2) continue
      let dup = false
      for (let i = 0; i < kept.length; i++) {
        const ek = key(kept[i])
        if (ek === fk || ek.includes(fk) || fk.includes(ek) || sim(ek, fk) >= 0.7) {
          if (cleanliness(fixed) > cleanliness(kept[i])) kept[i] = cap(fixed)
          dup = true
          break
        }
      }
      if (!dup) kept.push(cap(fixed))
    }
  }
  return kept.join('\n')
}
