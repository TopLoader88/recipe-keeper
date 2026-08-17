/* Generates the PWA icon set with no image dependencies.
   Pure Node: draws the artwork into an RGBA buffer and encodes a PNG with zlib. */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

/* ---------- minimal PNG encoder ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- artwork, described in 0..1 space ---------- */

const TOP = [244, 168, 54]
const BOTTOM = [212, 74, 34]

function roundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r))
  const cy = Math.max(y0 + r, Math.min(y, y1 - r))
  return Math.hypot(x - cx, y - cy) <= r
}

// A bowl with three curls of steam.
function glyph(x, y) {
  const bowlR = 0.185
  const bowlY = 0.615
  if (y >= bowlY && Math.hypot(x - 0.5, y - bowlY) <= bowlR) return true
  if (roundRect(x, y, 0.255, 0.578, 0.745, 0.628, 0.025)) return true
  if (roundRect(x, y, 0.383, 0.318, 0.427, 0.508, 0.022)) return true
  if (roundRect(x, y, 0.478, 0.268, 0.522, 0.508, 0.022)) return true
  if (roundRect(x, y, 0.573, 0.318, 0.617, 0.508, 0.022)) return true
  return false
}

function render(size, { corner = 0, glyphScale = 1 } = {}) {
  const buf = Buffer.alloc(size * size * 4)
  const SS = 3 // supersample factor for smooth edges
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHits = 0
      let fgHits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size
          const y = (py + (sy + 0.5) / SS) / size
          const inBg = corner > 0 ? roundRect(x, y, 0, 0, 1, 1, corner) : true
          if (!inBg) continue
          bgHits++
          const gx = 0.5 + (x - 0.5) / glyphScale
          const gy = 0.5 + (y - 0.5) / glyphScale
          if (glyph(gx, gy)) fgHits++
        }
      }
      const total = SS * SS
      const bgA = bgHits / total
      const fgA = fgHits / total
      const i = (py * size + px) * 4
      if (bgA === 0) continue
      const t = (py + 0.5) / size
      const base = [
        Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
        Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
        Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t)
      ]
      // Composite white glyph over the gradient.
      const k = Math.min(fgA / Math.max(bgA, 1e-6), 1)
      buf[i] = Math.round(base[0] + (255 - base[0]) * k)
      buf[i + 1] = Math.round(base[1] + (255 - base[1]) * k)
      buf[i + 2] = Math.round(base[2] + (255 - base[2]) * k)
      buf[i + 3] = Math.round(bgA * 255)
    }
  }
  return encodePng(size, size, buf)
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f4a836"/><stop offset="1" stop-color="#d44a22"/>
  </linearGradient></defs>
  <rect width="100" height="100" rx="22" fill="url(#g)"/>
  <g fill="#fff">
    <path d="M31.5 61.5a18.5 18.5 0 0 0 37 0z"/>
    <rect x="25.5" y="57.8" width="49" height="5" rx="2.5"/>
    <rect x="38.3" y="31.8" width="4.4" height="19" rx="2.2"/>
    <rect x="47.8" y="26.8" width="4.4" height="24" rx="2.2"/>
    <rect x="57.3" y="31.8" width="4.4" height="19" rx="2.2"/>
  </g>
</svg>
`

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'icon-192.png'), render(192, { corner: 0.22, glyphScale: 1 }))
writeFileSync(resolve(OUT, 'icon-512.png'), render(512, { corner: 0.22, glyphScale: 1 }))
writeFileSync(resolve(OUT, 'icon-maskable-512.png'), render(512, { corner: 0, glyphScale: 0.72 }))
writeFileSync(resolve(OUT, 'apple-touch-icon.png'), render(180, { corner: 0, glyphScale: 0.86 }))
writeFileSync(resolve(OUT, 'favicon.svg'), FAVICON_SVG)
console.log('icons written to public/icons')
