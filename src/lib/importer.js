/* Fetches a page or a video link, extracts a recipe, and captures the original.

   Browsers block cross-origin page fetches, so importing a website needs a relay.
   Three public readers are tried in order; each one only ever sees the URL you
   are importing. Turn them off in Settings and paste-import still works offline. */

import { getSetting } from './db.js'
import { parseHtmlRecipe, parseTextRecipe, markdownToText, normalizeCaption, extractSocialMeta } from './parse.js'
import { normalizeRecipe } from './normalize.js'
import { detectVideo, fetchOEmbed, resolveFromOEmbed, resolveFacebookVideo } from './video.js'
import { newId, hostnameOf } from './format.js'
import { toStoredImage } from './image.js'

const MAX_CAPTURE_BYTES = 500_000
const FETCH_TIMEOUT_MS = 20_000
/* Inlining the photo is an optimisation, not part of the import — the recipe
   still shows the picture straight from its URL if this fails. It was costing
   the full 20s on a slow relay and doubling perceived import time, so it gets
   a short leash of its own. */
const IMAGE_TIMEOUT_MS = 6_000

/* Relay order matters. Measured from a file:// page against three recipe sites:
   Jina-with-HTML returned usable schema.org markup 3/3 in under 1.5s, AllOrigins
   managed 1/3 at ~8s, and corsproxy.io answers 403 to everything now — it wanted
   an API key, so it was removed rather than left to fail first every time. */
export const PROXIES = [
  {
    id: 'jina-html',
    label: 'Jina Reader',
    kind: 'html',
    note: 'Returns the raw page HTML. Most reliable.',
    build: (url) => `https://r.jina.ai/${url}`,
    headers: { 'x-return-format': 'html' }
  },
  {
    id: 'allorigins',
    label: 'AllOrigins',
    kind: 'html',
    note: 'Returns the raw page HTML.',
    build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  },
  {
    id: 'jina',
    label: 'Jina Reader (text)',
    kind: 'text',
    note: 'Returns readable text. Last resort when the markup is unusable.',
    build: (url) => `https://r.jina.ai/${url}`
  }
]

export const IMPORT_DEFAULTS = {
  allowRelays: true,
  relayOrder: PROXIES.map((p) => p.id),
  tryDirectFirst: true,
  cacheImages: true
}

export async function getImportSettings() {
  const saved = await getSetting('import', null)
  const settings = { ...IMPORT_DEFAULTS, ...(saved || {}) }

  // A relay order saved before this list changed can still name proxies that no
  // longer exist (and miss ones that do), which would quietly resurrect a dead
  // relay. Drop the unknown, keep whatever order was saved, and slot new relays
  // in at their default position rather than last — appending would bury the
  // fastest one behind the two it was meant to replace.
  const order = PROXIES.map((p) => p.id)
  const known = new Set(order)
  const merged = (settings.relayOrder || []).filter((id) => known.has(id))
  for (const id of order) {
    if (!merged.includes(id)) merged.splice(Math.min(order.indexOf(id), merged.length), 0, id)
  }
  settings.relayOrder = merged

  return settings
}

function withTimeout(signal, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

/**
 * Tries the page directly, then each enabled relay.
 * @returns {{body:string, kind:'html'|'text', via:string}}
 */
export async function fetchPage(url, { settings, signal, onProgress } = {}) {
  const config = settings || (await getImportSettings())
  const attempts = []

  if (config.tryDirectFirst) {
    attempts.push({ id: 'direct', label: 'direct', kind: 'html', target: url })
  }
  if (config.allowRelays) {
    for (const id of config.relayOrder) {
      const proxy = PROXIES.find((p) => p.id === id)
      if (proxy) attempts.push({ id: proxy.id, label: proxy.label, kind: proxy.kind, target: proxy.build(url), headers: proxy.headers })
    }
  }

  const errors = []
  for (const attempt of attempts) {
    onProgress?.(`Fetching via ${attempt.label}…`)
    const t = withTimeout(signal)
    try {
      const res = await fetch(attempt.target, {
        signal: t.signal,
        mode: 'cors',
        credentials: 'omit',
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          ...(attempt.headers || {})
        }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.text()
      if (!body || body.length < 200) throw new Error('empty response')
      return { body, kind: attempt.kind, via: attempt.label }
    } catch (err) {
      errors.push(`${attempt.label}: ${err?.message || err}`)
    } finally {
      t.done()
    }
  }

  const detail = errors.length ? ` (${errors.join('; ')})` : ''
  throw new Error(`Could not reach that page${detail}`)
}

/* Facebook and Instagram hand out no usable public oEmbed, so the caption we
   need lives in the share page's own og: tags. A reader relay can see them even
   though a direct fetch is walled, so fetch the page and lift just the metadata
   (title, caption, thumbnail) rather than trying to scrape the whole body. */
export async function fetchSocialMeta(url, { settings, signal, onProgress } = {}) {
  let page
  try {
    page = await fetchPage(url, { settings, signal, onProgress })
  } catch {
    return null
  }
  if (page.kind === 'html') {
    const meta = extractSocialMeta(page.body)
    return (meta.description || meta.title || meta.image) ? meta : null
  }
  const text = markdownToText(page.body)
  return text ? { title: '', description: text, image: '' } : null
}

/* Prefer the caption (og:description); fall back to og:title with Facebook's
   "1.8M views \u00b7 27K reactions | " engagement prefix stripped off. */
function pickCaption(meta) {
  if (!meta) return ''
  const desc = String(meta.description || '').trim()
  if (desc) return desc
  return String(meta.title || '').replace(/^[\d.,]+[kmb]?\s*views?\b[^|]*\|\s*/i, '').trim()
}

/** Downscales and inlines an image so the recipe still has a picture offline. */
export async function cacheImage(url, { settings, signal } = {}) {
  if (!url) return null
  const config = settings || (await getImportSettings())
  if (!config.cacheImages) return null

  const targets = [url]
  if (config.allowRelays) targets.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`)

  for (const target of targets) {
    const t = withTimeout(signal, IMAGE_TIMEOUT_MS)
    try {
      const res = await fetch(target, { signal: t.signal, mode: 'cors', credentials: 'omit' })
      if (!res.ok) continue
      const blob = await res.blob()
      if (!blob.type.startsWith('image/') || blob.size === 0) continue
      return await shrinkToDataUrl(blob)
    } catch {
      /* try the next source */
    } finally {
      t.done()
    }
  }
  return null
}

async function shrinkToDataUrl(blob, max = 1200) {
  return toStoredImage(blob, { max })
}

/** Wraps a parsed result into a storable recipe plus its untouched capture. */
export function buildRecipe(parsed, { sourceUrl = '', method = '', via = '', video = null, capture = {} } = {}) {
  const normalized = normalizeRecipe({ ...parsed.raw, video: video || parsed.raw?.video || null })
  const id = newId()
  const now = Date.now()

  const recipe = {
    ...normalized,
    id,
    createdAt: now,
    updatedAt: now,
    source: {
      url: sourceUrl,
      siteName: parsed.raw?.siteName || hostnameOf(sourceUrl),
      author: normalized.author || '',
      method: method || parsed.method || 'manual',
      via,
      confidence: parsed.confidence || 'low',
      importedAt: now
    }
  }

  const original = {
    recipeId: id,
    url: sourceUrl,
    capturedAt: now,
    method: recipe.source.method,
    via,
    html: truncate(capture.html),
    text: truncate(capture.text),
    oembed: capture.oembed || null,
    rawIngredients: (parsed.raw?.ingredients || []).map(String),
    rawInstructions: toRawLines(parsed.raw?.instructions)
  }

  return { recipe, original }
}

function truncate(value) {
  if (!value) return ''
  const s = String(value)
  return s.length > MAX_CAPTURE_BYTES ? s.slice(0, MAX_CAPTURE_BYTES) + '\n…[capture truncated]' : s
}

function toRawLines(instructions) {
  if (!instructions) return []
  if (typeof instructions === 'string') return instructions.split(/\r?\n+/).filter(Boolean)
  if (Array.isArray(instructions)) {
    return instructions.map((i) => (typeof i === 'string' ? i : i?.text || i?.name || '')).filter(Boolean)
  }
  return []
}

/**
 * The main entry point for "paste a link and import it".
 * Always resolves — check `result.needsPaste` to see whether the platform
 * withheld the text and the user has to help.
 */
export async function importFromUrl(url, { signal, onProgress } = {}) {
  const settings = await getImportSettings()
  const warnings = []
  const clean = String(url || '').trim()
  if (!/^https?:\/\//i.test(clean)) throw new Error('That does not look like a web address.')

  let video = detectVideo(clean)
  let oembed = null
  let caption = ''

  if (video) {
    onProgress?.(`Reading ${video.label} link…`)
    oembed = await fetchOEmbed(clean, { signal })
    if (oembed?.title) caption = normalizeCaption(oembed.title)
    if (video.kind === 'unresolved') {
      const resolved = resolveFromOEmbed(clean, oembed)
      if (resolved) video = resolved
      else if (!oembed && video.platform !== 'facebook') warnings.push('This is a short share link, so the video could not be embedded. Open it once and paste the full link to play it in the app.')
    }
  }

  // Facebook and Instagram don't serve a public oEmbed, so oEmbed gave us
  // nothing above. Their share pages still carry the caption in og:title /
  // og:description (and a thumbnail in og:image) - a reader relay can see those
  // even though the page is walled to a direct fetch. Read the caption from the
  // page's own metadata and treat it exactly like an oEmbed caption.
  if (video && ['facebook', 'instagram'].includes(video.platform) && (!caption || video.kind === 'unresolved' || !video.embedUrl)) {
    onProgress?.('Reading the caption\u2026')
    const meta = await fetchSocialMeta(clean, { settings, signal, onProgress })
    if (meta) {
      const capText = pickCaption(meta)
      if (capText && !caption) caption = normalizeCaption(capText)
      if (capText || meta.image) {
        oembed = {
          title: capText || (oembed && oembed.title) || '',
          author: (meta && meta.author) || (oembed && oembed.author) || '',
          thumbnail: (meta && meta.image) || (oembed && oembed.thumbnail) || '',
          html: '',
          providerName: video.label
        }
      }
      // A Facebook /share/ or /reel/ link never exposes the numeric video id, but
      // the page's canonical og:url does - use it to build a player that embeds.
      if (video.platform === 'facebook') {
        const fb = resolveFacebookVideo(meta.url || clean) || resolveFacebookVideo(clean)
        if (fb) video = { ...video, ...fb }
        // The extracted mp4 lets the app read the recipe straight off the video's
        // on-screen text (see recognizeVideoFrames); keep it for the scan below.
        if (meta.fileUrl) video = { ...video, fileUrl: meta.fileUrl }
      }
    }
  }

  // TikTok/Instagram/Facebook never expose a scrapable recipe page, and the public
  // relays are blocked or bot-walled for them — so skip the slow page fetch and
  // build straight from the caption the oEmbed handed back.
  const captionOnly = Boolean(video && ['tiktok', 'instagram', 'facebook'].includes(video.platform))

  let parsed = null
  let via = ''
  let capture = { html: '', text: '', oembed }

  if (!captionOnly) {
    try {
      const page = await fetchPage(clean, { settings, signal, onProgress })
      via = page.via
      onProgress?.('Reading the recipe…')
      if (page.kind === 'html') {
        capture.html = page.body
        parsed = parseHtmlRecipe(page.body, clean)
        if (!parsed.ok) {
          const asText = parseTextRecipe(stripToText(page.body), clean)
          if (asText.ok) {
            parsed = { ...asText, raw: { ...parsed.raw, ...asText.raw, image: parsed.raw.image, title: parsed.raw.title || asText.raw.title } }
          }
        }
      } else {
        const text = markdownToText(page.body)
        capture.text = text
        parsed = parseTextRecipe(text, clean)
      }
    } catch (err) {
      warnings.push(err?.message || 'The page could not be fetched.')
    }
  }

  // Video platforms usually refuse scraping; fall back to whatever oEmbed gave us.
  if ((!parsed || !parsed.ok) && oembed) {
    const fromCaption = parseTextRecipe(caption, clean)
    parsed = {
      raw: {
        title: cleanCaptionTitle(oembed.title) || fromCaption.raw.title || `${video?.label || 'Video'} recipe`,
        description: '',
        ingredients: fromCaption.raw.ingredients,
        instructions: fromCaption.raw.instructions,
        keywords: fromCaption.raw.keywords,
        image: '',
        author: oembed.author || '',
        siteName: oembed.providerName || hostnameOf(clean),
        prepTime: fromCaption.raw.prepTime,
        cookTime: fromCaption.raw.cookTime,
        totalTime: fromCaption.raw.totalTime,
        temperature: fromCaption.raw.temperature
      },
      method: 'video oEmbed',
      confidence: 'low',
      ok: fromCaption.ok
    }
    capture.text = capture.text || caption || oembed.title || ''
  }

  if (!parsed) {
    parsed = {
      raw: { title: '', ingredients: [], instructions: [], siteName: hostnameOf(clean) },
      method: 'link only',
      confidence: 'low',
      ok: false
    }
  }

  // The scan-only mp4 URL is signed and expires within hours, so keep it out of
  // the saved record (it would be a dead link later) - it rides along on the
  // returned `video` for an immediate in-session scan instead.
  const storedVideo = video ? (({ fileUrl, ...rest }) => rest)(video) : null

  const built = buildRecipe(parsed, {
    sourceUrl: clean,
    method: parsed.method,
    via,
    video: storedVideo,
    capture
  })

  if (!built.recipe.title || built.recipe.title === 'Untitled recipe') {
    built.recipe.title = oembed?.title ? cleanCaptionTitle(oembed.title) : `Recipe from ${hostnameOf(clean) || 'the web'}`
  }

  onProgress?.('Saving a picture…')
  const imageSource = parsed.raw?.image || oembed?.thumbnail || video?.thumbnail || ''
  if (imageSource) {
    const dataUrl = await cacheImage(imageSource, { settings, signal })
    built.recipe.image = dataUrl || imageSource
  }

  let needsPaste = !built.recipe.ingredients.length && !built.recipe.steps.length

  // A social caption is sometimes just a blurb ("Tastes like childhood" + a few
  // hashtags) with the real recipe only spoken in the video. That yields a stray
  // non-ingredient line rather than a recipe, so if nothing here looks cookable -
  // no steps, no section, no measured ingredient, and not a single digit in the
  // caption - keep the saved video but ask for the real text.
  if (!needsPaste && captionOnly && parsed?.method === 'video oEmbed') {
    const structured =
      built.recipe.steps.length > 0 ||
      built.recipe.ingredients.some((i) => i && (i.section || i.quantity != null || i.unit)) ||
      /\d/.test(caption)
    if (!structured) needsPaste = true
  }

  if (needsPaste) {
    warnings.push(
      video
        ? `${video.label} does not hand out the recipe text. The video is saved and playable — paste the caption or spoken steps below and they will be cleaned up for you.`
        : 'No recipe text was found on that page. Paste it below and it will be cleaned up for you.'
    )
  }

  return { ...built, video, oembed, warnings, needsPaste, via, caption }
}

function cleanCaptionTitle(caption) {
  if (!caption) return ''
  const firstLine = String(caption).split(/\r?\n/)[0].replace(/#\w+/g, '').trim()
  return firstLine.length > 80 ? firstLine.slice(0, 77).trim() + '…' : firstLine
}

function stripToText(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('script,style,nav,header,footer,aside,form,noscript').forEach((el) => el.remove())
    return (doc.body?.innerText || doc.body?.textContent || '').trim()
  } catch {
    return ''
  }
}

/** Builds a recipe from text the user pasted in, with no network at all. */
export function importFromText(text, { sourceUrl = '', video = null } = {}) {
  const parsed = parseTextRecipe(text, sourceUrl)
  return buildRecipe(parsed, {
    sourceUrl,
    method: parsed.method,
    via: 'pasted',
    video: video || (sourceUrl ? detectVideo(sourceUrl) : null),
    capture: { text }
  })
}

/** An empty recipe for writing one out by hand. */
export function blankRecipe() {
  const now = Date.now()
  return {
    ...normalizeRecipe({ title: '' }),
    id: newId(),
    title: '',
    createdAt: now,
    updatedAt: now,
    source: { url: '', siteName: '', author: '', method: 'written by hand', importedAt: now, confidence: 'high' }
  }
}
