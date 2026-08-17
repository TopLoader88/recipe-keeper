/* Share links from cloud drives.

   These hosts hand out a link to a *viewer page*, not to the file. A viewer page
   can't go in an <img> or a <video>, so each host gets its URL rewritten into the
   direct-content or preview form it publishes for embedding.

   Nothing here fetches anything. A page opened from file:// has a null origin, so
   every cross-origin fetch fails — but the browser still loads <img> and <iframe>
   sources normally, and that is all these transforms need. It also means the app
   cannot tell a private file from a public one in advance; it renders the URL and
   reports what the element's error event says.

   Only "anyone with the link" files can work. Signed-in access needs OAuth, and
   OAuth needs a registered http(s) redirect URI, which a local file will never have. */

const DRIVE_ID = [
  /drive\.google\.com\/file\/d\/([\w-]{10,})/i,
  /drive\.google\.com\/open\?id=([\w-]{10,})/i,
  /drive\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]{10,})/i,
  /drive\.google\.com\/thumbnail\?(?:[^#]*&)?id=([\w-]{10,})/i,
  /docs\.google\.com\/\w+\/d\/([\w-]{10,})/i
]

/** base64url, the encoding OneDrive's share API expects after the `u!` marker. */
function b64url(str) {
  let bin = ''
  for (const byte of new TextEncoder().encode(str)) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Rewrites a cloud share link into something that renders.
 * @returns {null|{host:string,label:string,imageUrl:string,embedUrl:string|null,
 *                 aspect:string,url:string,note:string,private:boolean}}
 */
export function detectShareLink(url) {
  const input = String(url || '').trim()
  if (!/^https?:\/\//i.test(input)) return null

  for (const re of DRIVE_ID) {
    const m = input.match(re)
    if (m) {
      const id = m[1]
      return {
        host: 'google-drive',
        label: 'Google Drive',
        // sz asks for a rendered thumbnail, which Drive serves for images *and*
        // for the first frame of a video — so one URL covers both.
        imageUrl: `https://drive.google.com/thumbnail?id=${id}&sz=w1600`,
        fileUrl: '',
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        aspect: '16 / 9',
        url: input,
        note: 'Drive only serves this to everyone if the file is shared as "Anyone with the link".',
        private: false
      }
    }
  }

  // Personal OneDrive. The short 1drv.ms form and the long onedrive.live.com form
  // both resolve through the same public shares endpoint once base64url-encoded.
  // That endpoint returns the file itself, so it suits <img> and <video> directly —
  // there is no anonymous iframe form derivable from the link alone.
  if (/^https?:\/\/(1drv\.ms|onedrive\.live\.com)\//i.test(input)) {
    const content = `https://api.onedrive.com/v1.0/shares/u!${b64url(input)}/root/content`
    return {
      host: 'onedrive',
      label: 'OneDrive',
      imageUrl: content,
      fileUrl: content,
      embedUrl: null,
      aspect: '16 / 9',
      url: input,
      note: 'OneDrive only serves this to everyone if the link is set to "Anyone with the link".',
      private: false
    }
  }

  // Work and school OneDrive. These are tenant-gated; the content endpoint above
  // answers 401 and there is no anonymous form, so say so instead of failing later.
  if (/\.sharepoint\.com\//i.test(input)) {
    return {
      host: 'sharepoint',
      label: 'OneDrive for work or school',
      imageUrl: '',
      fileUrl: '',
      embedUrl: null,
      aspect: '16 / 9',
      url: input,
      note: 'Work and school files always need a sign-in, which this app has no way to do. Download the photo and attach it instead.',
      private: true
    }
  }

  if (/^https?:\/\/(www\.)?dropbox\.com\//i.test(input)) {
    // dl=0 opens the viewer page; raw=1 serves the bytes. Rewrite through URL so a
    // link carrying other parameters doesn't come out malformed.
    let direct = input
    try {
      const u = new URL(input)
      u.searchParams.delete('dl')
      u.searchParams.set('raw', '1')
      direct = u.toString()
    } catch { /* keep the original if it won't parse */ }
    return {
      host: 'dropbox',
      label: 'Dropbox',
      imageUrl: direct,
      fileUrl: direct,
      embedUrl: null,
      aspect: '16 / 9',
      url: input,
      note: 'Dropbox serves this directly as long as the link sharing is on.',
      private: false
    }
  }

  if (/^https?:\/\/dl\.dropboxusercontent\.com\//i.test(input)) {
    return {
      host: 'dropbox', label: 'Dropbox', imageUrl: input, fileUrl: input, embedUrl: null,
      aspect: '16 / 9', url: input, note: '', private: false
    }
  }

  return null
}

/** True for a link that already points straight at an image file. */
export function looksLikeImageUrl(url) {
  return /^https?:\/\/\S+\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i.test(String(url || '').trim())
}

/**
 * Best URL to put in an <img> for any pasted link.
 * Returns null when the link isn't a picture at all, so the caller can say so
 * rather than rendering a broken frame.
 */
export function imageUrlFor(url) {
  const share = detectShareLink(url)
  if (share) return share.private ? null : share.imageUrl || null
  return looksLikeImageUrl(url) ? String(url).trim() : null
}
