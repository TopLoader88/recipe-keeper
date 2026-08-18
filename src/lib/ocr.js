/* On-device OCR for capturing recipes from a screenshot or photo of a video's
   on-screen text (the way most recipe reels actually present the recipe).

   Tesseract.js is loaded lazily from a CDN so it never bloats the initial app and
   only downloads the recognition engine the first time you scan. After that the
   browser cache serves it, so scanning keeps working offline. */

import { cleanVideoText } from './videotext.js'

let _tessPromise = null

const TESS_VERSION = '5.1.1'
const TESS_SOURCES = [
  `https://cdn.jsdelivr.net/npm/tesseract.js@${TESS_VERSION}/dist/tesseract.min.js`,
  `https://unpkg.com/tesseract.js@${TESS_VERSION}/dist/tesseract.min.js`
]

export function isOcrSupported() {
  return typeof document !== 'undefined' && typeof Worker !== 'undefined'
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load ' + src))
    document.head.appendChild(s)
  })
}

async function getTesseract() {
  if (globalThis.Tesseract) return globalThis.Tesseract
  if (_tessPromise) return _tessPromise
  _tessPromise = (async () => {
    let lastErr
    for (const src of TESS_SOURCES) {
      try {
        await loadScript(src)
        if (globalThis.Tesseract) return globalThis.Tesseract
      } catch (e) { lastErr = e }
    }
    _tessPromise = null
    throw new Error('Could not download the text-recognition engine. This needs an internet connection the first time.')
  })()
  return _tessPromise
}

/* Tesseract is much more accurate on larger, high-contrast images. Upscale small
   screenshots and hand back a canvas; on any failure fall back to the raw file. */
async function toRecognizable(file) {
  try {
    const bmp = await createImageBitmap(file)
    const minW = 1100
    const scale = bmp.width >= minW ? 1 : Math.min(3, minW / bmp.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    if (bmp.close) bmp.close()
    return canvas
  } catch {
    return file
  }
}

async function makeWorker(onProgress) {
  const Tesseract = await getTesseract()
  return Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m && m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress(m.progress)
      }
    }
  })
}

/* Recognize text from one or more image files/blobs.
   onProgress(fraction 0..1, label). Returns combined text (blank line between images). */
export async function recognizeImages(files, onProgress = () => {}) {
  const list = Array.from(files || []).filter(Boolean)
  if (!list.length) return ''
  onProgress(0.03, 'Loading the text-recognition engine…')
  const worker = await makeWorker((p) => onProgress(0.1 + p * 0.88, 'Reading the text…'))
  try {
    const chunks = []
    for (let i = 0; i < list.length; i++) {
      const label = list.length > 1 ? `Reading image ${i + 1} of ${list.length}…` : 'Reading the text…'
      onProgress(0.1, label)
      const img = await toRecognizable(list[i])
      const { data } = await worker.recognize(img)
      const t = data && data.text ? data.text.trim() : ''
      if (t) chunks.push(t)
    }
    onProgress(1, 'Done')
    return chunks.join('\n\n')
  } finally {
    try { await worker.terminate() } catch {}
  }
}

/* Read the recipe straight off a video's burned-in caption text by sampling a
   frame roughly every second, boosting contrast, OCR-ing each, then cleaning the
   noisy multi-frame text into a de-duplicated draft (see videotext.js).

   This only works when the browser can actually read the video's pixels, i.e. the
   file is same-origin or served with permissive CORS (e.g. Facebook's extracted
   mp4, which is Access-Control-Allow-Origin: *). Platform iframe embeds
   (TikTok/Instagram) hand out no readable file, so their frames are tainted and we
   throw a friendly "take a screenshot instead" message. */
export async function recognizeVideoFrames(videoUrl, onProgress = () => {}) {
  if (!videoUrl) throw new Error('No video to scan.')
  const TAINTED = 'This video is protected, so its frames cannot be read. Take a screenshot of the recipe text and use “From photo”.'
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = videoUrl

  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('The video took too long to load.')), 25000)
    video.onloadedmetadata = () => { clearTimeout(to); resolve() }
    video.onerror = () => { clearTimeout(to); reject(new Error('That video could not be loaded for scanning. Take a screenshot of the recipe text and use “From photo”.')) }
  })

  const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0
  const count = duration ? Math.min(24, Math.max(6, Math.round(duration))) : 6
  const vw = video.videoWidth || 720
  const vh = video.videoHeight || 1280
  const canvas = document.createElement('canvas')
  canvas.width = vw
  canvas.height = vh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const worker = await makeWorker(() => {})
  const frames = []
  try {
    for (let i = 0; i < count; i++) {
      const t = duration ? (duration * (i + 0.5)) / count : 0
      onProgress(0.05 + (i / count) * 0.9, `Reading the video… frame ${i + 1} of ${count}`)
      await seekTo(video, t)
      ctx.drawImage(video, 0, 0, vw, vh)
      try {
        const img = ctx.getImageData(0, 0, vw, vh)
        const d = img.data
        for (let j = 0; j < d.length; j += 4) {
          let g = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]
          g = (g - 128) * 1.7 + 140
          d[j] = d[j + 1] = d[j + 2] = g < 0 ? 0 : g > 255 ? 255 : g
        }
        ctx.putImageData(img, 0, 0)
      } catch (e) {
        throw new Error(TAINTED)
      }
      let data
      try {
        const res = await worker.recognize(canvas)
        data = res.data
      } catch (e) {
        throw new Error(TAINTED)
      }
      const text = data && data.text ? data.text.trim() : ''
      if (text) frames.push(text)
    }
    onProgress(0.98, 'Cleaning up the text…')
    const draft = cleanVideoText(frames)
    onProgress(1, 'Done')
    return draft
  } finally {
    try { await worker.terminate() } catch {}
    video.removeAttribute('src')
    video.load()
  }
}

function seekTo(video, time) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('Seeking timed out.')), 8000)
    const onSeeked = () => { clearTimeout(to); video.removeEventListener('seeked', onSeeked); resolve() }
    video.addEventListener('seeked', onSeeked)
    try { video.currentTime = Math.max(0, time) } catch { clearTimeout(to); resolve() }
  })
}
