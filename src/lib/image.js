/* Turning a picture into something the library can keep.

   Photos are stored inline as data URLs rather than as links. A link to a
   post or a cloud drive rots — permissions change, hosts block hotlinking,
   and none of it works on a plane. A downscaled JPEG costs a couple hundred
   KB and is still there in five years. */

const MAX_DIM = 1600
const QUALITY = 0.82

/** Downscales a blob and returns a data URL, or null if it isn't a usable image. */
export async function toStoredImage(blob, { max = MAX_DIM, quality = QUALITY } = {}) {
  if (!blob || (blob.type && !blob.type.startsWith('image/'))) return null
  try {
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return null
  }
}

/**
 * Finds an image in a paste or a drop.
 * Screenshots arrive as a file with no name; phones paste real files. Both
 * show up in `items`, so prefer that and fall back to `files`.
 */
export function imageFromTransfer(dataTransfer) {
  if (!dataTransfer) return null
  for (const item of dataTransfer.items || []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  for (const file of dataTransfer.files || []) {
    if (file.type.startsWith('image/')) return file
  }
  return null
}

/** Rough byte size of a data URL, for showing what a photo costs. */
export function dataUrlBytes(dataUrl) {
  if (!dataUrl?.startsWith('data:')) return 0
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.round((b64.length * 3) / 4)
}

/**
 * Tries to keep a permanent copy of a remote image.
 * Returns null whenever the host won't hand over the bytes — which, from a page
 * opened as a file, is every host, since the request carries a null origin. The
 * caller must fall back to pointing at the link rather than treating this as the
 * only path; an <img> still renders what fetch cannot read.
 */
export async function fetchAsStoredImage(url, { timeoutMs = 8000, ...opts } = {}) {
  try {
    const res = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) return null
    return await toStoredImage(await res.blob(), opts)
  } catch {
    return null
  }
}
