/* Turn the noisy, per-frame OCR captured from a cooking reel's on-screen captions
   into a clean, de-duplicated recipe DRAFT for the user to review.

   Two ideas keep it honest and accurate:
   1. Every token is checked against a compact cooking language model learned from
      500k real recipes (recipe-lexicon.js). A word that isn't real is SPLIT into real
      words, gently CORRECTED, or DROPPED - never invented.
   2. When a word sits in a strong ingredient slot but reads as the wrong thing, we
      snap it to the KNOWN ingredient the corpus says belongs there ("stick of duck"
      -> "stick of butter", "grow beet" -> "ground beef"). The Ingredients list is
      rebuilt only from ingredients we actually recognize, so noise never becomes a
      fake ingredient. A cook time / oven temp shown on screen is pulled out too. */

let _ready = null
let RANK, LOGC, VOCAB, BIGRAMS, ING, STEP, UNITS
let INGHEAD, INGHEAD_RANK, PHRASES, PHRASE_BY_LAST, SLOTS
const segMemo = new Map()

const KEEP_SHORT = new Set(['a', 'i', 'of', 'in', 'to', 'or', 'on', 'up', 'so', 'at', 'an', 'no', 'c', 'g'])
const STOP = new Set(['the', 'and', 'a', 'an', 'of', 'to', 'in', 'on', 'or', 'with', 'for', 'it', 'is',
  'at', 'as', 'be', 'by', 'up', 'so', 'if', 'then', 'until', 'your', 'you', 'this', 'that', 'into', 'add'])
const COOK_VERBS = new Set(['brown', 'season', 'drain', 'melt', 'whisk', 'add', 'stir', 'mix', 'cook',
  'bake', 'top', 'cover', 'serve', 'remove', 'pour', 'combine', 'heat', 'simmer', 'boil', 'fry', 'roast',
  'grill', 'chop', 'dice', 'diced', 'slice', 'sliced', 'mince', 'minced', 'saute', 'sprinkle', 'spread',
  'layer', 'blend', 'fold', 'beat', 'knead', 'garnish', 'drizzle', 'thicken', 'preheat', 'flip',
  'toss', 'coat', 'marinate', 'grease', 'bring', 'reduce', 'return', 'transfer', 'mash', 'shape', 'fill'])
const HOOK = new Set(['pov', 'making', 'grew', 'eating', 'every', 'week', 'childhood'])
const LOGN = 16.5

// units/qualifiers that carry a quantity onto the ingredient after them
const QUANT_UNITS = new Set(['oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'cup', 'cups', 'c',
  'tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'tsp', 'tsps', 'teaspoon', 'teaspoons', 'stick', 'sticks',
  'clove', 'cloves', 'can', 'cans', 'package', 'packages', 'pkg', 'jar', 'jars', 'box', 'bag', 'slice',
  'slices', 'pinch', 'dash', 'quart', 'quarts', 'pint', 'gram', 'grams', 'g', 'kg', 'ml', 'l', 'stalk',
  'stalks', 'head', 'heads', 'bunch'])
// heads that make sense with a bare count ("1 onion", "2 eggs")
const COUNTABLE = new Set(['onion', 'onions', 'egg', 'eggs', 'clove', 'cloves', 'tomato', 'tomatoes',
  'potato', 'potatoes', 'carrot', 'carrots', 'pepper', 'peppers', 'banana', 'bananas', 'apple', 'apples',
  'lemon', 'lemons', 'lime', 'limes'])
// staples that read as an ingredient even standing alone
const STAPLE = new Set(['beef', 'chicken', 'pork', 'turkey', 'bacon', 'sausage', 'butter', 'margarine',
  'flour', 'milk', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'egg', 'eggs', 'onion', 'onions',
  'garlic', 'salt', 'pepper', 'sugar', 'rice', 'pasta', 'noodles', 'macaroni', 'spaghetti', 'broth',
  'bouillon', 'stock', 'tomato', 'tomatoes', 'oil', 'water', 'cream', 'vanilla', 'cinnamon', 'honey',
  'bread', 'potato', 'potatoes', 'carrot', 'carrots', 'celery', 'mushrooms', 'beans', 'corn', 'shrimp',
  'ketchup', 'mustard', 'mayonnaise', 'paprika', 'oregano', 'basil', 'parsley', 'cilantro', 'ginger'])
// heads too generic to list on their own (need a qualifier phrase or quantity)
const GENERIC_HEAD = new Set(['powder', 'mix', 'sauce', 'soup', 'juice', 'seasoning', 'choice', 'style',
  'flavor', 'piece', 'pieces', 'taste', 'bit', 'can', 'package', 'jar', 'box', 'bag', 'blend', 'extract',
  'paste', 'chunks', 'strips'])
// prep/state words that are never an ingredient on their own
const NONHEAD = new Set(['cooked', 'uncooked', 'chopped', 'diced', 'minced', 'sliced', 'shredded', 'grated',
  'melted', 'softened', 'fresh', 'dried', 'warm', 'cold', 'boiling', 'hot', 'large', 'small', 'medium',
  'mixed', 'prepared', 'ground', 'crushed', 'beaten', 'drained', 'peeled', 'ripe', 'frozen', 'thawed'])

async function ready() {
  if (_ready) return _ready
  _ready = (async () => {
    const LEX = (await import('./recipe-lexicon.js')).default
    RANK = new Map(); LOGC = new Map()
    LEX.words.forEach((w, i) => { RANK.set(w, i); LOGC.set(w, (LEX.wf[i] || 20) / 10) })
    VOCAB = new Set(LEX.words)
    BIGRAMS = new Set(LEX.bigrams)
    ING = new Set(LEX.ingMarkers)
    STEP = new Set(LEX.stepMarkers)
    UNITS = new Set(LEX.units)
    INGHEAD = new Set(LEX.ingHeads || [])
    INGHEAD_RANK = new Map(); (LEX.ingHeads || []).forEach((w, i) => INGHEAD_RANK.set(w, i))
    PHRASES = new Set(LEX.ingPhrases || [])
    PHRASE_BY_LAST = new Map()
    for (const ph of (LEX.ingPhrases || [])) {
      const toks = ph.split(' ')
      const last = toks[toks.length - 1]
      if (!PHRASE_BY_LAST.has(last)) PHRASE_BY_LAST.set(last, [])
      PHRASE_BY_LAST.get(last).push(toks)
    }
    SLOTS = new Map()
    const slots = LEX.slots || {}
    for (const k of Object.keys(slots)) {
      const fillers = slots[k]
      SLOTS.set(k, { top: fillers[0][0], set: new Set(fillers.map((f) => f[0])) })
    }
  })()
  return _ready
}

function wordLogP(w) { const lc = LOGC.get(w); return lc === undefined ? null : lc - LOGN }
function unkLogP(len) { return -16 - 2.0 * len }

const MAXWORD = 15
function segment(s) {
  if (s.length === 0) return { score: 0, words: [] }
  if (s.length > 90) return { score: unkLogP(s.length), words: [s] }
  const hit = segMemo.get(s); if (hit) return hit
  let best = null
  const lim = Math.min(s.length, MAXWORD)
  for (let i = 1; i <= lim; i++) {
    const first = s.slice(0, i)
    const wl = wordLogP(first)
    const head = wl !== null ? wl : unkLogP(first.length)
    const rest = segment(s.slice(i))
    const total = head + rest.score
    if (best === null || total > best.score) best = { score: total, words: [first, ...rest.words] }
  }
  segMemo.set(s, best)
  return best
}

const AZ = 'abcdefghijklmnopqrstuvwxyz'.split('')
function edits1(w) {
  const out = new Set()
  for (let i = 0; i <= w.length; i++) {
    if (i < w.length) out.add(w.slice(0, i) + w.slice(i + 1))
    if (i < w.length - 1) out.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2))
    for (const c of AZ) {
      if (i < w.length) out.add(w.slice(0, i) + c + w.slice(i + 1))
      out.add(w.slice(0, i) + c + w.slice(i))
    }
  }
  return out
}
function vocabEdits(w, d2) {
  const c1 = []
  for (const e of edits1(w)) if (VOCAB.has(e)) c1.push(e)
  if (c1.length || !d2) return c1
  const c2 = []
  for (const e of edits1(w)) for (const e2 of edits1(e)) if (VOCAB.has(e2)) c2.push(e2)
  return c2
}
function correct(w, prev, next) {
  if (VOCAB.has(w)) return w
  if (w.length <= 2) return null
  const cands = [...new Set(vocabEdits(w, w.length >= 6))]
  if (!cands.length) return null
  let ctx = null, ctxR = Infinity, any = null, anyR = Infinity
  for (const c of cands) {
    const r = RANK.get(c); if (r === undefined) continue
    if ((prev && BIGRAMS.has(prev + ' ' + c)) || (next && BIGRAMS.has(c + ' ' + next))) { if (r < ctxR) { ctxR = r; ctx = c } }
    if (r < anyR) { anyR = r; any = c }
  }
  const pick = ctx || any
  if (!pick || RANK.get(pick) > 12000) return null
  return pick
}

function lev(a, b) {
  const m = a.length, n = b.length
  if (Math.abs(m - n) > 3) return 9
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[n]
}

function subtokens(raw) {
  const out = []
  for (const chunk of raw.toLowerCase().split(/[^a-z0-9/]+/)) {
    if (!chunk) continue
    let cur = '', curDigit = null
    for (const ch of chunk) {
      const isD = /[0-9/]/.test(ch)
      if (curDigit === null) { curDigit = isD; cur = ch }
      else if (isD === curDigit) cur += ch
      else { out.push(cur); cur = ch; curDigit = isD }
    }
    if (cur) out.push(cur)
  }
  return out
}
const isNumber = (t) => /^\d+(\/\d+)?$/.test(t) || /^\d\/\d$/.test(t)
const cap = (s) => s.replace(/^[a-z]/, (c) => c.toUpperCase())
const isHead = (w) => INGHEAD.has(w)

function cleanLine(raw) {
  const words = []
  for (const t of subtokens(raw)) {
    if (isNumber(t)) { words.push({ t, kind: 'num' }); continue }
    if (/\d/.test(t)) continue
    if (VOCAB.has(t)) { words.push({ t, kind: 'word' }); continue }
    const pieces = segment(t).words
    const known = pieces.filter(p => VOCAB.has(p)).length
    if (pieces.length > 1 && known >= Math.ceil(pieces.length / 2)) {
      for (const p of pieces) {
        if (VOCAB.has(p)) words.push({ t: p, kind: 'word' })
        else if (p.length >= 3) { const c = correct(p); if (c) words.push({ t: c, kind: 'word' }) }
      }
      continue
    }
    if (t.length >= 3) { const c = correct(t); if (c) words.push({ t: c, kind: 'word' }) }
  }
  for (let i = 0; i < words.length; i++) {
    const cur = words[i]; if (cur.kind !== 'word') continue
    const prev = words[i - 1] && words[i - 1].kind === 'word' ? words[i - 1].t : null
    const next = words[i + 1] && words[i + 1].kind === 'word' ? words[i + 1].t : null
    if ((prev && BIGRAMS.has(prev + ' ' + cur.t)) || (next && BIGRAMS.has(cur.t + ' ' + next))) continue
    let repl = null
    for (const e of edits1(cur.t)) {
      if (!VOCAB.has(e)) continue
      if ((prev && BIGRAMS.has(prev + ' ' + e)) || (next && BIGRAMS.has(e + ' ' + next))) { if (!repl || RANK.get(e) < RANK.get(repl)) repl = e }
    }
    if (repl) cur.t = repl
  }
  const kept = []
  for (const w of words) {
    if (w.kind === 'num') { kept.push(w); continue }
    if (w.t.length === 1) {
      const prevNum = kept.length && kept[kept.length - 1].kind === 'num'
      if (KEEP_SHORT.has(w.t) && (prevNum || w.t === 'a' || w.t === 'i')) kept.push(w)
      continue
    }
    kept.push(w)
  }
  const isAnchor = (i) => {
    const w = kept[i]; if (!w) return false
    if (w.kind === 'num') { const n = kept[i + 1]; return !!(n && n.kind === 'word' && VOCAB.has(n.t) && n.t.length >= 3 && !STOP.has(n.t)) }
    if (COOK_VERBS.has(w.t) || ING.has(w.t) || STEP.has(w.t) || isHead(w.t)) return true
    return VOCAB.has(w.t) && w.t.length >= 4 && !STOP.has(w.t) && (RANK.get(w.t) ?? 1e9) < 9000
  }
  let lo = 0, hi = kept.length - 1
  while (lo <= hi && !isAnchor(lo)) lo++
  while (hi >= lo && !isAnchor(hi)) hi--
  const trimmed = lo <= hi ? kept.slice(lo, hi + 1) : []
  const sig = trimmed.filter(w => w.kind === 'num' || (w.kind === 'word' && (w.t.length >= 3 || ING.has(w.t) || STEP.has(w.t)))).length
  const content = trimmed.filter(w => w.kind === 'word' && !STOP.has(w.t)).length
  const hasVerb = trimmed.some(w => w.kind === 'word' && COOK_VERBS.has(w.t))
  const hookish = trimmed.some(w => w.kind === 'word' && HOOK.has(w.t)) && !hasVerb
  const text = trimmed.map(w => w.t).join(' ').replace(/\s+/g, ' ').trim()
  return { text, tokens: trimmed, sig, content, hasVerb, hookish }
}

/* --- snap uncertain words to the KNOWN ingredient the corpus expects --- */

// carriers whose top filler is overwhelmingly dominant, so overriding a wrong word
// in that slot is safe ("stick of X" is almost always butter/margarine, "N cloves X"
// is almost always garlic). Varied carriers (can/cup/jar/box) are left alone.
const SAFE_CARRIER = new Set(['stick', 'sticks', 'ground', 'cloves', 'clove', 'dash', 'pinch'])

function slotOverride(tokens) {
  const carriers = tokens.map((w, i) => ({ w, i })).filter(({ w }) => w.kind === 'word' && SAFE_CARRIER.has(w.t) && SLOTS.has(w.t))
  for (const { w, i } of carriers) {
    const slot = SLOTS.get(w.t)
    for (let j = i + 1; j < Math.min(i + 4, tokens.length); j++) {
      const nx = tokens[j]
      if (nx.kind !== 'word') continue
      if (nx.t === 'of' || nx.t === 'a' || nx.t === 'the' || UNITS.has(nx.t)) continue
      // only override a genuine food-ish token that doesn't belong in this slot
      if (nx.t.length >= 3 && !slot.set.has(nx.t) && !STOP.has(nx.t) && !COOK_VERBS.has(nx.t)) {
        if (!isHead(nx.t) || (INGHEAD_RANK.get(nx.t) ?? 0) > 250) nx.t = slot.top
      }
      break
    }
  }
}

// snap a 2-3 word window that is *almost* a canonical ingredient phrase onto it
function phraseSnap(tokens) {
  const idx = tokens.map((w, i) => (w.kind === 'word' ? i : -1)).filter((i) => i >= 0)
  for (let a = 0; a < idx.length - 1; a++) {
    for (const size of [3, 2]) {
      if (a + size - 1 >= idx.length) continue
      const pos = idx.slice(a, a + size)
      const win = pos.map((p) => tokens[p].t)
      if (PHRASES.has(win.join(' '))) continue
      const last = win[win.length - 1]
      let cands = PHRASE_BY_LAST.get(last) || []
      if (!cands.length) for (const e of edits1(last)) { if (PHRASE_BY_LAST.has(e)) cands = cands.concat(PHRASE_BY_LAST.get(e)) }
      let best = null, bestScore = 1e9
      for (const ph of cands) {
        if (ph.length !== size) continue
        let dist = 0, ok = true
        for (let k = 0; k < size; k++) {
          const d = lev(win[k], ph[k])
          const cap2 = k === size - 1 ? 1 : Math.max(1, Math.ceil(ph[k].length / 2))
          if (d > cap2) { ok = false; break }
          dist += d
        }
        if (ok && dist > 0 && dist < bestScore) { bestScore = dist; best = ph }
      }
      if (best) { for (let k = 0; k < size; k++) tokens[pos[k]].t = best[k]; return true }
    }
  }
  return false
}

// snap only using the safe carrier-slot prior; the fuzzy phrase snap was too eager
// (it could invent a canonical phrase from garbage) so it is intentionally not used.
function reconcile(tokens) {
  const t = tokens.map((w) => ({ ...w }))
  slotOverride(t)
  return t
}

/* Pull the canonical ingredient phrase (and any quantity) around each ingredient
   head found in a line. Returns [{head, text}]. */
function ingredientsFromTokens(tokens) {
  const out = []
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i]
    if (w.kind !== 'word' || !isHead(w.t) || NONHEAD.has(w.t)) continue
    const head = w.t
    // longest canonical phrase ENDING at i (e.g. "ground beef", "garlic powder")
    let phrase = [head], start = i
    for (const size of [3, 2]) {
      if (i - size + 1 < 0) continue
      const win = []
      for (let k = i - size + 1; k <= i; k++) { if (tokens[k].kind !== 'word') { win.length = 0; break } win.push(tokens[k].t) }
      if (win.length === size && PHRASES.has(win.join(' '))) { phrase = win; start = i - size + 1; break }
    }
    const qualified = phrase.length > 1
    if (!qualified) {
      if (GENERIC_HEAD.has(head)) continue
      if (!STAPLE.has(head) && (INGHEAD_RANK.get(head) ?? 999) > 120) continue
      // a head that starts a canonical phrase ("beef" in "beef bouillon") is captured
      // by that longer phrase, so don't also list it on its own
      const nxt = tokens[i + 1]
      if (nxt && nxt.kind === 'word' && PHRASES.has(head + ' ' + nxt.t)) continue
    }
    // grab an immediately-preceding quantity: a number, optionally with a unit
    let p = start - 1, unitStr = ''
    while (p >= 0 && tokens[p].kind === 'word' && (tokens[p].t === 'of' || UNITS.has(tokens[p].t))) {
      if (UNITS.has(tokens[p].t)) unitStr = tokens[p].t + ' ' + unitStr
      p--
    }
    let qty = ''
    if (p >= 0 && tokens[p].kind === 'num') {
      const num = tokens[p].t
      if (unitStr) qty = num + ' ' + unitStr
      else if (COUNTABLE.has(head) && /^[1-4]$/.test(num)) qty = num + ' '
    }
    const text = (qty + phrase.join(' ')).replace(/\s+/g, ' ').trim()
    out.push({ head, text: cap(text), qualified })
  }
  return out
}

function tokenSet(text) { return new Set(text.split(' ').filter(t => t.length >= 3)) }
function jaccard(a, b) {
  const A = tokenSet(a), B = tokenSet(b); if (!A.size || !B.size) return 0
  let i = 0; for (const x of A) if (B.has(x)) i++
  return i / (A.size + B.size - i)
}
function overlap(a, b) {
  const A = tokenSet(a), B = tokenSet(b); let i = 0
  for (const x of A) if (B.has(x)) i++
  return { i, min: Math.min(A.size, B.size) }
}
function sameCaption(a, b) {
  if (jaccard(a.text, b.text) >= 0.4) return true
  const { i, min } = overlap(a.text, b.text)
  if (min >= 2 && i / min >= 0.6) return true
  if (Math.abs(a.frame - b.frame) <= 2 && i >= 2) return true
  return false
}

const CLASS_VERBS = new Set([...COOK_VERBS].filter(v => !['diced', 'sliced', 'minced', 'grease', 'beat'].includes(v)))

/* Read a cook time / oven temp off the frames (e.g. a "1 HR" badge, "bake at 375").
   Requires the same value on >=2 frames so a single misread never invents a time. */
function extractTimeTemp(frames) {
  const timeVotes = new Map(), tempVotes = new Map()
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1)
  for (const fr of frames) {
    const blob = (fr.text || '') + '\n' + (fr.lines || []).map((l) => l.text || l).join('\n')
    const low = blob.toLowerCase()
    let m
    const timeRe = /\b(\d{1,3})\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/gi
    while ((m = timeRe.exec(low))) {
      const n = parseInt(m[1], 10)
      const unit = /^h/.test(m[2]) ? 'h' : 'm'
      if (unit === 'h' && n >= 1 && n <= 8) bump(timeVotes, n * 60)
      if (unit === 'm' && n >= 5 && n <= 240) bump(timeVotes, n)
    }
    const tempRe = /\b(\d{2,3})\s*(?:°|º|deg(?:rees?)?|f\b|fahrenheit)/gi
    while ((m = tempRe.exec(low))) { const n = parseInt(m[1], 10); if (n >= 150 && n <= 550) bump(tempVotes, n) }
  }
  const pick = (m) => { let best = null, bc = 1; for (const [k, c] of m) if (c > bc || (c === bc && best !== null && k > best)) { bc = c; best = k } return best }
  const mins = pick(timeVotes)
  const temp = pick(tempVotes)
  let cook = null
  if (mins != null) cook = mins % 60 === 0 ? `${mins / 60} hr` : `${mins} min`
  return { cook, temp: temp != null ? `${temp}°F` : null }
}

function buildDraft(groups, timeTemp) {
  const recon = groups.map((g) => ({ ...g, toks: reconcile(g.rep.tokens || []), support: g.members ? g.members.length : 1, conf: g.maxConf || 0 }))
  // Ingredients: rebuilt only from ingredients we actually recognize, and only from
  // captions that (a) show up on more than one frame and (b) were read with decent
  // confidence - garbage decorative text is low-confidence and never mined.
  const MINCONF = 24
  const byKey = new Map()
  const nHeadsM = (x) => (x.tokens || []).filter((w) => w.kind === 'word' && isHead(w.t) && !NONHEAD.has(w.t)).length
  for (const g of recon) {
    const members = g.members && g.members.length ? g.members : [g.rep]
    const groupVerb = members.some((m) => m.hasVerb)
    // Mine a group if it's confident, repeated, OR reads as a cooking instruction
    // (a cook verb). A burned-in caption often OCRs cleanly on only one frame at the
    // app's real sampling rate, so single-frame verb lines must not be discarded.
    if (g.conf < MINCONF && g.support < 2 && !groupVerb) continue
    // mine ingredients from the member that actually names the most ingredients (highest
    // confidence to break ties) - the consensus rep is tuned for a clean *sentence*, so it
    // can carry an OCR slip like "mill" while a sibling frame clearly shows "milk".
    let src = members[0]
    for (const m of members) {
      const mh = nHeadsM(m), sh = nHeadsM(src)
      if (mh > sh || (mh === sh && (m.conf || 0) > (src.conf || 0))) src = m
    }
    const ings = ingredientsFromTokens(reconcile(src.tokens || []))
    for (const ing of ings) {
      const key = ing.qualified ? ing.text.toLowerCase() : ing.head
      const frames = members.map((m) => m.frame)
      const cur = byKey.get(key)
      if (!cur) { byKey.set(key, { ...ing, support: g.support, frames: new Set(frames), order: g.firstFrame, y: g.rep.y, hasQty: /\d/.test(ing.text), verb: src.hasVerb }); continue }
      cur.support = Math.max(cur.support, g.support)
      for (const fr of frames) cur.frames.add(fr)
      cur.order = Math.min(cur.order, g.firstFrame)
      if (/\d/.test(ing.text)) cur.hasQty = true
      if (src.hasVerb) cur.verb = true
      if (ing.text.length > cur.text.length) cur.text = ing.text
    }
  }
  const clusterMax = (frames, w) => {
    const a = [...frames].sort((x, y) => x - y)
    let best = 0
    for (let i = 0; i < a.length; i++) {
      let cnt = 0
      for (let j = i; j < a.length && a[j] - a[i] <= w; j++) cnt++
      if (cnt > best) best = cnt
    }
    return best
  }
  const kept = []
  for (const e of byKey.values()) {
    const strong = e.qualified || e.hasQty || STAPLE.has(e.head) || (INGHEAD_RANK.get(e.head) ?? 999) < 120
    if (!strong) continue
    // An ingredient is trusted when it carries cooking CONTEXT - a canonical phrase
    // ("beef broth"), a quantity ("1 cup ... flour"), or, for a core STAPLE, just a cook
    // verb in its line ("brown ground beef", "whisk in milk"). A bare head that is NOT a
    // staple ("peas" from "Pes", a misread of "pasta pieces") is only trusted when it shows
    // a sustained on-screen presence (>=3 frames close together in time) - a real caption,
    // not a one-off misread that happened to land inside a cook-verb line.
    const clustered = clusterMax(e.frames, 6) >= 3
    const persistent = e.qualified || e.hasQty || (STAPLE.has(e.head) && e.verb) || clustered
    if (persistent) kept.push(e)
  }
  // a specific cheese ("cheddar") plus a bare "cheese" is one ingredient
  const CHEESE_TYPES = new Set(['cheddar', 'mozzarella', 'parmesan', 'monterey', 'swiss', 'colby',
    'gouda', 'feta', 'ricotta', 'provolone', 'jack', 'gruyere', 'romano', 'asiago'])
  const typeEntry = kept.find((e) => !e.qualified && CHEESE_TYPES.has(e.head))
  const cheeseEntry = kept.find((e) => !e.qualified && e.head === 'cheese')
  let dropCheese = false
  if (typeEntry && cheeseEntry) { typeEntry.text = cap(typeEntry.head + ' cheese'); dropCheese = true }
  // collapse a bare head into its qualified phrase (drop "cheese" if "cheddar cheese")
  const qualifiedHeads = new Set(kept.filter((e) => e.qualified).map((e) => e.head))
  const ingList = kept
    .filter((e) => !(dropCheese && e === cheeseEntry))
    .filter((e) => !(!e.qualified && qualifiedHeads.has(e.head)))
    .sort((a, b) => a.order - b.order || a.y - b.y)
    .map((x) => x.text)
  // Directions: step lines (with a cook verb) that persist across frames, reconciled
  const dirList = []
  for (const g of recon) {
    const text = g.toks.map((w) => w.t).join(' ').replace(/\s+/g, ' ').trim()
    const toks = text.split(' ')
    const content = toks.filter((t) => (t.length >= 3 && !STOP.has(t)) || COOK_VERBS.has(t)).length
    if (!toks.some((t) => CLASS_VERBS.has(t)) || text.length < 6) continue
    // a real step persists across frames (support) and has some substance; this drops
    // one-word / single-frame OCR junk ("gold fry", "add ground", "top with 1").
    if ((g.support >= 2 && g.conf >= 20 && content >= 2) || (content >= 4 && g.conf >= 28)) dirList.push(cap(text))
  }
  const out = []
  if (ingList.length) { out.push('Ingredients:'); for (const l of ingList) out.push('- ' + l) }
  if (dirList.length) { if (out.length) out.push(''); out.push('Directions:'); for (const l of dirList) out.push('- ' + l) }
  const notes = []
  if (timeTemp.cook) notes.push(`- Cook time: about ${timeTemp.cook}`)
  if (timeTemp.temp) notes.push(`- Bake at ${timeTemp.temp}`)
  if (notes.length) { if (out.length) out.push(''); out.push('Notes:'); out.push(...notes) }
  return out.join('\n')
}

function normalizeFrames(frames) {
  const list = Array.isArray(frames) ? frames : String(frames || '').split(/\n\n+/).map((t) => ({ text: t }))
  return list.map((f, idx) => {
    if (typeof f === 'string') return { frame: idx, text: f, lines: f.split('\n').map((text, k) => ({ text, y0: k, c: 60 })) }
    const frame = typeof f.i === 'number' ? f.i : idx
    if (Array.isArray(f.lines) && f.lines.length) return { frame, text: f.text || '', lines: f.lines.map((ln, k) => ({ text: ln.text || '', y0: ln.y0 ?? k, c: ln.c ?? 60 })) }
    const txt = f.text || f.txt || ''
    return { frame, text: txt, lines: String(txt).split('\n').map((text, k) => ({ text, y0: k, c: 60 })) }
  })
}

export async function cleanVideoText(frames) {
  try { await ready() } catch { return fallbackClean(frames) }
  const norm = normalizeFrames(frames)
  const cand = []
  for (const fr of norm) {
    for (const ln of fr.lines) {
      const cl = cleanLine(ln.text || '')
      if (cl.hookish) continue
      const okNormal = cl.sig >= 2 && cl.content >= 1 && cl.text.length >= 6
      // a short line that is just a clearly-named ingredient ("flour") is worth keeping,
      // but only when it was read with real confidence (decorative junk is low-conf)
      const okHead = (ln.c || 0) >= 22 && cl.content >= 1 && cl.content <= 2 &&
        cl.tokens.some((w) => w.kind === 'word' && isHead(w.t) && !NONHEAD.has(w.t) && !GENERIC_HEAD.has(w.t))
      if (okNormal || okHead) {
        cand.push({ text: cl.text, tokens: cl.tokens, content: cl.content, hasVerb: cl.hasVerb, frame: fr.frame, y: ln.y0 || 0, conf: ln.c || 0 })
      }
    }
  }
  const groups = []
  const nHeads = (x) => (x.tokens || []).filter((w) => w.kind === 'word' && isHead(w.t) && !NONHEAD.has(w.t)).length
  for (const c of cand) {
    let g = null
    for (const grp of groups) if (sameCaption(grp.rep, c)) { g = grp; break }
    if (!g) { groups.push({ rep: c, members: [c], firstFrame: c.frame, maxConf: c.conf }); continue }
    g.members.push(c)
    g.firstFrame = Math.min(g.firstFrame, c.frame)
    g.maxConf = Math.max(g.maxConf, c.conf)
    // prefer a representative that actually names an ingredient, then richer/longer text
    const ch = nHeads(c), rh = nHeads(g.rep)
    if (ch > rh || (ch === rh && (c.content > g.rep.content || (c.content === g.rep.content && c.text.length > g.rep.text.length)))) g.rep = c
  }
  const solid = groups.filter(g => g.members.length >= 2 || g.rep.hasVerb || g.rep.content >= 3)
  solid.sort((a, b) => a.firstFrame - b.firstFrame || a.rep.y - b.rep.y)
  return buildDraft(solid, extractTimeTemp(norm))
}

export async function draftStrength(frames) {
  try { await ready() } catch { return { lines: 0, verbs: 0 } }
  const norm = normalizeFrames(frames)
  let lines = 0, verbs = 0
  const seen = []
  for (const fr of norm) for (const ln of fr.lines) {
    const cl = cleanLine(ln.text || '')
    if (cl.hookish || cl.sig < 2 || cl.content < 1 || cl.text.length < 6) continue
    if (seen.some(s => jaccard(s, cl.text) >= 0.5)) continue
    seen.push(cl.text); lines++; if (cl.hasVerb) verbs++
  }
  return { lines, verbs }
}

function fallbackClean(frames) {
  const norm = normalizeFrames(frames)
  const seen = new Set(); const out = []
  for (const fr of norm) for (const ln of fr.lines) {
    const t = (ln.text || '').replace(/\s+/g, ' ').trim()
    const k = t.toLowerCase().replace(/[^a-z]/g, '')
    if (t.length >= 6 && k.length >= 4 && !seen.has(k)) { seen.add(k); out.push(t) }
  }
  return out.join('\n')
}
