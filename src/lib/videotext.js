/* Turn the noisy, per-frame OCR captured from a cooking reel's on-screen captions
   into a clean, de-duplicated recipe DRAFT for the user to review.

   How this avoids the old "made-up words" problem: every token is checked against a
   compact cooking language model learned from 500k real recipes (recipe-lexicon.js).
   A word that isn't real is either SPLIT into real words ("dicedonion" ->
   "diced onion"), gently CORRECTED to the nearest real word, or DROPPED - it is never
   invented. Captions that the animation repeats across frames vote for each other
   (consensus), and single-frame hallucinations are discarded. The result is a rough
   but real-word draft the user cleans up against the playing video. */

let _ready = null            // resolves once the lexicon is loaded + indexed
let RANK, LOGC, VOCAB, BIGRAMS, ING, STEP, UNITS
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
// nearest real word, or null to DROP; never invents a word
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
  // bigram context repair (valid->valid, e.g. "ground beet" -> "ground beef")
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
  // drop stray single letters unless a keepable short/unit
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
  // trim junk off both ends: keep from the first anchor to the last anchor
  const isAnchor = (i) => {
    const w = kept[i]; if (!w) return false
    if (w.kind === 'num') { const n = kept[i + 1]; return !!(n && n.kind === 'word' && VOCAB.has(n.t) && n.t.length >= 3 && !STOP.has(n.t)) }
    if (COOK_VERBS.has(w.t) || ING.has(w.t) || STEP.has(w.t)) return true
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

// classify each ordered line into an ingredient fragment vs a direction step.
// Uses action verbs only (ingredient adjectives like "diced" don't make a step).
const CLASS_VERBS = new Set([...COOK_VERBS].filter(v => !['diced', 'sliced', 'minced', 'grease', 'beat'].includes(v)))
function formatDraft(lines) {
  const ing = [], dir = []
  for (const L of lines) {
    const toks = L.split(' ')
    const hasVerb = toks.some(t => CLASS_VERBS.has(t))
    const hasUnitOrNum = toks.some(t => UNITS.has(t) || ING.has(t) || /^\d/.test(t))
    if (!hasVerb && hasUnitOrNum && toks.length <= 6) ing.push(cap(L))
    else dir.push(cap(L))
  }
  const out = []
  if (ing.length) { out.push('Ingredients:'); for (const l of ing) out.push('- ' + l) }
  if (dir.length) { if (out.length) out.push(''); out.push('Directions:'); for (const l of dir) out.push('- ' + l) }
  return out.join('\n')
}

// normalize incoming frames to [{ frame, lines:[{text, y0}] }]
function normalizeFrames(frames) {
  const list = Array.isArray(frames) ? frames : String(frames || '').split(/\n\n+/).map((t) => ({ text: t }))
  return list.map((f, idx) => {
    if (typeof f === 'string') return { frame: idx, lines: f.split('\n').map((text, k) => ({ text, y0: k })) }
    const frame = typeof f.i === 'number' ? f.i : idx
    if (Array.isArray(f.lines) && f.lines.length) return { frame, lines: f.lines.map((ln, k) => ({ text: ln.text || '', y0: ln.y0 ?? k })) }
    const txt = f.text || f.txt || ''
    return { frame, lines: String(txt).split('\n').map((text, k) => ({ text, y0: k })) }
  })
}

/**
 * Clean multi-frame OCR into a recipe draft.
 * @param {Array|string} frames structured frames [{i,t,lines:[{text,y0}]}] (preferred),
 *        or plain per-frame strings / {text}|{txt} objects (back-compat).
 * @returns {Promise<string>} a de-duplicated, real-word recipe draft (headinged).
 */
export async function cleanVideoText(frames) {
  try { await ready() } catch { return fallbackClean(frames) }
  const norm = normalizeFrames(frames)
  const cand = []
  for (const fr of norm) {
    for (const ln of fr.lines) {
      const cl = cleanLine(ln.text || '')
      if (cl.hookish) continue
      if (cl.sig >= 2 && cl.content >= 1 && cl.text.length >= 6) {
        cand.push({ text: cl.text, content: cl.content, hasVerb: cl.hasVerb, frame: fr.frame, y: ln.y0 || 0 })
      }
    }
  }
  const groups = []
  for (const c of cand) {
    let g = null
    for (const grp of groups) if (sameCaption(grp.rep, c)) { g = grp; break }
    if (!g) { groups.push({ rep: c, members: [c], firstFrame: c.frame }); continue }
    g.members.push(c)
    g.firstFrame = Math.min(g.firstFrame, c.frame)
    if (c.content > g.rep.content || (c.content === g.rep.content && c.text.length > g.rep.text.length)) g.rep = c
  }
  const solid = groups.filter(g => g.members.length >= 2 || g.rep.hasVerb || g.rep.content >= 3)
  solid.sort((a, b) => a.firstFrame - b.firstFrame || a.rep.y - b.rep.y)
  const lines = solid.map(g => g.rep.text)
  return formatDraft(lines)
}

/** How many real recipe lines did we recover? Used to avoid fabricating a recipe
 *  from a couple of noise fragments - the caller can steer to the screenshot path. */
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

// last-resort cleaner if the lexicon can't load (offline first scan): dedupe raw lines
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
