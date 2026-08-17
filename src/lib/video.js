/* Recognises video links and works out how to play them inside the app. */

import { detectShareLink } from './share-links.js'

const PLATFORMS = [
  {
    id: 'youtube',
    label: 'YouTube',
    match: /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
    embed: (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`,
    oembed: (url) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    aspect: '16 / 9'
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    match: /tiktok\.com\/(?:@[\w.-]+\/video\/|v\/|embed\/v2\/)(\d{6,})/i,
    embed: (id) => `https://www.tiktok.com/embed/v2/${id}`,
    oembed: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
    aspect: '9 / 16'
  },
  {
    id: 'instagram',
    label: 'Instagram',
    match: /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i,
    embed: (id) => `https://www.instagram.com/reel/${id}/embed/`,
    aspect: '9 / 16'
  },
  {
    id: 'vimeo',
    label: 'Vimeo',
    match: /vimeo\.com\/(?:video\/)?(\d+)/i,
    embed: (id) => `https://player.vimeo.com/video/${id}`,
    oembed: (url) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
    aspect: '16 / 9'
  },
  {
    id: 'facebook',
    label: 'Facebook',
    match: /(?:facebook\.com\/(?:[\w.-]+\/videos\/|watch\/?\?v=|reel\/)(\d+)|fb\.watch\/([\w-]+))/i,
    embed: (id, url) => `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`,
    aspect: '9 / 16'
  },
  {
    id: 'x',
    label: 'X / Twitter',
    match: /(?:twitter|x)\.com\/[\w.-]+\/status\/(\d+)/i,
    embed: (id) => `https://platform.twitter.com/embed/Tweet.html?id=${id}`,
    aspect: '16 / 9'
  },
  {
    id: 'dailymotion',
    label: 'Dailymotion',
    match: /dailymotion\.com\/video\/([A-Za-z0-9]+)/i,
    embed: (id) => `https://www.dailymotion.com/embed/video/${id}`,
    aspect: '16 / 9'
  }
]

/** TikTok/Instagram share sheets hand out short links that hide the real id. */
const SHORT_LINKS = [
  /vm\.tiktok\.com\/[\w-]+/i,
  /vt\.tiktok\.com\/[\w-]+/i,
  /tiktok\.com\/t\/[\w-]+/i,
  /youtu\.be\/[\w-]+/i,
  /fb\.watch\/[\w-]+/i,
  /pin\.it\/[\w-]+/i
]

const DIRECT_FILE = /\.(mp4|webm|ogv|m4v|mov)(\?|#|$)/i

export function isShortLink(url) {
  return SHORT_LINKS.some((re) => re.test(String(url || '')))
}

/**
 * @returns {{platform,label,videoId,embedUrl,url,aspect,kind}|null}
 */
export function detectVideo(url) {
  const input = String(url || '').trim()
  if (!input) return null

  if (DIRECT_FILE.test(input)) {
    return { platform: 'file', label: 'Video file', videoId: null, embedUrl: input, url: input, aspect: '16 / 9', kind: 'file' }
  }

  /* A cloud share link can hold a video just as easily as a photo, and the same
     rewrite serves both. Checked before the platform list because a Drive link
     matches none of those patterns anyway, and after DIRECT_FILE so a plain .mp4
     on Dropbox still plays in a <video> rather than going the long way round. */
  const share = detectShareLink(input)
  if (share && !share.private && (share.embedUrl || share.fileUrl)) {
    return {
      platform: share.host,
      label: share.label,
      videoId: null,
      embedUrl: share.embedUrl || share.fileUrl,
      url: input,
      aspect: share.aspect,
      kind: share.embedUrl ? 'iframe' : 'file'
    }
  }

  for (const p of PLATFORMS) {
    const m = input.match(p.match)
    if (m) {
      const id = m[1] || m[2]
      return {
        platform: p.id,
        label: p.label,
        videoId: id,
        embedUrl: p.embed(id, input),
        url: input,
        aspect: p.aspect,
        kind: 'iframe'
      }
    }
  }

  if (isShortLink(input)) {
    const guess = /tiktok/i.test(input) ? 'tiktok' : /youtu/i.test(input) ? 'youtube' : /fb\.watch/i.test(input) ? 'facebook' : 'unknown'
    return {
      platform: guess,
      label: guess === 'unknown' ? 'Video' : PLATFORMS.find((p) => p.id === guess)?.label || 'Video',
      videoId: null,
      embedUrl: null,
      url: input,
      aspect: guess === 'youtube' ? '16 / 9' : '9 / 16',
      kind: 'unresolved'
    }
  }

  return null
}

export function platformOEmbed(url) {
  for (const p of PLATFORMS) {
    if (p.oembed && (p.match.test(url) || (p.id === 'tiktok' && /tiktok\.com/i.test(url)) || (p.id === 'youtube' && /youtu/i.test(url)))) {
      return p.oembed(url)
    }
  }
  if (/tiktok\.com/i.test(url)) return `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
  return null
}

/**
 * oEmbed gives a title, author and thumbnail without any scraping, and both
 * TikTok and Vimeo serve it with permissive CORS. Failure is not an error —
 * the caller falls back to pasted text.
 */
export async function fetchOEmbed(url, { signal } = {}) {
  const endpoint = platformOEmbed(url)
  if (!endpoint) return null
  try {
    const res = await fetch(endpoint, { signal, mode: 'cors', credentials: 'omit' })
    if (!res.ok) return null
    const data = await res.json()
    return {
      title: data.title || '',
      author: data.author_name || '',
      thumbnail: data.thumbnail_url || '',
      html: data.html || '',
      embedProductId: data.embed_product_id || '',
      providerName: data.provider_name || ''
    }
  } catch {
    return null
  }
}

/** Pulls a canonical video id out of an oEmbed response for short links. */
export function resolveFromOEmbed(shortUrl, oembed) {
  if (!oembed) return null
  const haystack = `${oembed.html || ''} ${oembed.thumbnail || ''}`
  const tiktokId = haystack.match(/(?:video-id=["']|\/video\/)(\d{6,})/)
  if (tiktokId) {
    return {
      platform: 'tiktok',
      label: 'TikTok',
      videoId: tiktokId[1],
      embedUrl: `https://www.tiktok.com/embed/v2/${tiktokId[1]}`,
      url: shortUrl,
      aspect: '9 / 16',
      kind: 'iframe'
    }
  }
  const ytId = haystack.match(/(?:embed\/|vi\/)([A-Za-z0-9_-]{6,})/)
  if (ytId) {
    return {
      platform: 'youtube',
      label: 'YouTube',
      videoId: ytId[1],
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId[1]}?rel=0&playsinline=1`,
      url: shortUrl,
      aspect: '16 / 9',
      kind: 'iframe'
    }
  }
  return null
}

export const VIDEO_PLATFORMS = PLATFORMS.map((p) => ({ id: p.id, label: p.label }))
