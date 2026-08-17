/* Working out what the OS share sheet actually handed us.

   A Web Share Target delivers up to three fields - title, text and url - but the
   sending app decides which one carries the link. Chrome on Android routinely
   drops the page URL into `text` (sometimes alongside a sentence of context), and
   plenty of apps leave `url` empty. So the link can be anywhere, and it can be
   surrounded by other words. Pulling the first http(s) URL out of any field is the
   only reliable way to tell "share a link to import" from "share some recipe text". */

const URL_RE = /https?:\/\/[^\s"'<>]+/i

/** First http(s) URL found in any of the given strings, trimmed of trailing punctuation. */
export function firstUrl(...values) {
  for (const value of values) {
    const match = String(value ?? '').match(URL_RE)
    if (match) return match[0].replace(/[.,;:)]+$/, '')
  }
  return null
}

/**
 * Decides what a share drop means.
 * @returns {null | {url:string} | {text:string}}
 *   {url}  - import this link
 *   {text} - no link anywhere, treat the payload as pasted recipe text
 */
export function interpretShare({ title, text, url } = {}) {
  const link = firstUrl(url, text, title)
  if (link) return { url: link }
  const body = String(text ?? title ?? '').trim()
  return body ? { text: body } : null
}
