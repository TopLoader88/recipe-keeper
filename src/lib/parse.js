/* Extracts a recipe out of a web page or a block of pasted text.

   Order of preference:
     1. schema.org JSON-LD  (almost every recipe site publishes this)
     2. schema.org microdata
     3. Open Graph + DOM heuristics
   Whatever comes back is loose/raw — normalize.js decides the house style. */

import { stripHtml, parseIngredient } from './normalize.js'
import { detectVideo } from './video.js'

/* ---------- JSON-LD ---------- */

function collectJsonLd(doc) {
  const nodes = []
  const scripts = doc.querySelectorAll('script[type*="ld+json" i]')
  for (const script of scripts) {
    const text = script.textContent || ''
    if (!text.trim()) continue
    let data
    try {
      data = JSON.parse(text)
    } catch {
      // Some sites emit trailing commas or raw newlines inside strings.
      try {
        data = JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' ').replace(/,\s*([}\]])/g, '$1'))
      } catch {
        continue
      }
    }
    pushFlat(nodes, data)
  }
  return nodes
}

function pushFlat(out, data) {
  if (data == null) return
  if (Array.isArray(data)) { data.forEach((d) => pushFlat(out, d)); return }
  if (typeof data !== 'object') return
  out.push(data)
  if (data['@graph']) pushFlat(out, data['@graph'])
}

function typesOf(node) {
  const t = node?.['@type'] ?? node?.type
  if (!t) return []
  return (Array.isArray(t) ? t : [t]).map((x) => String(x).toLowerCase())
}

function findRecipeNode(nodes) {
  return nodes.find((n) => typesOf(n).some((t) => t === 'recipe' || t.endsWith('/recipe'))) || null
}

/* ---------- value coercion ---------- */

function firstString(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = firstString(v)
      if (s) return s
    }
    return ''
  }
  if (typeof value === 'object') return firstString(value.name || value.url || value.contentUrl || value['@id'] || '')
  return String(value)
}

function imageFrom(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return imageFrom(value[0])
  if (typeof value === 'object') return value.url || value.contentUrl || imageFrom(value['@list']) || ''
  return ''
}

function listOf(value) {
  if (value == null) return []
  if (Array.isArray(value)) return value
  return [value]
}

function absolute(url, base) {
  if (!url) return ''
  try { return new URL(url, base).href } catch { return url }
}

/* ---------- microdata + heuristics ---------- */

function microdataRecipe(doc) {
  const scope = doc.querySelector('[itemtype*="schema.org/Recipe" i]')
  if (!scope) return null
  const prop = (name) => Array.from(scope.querySelectorAll(`[itemprop="${name}" i]`))
  const text = (el) => (el?.getAttribute('content') || el?.textContent || '').trim()
  const many = (name) => prop(name).map(text).filter(Boolean)

  const ingredients = many('recipeIngredient').concat(many('ingredients'))
  const instructions = many('recipeInstructions')
  if (!ingredients.length && !instructions.length) return null

  return {
    name: text(prop('name')[0]),
    description: text(prop('description')[0]),
    image: prop('image')[0]?.getAttribute('src') || text(prop('image')[0]),
    recipeYield: text(prop('recipeYield')[0]),
    prepTime: prop('prepTime')[0]?.getAttribute('datetime') || text(prop('prepTime')[0]),
    cookTime: prop('cookTime')[0]?.getAttribute('datetime') || text(prop('cookTime')[0]),
    totalTime: prop('totalTime')[0]?.getAttribute('datetime') || text(prop('totalTime')[0]),
    recipeIngredient: ingredients,
    recipeInstructions: instructions,
    author: text(prop('author')[0])
  }
}

const JUNK_LINE = /^(advertisement|sponsored|jump to recipe|print recipe|save recipe|share|pin it|rate this|watch|photo|image|video)\b/i

function textsFrom(nodes) {
  const out = []
  for (const node of nodes) {
    const t = stripHtml(node.innerHTML || node.textContent || '')
    for (const line of t.split('\n')) {
      const clean = line.trim()
      if (clean && clean.length < 400 && !JUNK_LINE.test(clean)) out.push(clean)
    }
  }
  return out
}

function heuristicRecipe(doc) {
  const pick = (selectors) => {
    for (const sel of selectors) {
      const found = Array.from(doc.querySelectorAll(sel))
      if (found.length) {
        const lines = textsFrom(found)
        if (lines.length >= 2) return lines
      }
    }
    return []
  }

  const ingredients = pick([
    '[class*="ingredient" i] li',
    '[id*="ingredient" i] li',
    '[class*="ingredient" i] p',
    'ul[class*="ingredient" i] > *'
  ])

  const instructions = pick([
    '[class*="instruction" i] li',
    '[class*="direction" i] li',
    '[class*="method" i] li',
    '[id*="instruction" i] li',
    '[class*="instruction" i] p',
    '[class*="direction" i] p'
  ])

  if (!ingredients.length && !instructions.length) return null
  return { recipeIngredient: ingredients, recipeInstructions: instructions }
}

function metaContent(doc, names) {
  for (const name of names) {
    const el =
      doc.querySelector(`meta[property="${name}"]`) ||
      doc.querySelector(`meta[name="${name}"]`)
    const content = el?.getAttribute('content')
    if (content) return content.trim()
  }
  return ''
}

/* ---------- public: HTML ---------- */

/**
 * @param {string} html
 * @param {string} sourceUrl
 * @returns {{raw:object, method:string, confidence:'high'|'medium'|'low'}}
 */
export function parseHtmlRecipe(html, sourceUrl = '') {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const og = {
    title: metaContent(doc, ['og:title', 'twitter:title']),
    description: metaContent(doc, ['og:description', 'twitter:description', 'description']),
    image: metaContent(doc, ['og:image', 'og:image:secure_url', 'twitter:image']),
    video: metaContent(doc, ['og:video:url', 'og:video', 'og:video:secure_url', 'twitter:player']),
    site: metaContent(doc, ['og:site_name'])
  }

  const jsonLdNode = findRecipeNode(collectJsonLd(doc))
  const node = jsonLdNode || microdataRecipe(doc) || heuristicRecipe(doc)
  const method = jsonLdNode ? 'schema.org JSON-LD' : node && node.name !== undefined ? 'schema.org microdata' : node ? 'page structure' : 'page metadata'
  const confidence = jsonLdNode ? 'high' : node ? 'medium' : 'low'

  const ingredients = listOf(node?.recipeIngredient || node?.ingredients).map((v) => firstString(v)).filter(Boolean)
  const instructions = node?.recipeInstructions ?? node?.instructions ?? []

  const videoNode = node?.video ? (Array.isArray(node.video) ? node.video[0] : node.video) : null
  const videoUrl =
    absolute(videoNode?.embedUrl || videoNode?.contentUrl || videoNode?.url || '', sourceUrl) ||
    absolute(og.video, sourceUrl)

  const raw = {
    title: firstString(node?.name) || og.title || stripHtml(doc.querySelector('h1')?.textContent || '') || doc.title || '',
    description: firstString(node?.description) || og.description || '',
    image: absolute(imageFrom(node?.image) || og.image, sourceUrl),
    recipeYield: node?.recipeYield ?? '',
    servings: node?.recipeYield ?? null,
    prepTime: node?.prepTime ?? null,
    cookTime: node?.cookTime ?? null,
    totalTime: node?.totalTime ?? null,
    ingredients,
    instructions,
    keywords: node?.keywords ?? [],
    recipeCategory: node?.recipeCategory ?? [],
    recipeCuisine: node?.recipeCuisine ?? [],
    author: firstString(node?.author),
    nutrition: node?.nutrition ? cleanNutrition(node.nutrition) : null,
    siteName: og.site || hostOf(sourceUrl),
    video: videoUrl ? detectVideo(videoUrl) : null
  }

  return { raw, method, confidence, ok: Boolean(ingredients.length || (instructions && String(instructions).length > 20)) }
}

function cleanNutrition(n) {
  const keys = ['calories', 'proteinContent', 'fatContent', 'carbohydrateContent', 'fiberContent', 'sugarContent', 'sodiumContent', 'servingSize']
  const out = {}
  for (const k of keys) {
    const v = firstString(n[k])
    if (v) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

/* ---------- public: free text (captions, transcripts, screenshots-to-text) ---------- */

const ING_HEAD = /^(?:#+\s*)?(ingredients?|what you(?:'ll| will)? need|you(?:'ll| will)? need|shopping list|grocery list)\s*:?\s*$/i
const STEP_HEAD = /^(?:#+\s*)?(instructions?|directions?|method|steps|how to make(?: it)?|how i make it|preparation|prep|recipe)\s*:?\s*$/i
const NOTE_HEAD = /^(?:#+\s*)?(notes?|tips?|to serve|storage)\s*:?\s*$/i
const SECTION_HEAD = /^(?:#+\s*)?for the .{2,40}\s*:?\s*$/i

const LEADING_DECOR = /^[\s\p{Extended_Pictographic}☀-➿•·▢□◦‣\-–—*+>]+/u

function looksLikeIngredient(line) {
  if (line.length > 90) return false
  if (/^\d+(?:[.,:]\d+)?\s*[.)]\s/.test(line)) return false // "1) Do the thing"
  const parsed = parseIngredient(line)
  if (!parsed || parsed.section) return false
  if (parsed.quantity != null) return true
  if (parsed.unit) return true
  // Short noun-ish phrases with no verb read as ingredients.
  return line.length <= 45 && !/\b(heat|cook|bake|mix|stir|add|pour|place|serve|whisk|combine|preheat|remove|let|until|then)\b/i.test(line)
}

/**
 * Parses a TikTok/Reels caption, a transcript, or anything pasted by hand.
 * @returns {{raw:object, method:string, confidence:string, ok:boolean}}
 */
export function parseTextRecipe(input, sourceUrl = '') {
  const text = stripHtml(String(input || ''))
  const rawLines = text.split(/\r?\n/).map((l) => l.replace(LEADING_DECOR, '').trim())

  const tags = []
  const lines = rawLines
    .map((line) => line.replace(/#(\w{2,30})/g, (_, tag) => { tags.push(tag.toLowerCase()); return '' }).trim())
    .filter(Boolean)
    .filter((l) => !JUNK_LINE.test(l))

  const ingredients = []
  const steps = []
  const notes = []
  let title = ''
  let mode = null
  let sawHeading = false

  for (const line of lines) {
    if (ING_HEAD.test(line)) { mode = 'ing'; sawHeading = true; continue }
    if (STEP_HEAD.test(line)) { mode = 'step'; sawHeading = true; continue }
    if (NOTE_HEAD.test(line)) { mode = 'note'; sawHeading = true; continue }
    if (SECTION_HEAD.test(line)) {
      sawHeading = true
      mode = 'ing'
      ingredients.push(line.replace(/^#+\s*/, '').replace(/:$/, '').trim() + ':')
      continue
    }

    if (mode === 'ing') { ingredients.push(line); continue }
    if (mode === 'step') { steps.push(line); continue }
    if (mode === 'note') { notes.push(line); continue }

    if (!title && line.length <= 90 && !looksLikeIngredient(line)) { title = line; continue }
    if (looksLikeIngredient(line)) ingredients.push(line)
    else steps.push(line)
  }

  // Numbered lines always belong in the method, wherever they landed.
  for (let i = ingredients.length - 1; i >= 0; i--) {
    if (/^(?:step\s*)?\d{1,2}\s*[.)]\s+\S/i.test(ingredients[i])) {
      steps.unshift(ingredients.splice(i, 1)[0])
    }
  }

  if (!title) {
    const first = lines[0] || ''
    title = first.slice(0, 80)

    // The first line only landed in a bucket because a bare noun phrase reads
    // like an ingredient. A recipe is never its own ingredient — but "2 eggs"
    // genuinely is, so only reclaim lines that carry no quantity or unit.
    const parsed = parseIngredient(first)
    if (parsed && parsed.quantity == null && !parsed.unit) {
      const i = ingredients.indexOf(first)
      if (i !== -1) ingredients.splice(i, 1)
      else {
        const j = steps.indexOf(first)
        if (j !== -1) steps.splice(j, 1)
      }
    }
  }

  return {
    raw: {
      title,
      description: '',
      ingredients,
      instructions: steps,
      notes: notes.join('\n'),
      keywords: Array.from(new Set(tags)).slice(0, 12),
      siteName: hostOf(sourceUrl),
      video: sourceUrl ? detectVideo(sourceUrl) : null
    },
    method: sawHeading ? 'pasted text (headings)' : 'pasted text (inferred)',
    confidence: sawHeading ? 'medium' : 'low',
    ok: ingredients.length > 0 || steps.length > 0
  }
}

/* A social-video caption is usually one long line: a title, an inline
   "Ingredients:" list separated by commas, and maybe "Method:" steps, all run
   together. parseTextRecipe needs those on separate lines to tell them apart, so
   this reshapes a caption into the line-per-item form it expects. */
export function normalizeCaption(caption) {
  let t = String(caption || '').replace(/\r/g, '')

  // Put recognised section headings on their own line.
  t = t.replace(
    /\s*(ingredients?|what you(?:'ll| will)? need|you(?:'ll| will)? need|instructions?|directions?|method|steps|preparation)\s*:\s*/gi,
    (m, h) => `\n${h}:\n`
  )

  // Break a "1. do this 2. do that" run of numbered steps onto separate lines.
  t = t.replace(/\s+(?=(?:step\s*)?\d{1,2}\s*[.)]\s+[A-Za-z])/gi, '\n')

  // Split a comma-separated quantity list ("16oz cheese, 2 cans chili, 1 tsp salt")
  // into one ingredient per line. Only break before a comma that is followed by a
  // quantity, so a note like "flour, sifted" stays on its own line intact.
  const out = []
  for (const rawLine of t.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const parts = line.split(/\s*,\s*(?=(?:\d|½|¼|¾|⅓|⅔|⅛|a |an |one |two |three |four |half ))/i)
    if (parts.length > 1) for (const p of parts) { const q = p.trim(); if (q) out.push(q) }
    else out.push(line)
  }
  return out.join('\n')
}

/** r.jina.ai returns markdown; strip the syntax before the text parser sees it. */
export function markdownToText(md) {
  return String(md || '')
    .replace(/^Title:\s*(.+)$/im, '$1')
    .replace(/^URL Source:.*$/im, '')
    .replace(/^Markdown Content:\s*$/im, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
