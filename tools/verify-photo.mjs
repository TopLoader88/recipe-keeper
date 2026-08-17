/* Verifies the photo field and the video link field end to end, on file://.
   Covers: pick a file, paste a screenshot, drop, remove, persist across reload,
   and the storage-persistence request that now fires on the first save. */
import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const FILE = 'file:///D:/Copilot/recipe-keeper/standalone/index.html'
const ok = (c) => (c ? 'PASS' : 'FAIL')

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await b.newPage({ viewport: { width: 430, height: 932 } })
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
page.on('dialog', () => errs.push('NATIVE DIALOG FIRED'))

await page.goto(FILE)
await page.waitForTimeout(600)

// A big, obviously-coloured source image so downscaling is measurable.
const bigPng = await page.evaluate(async () => {
  const c = document.createElement('canvas')
  c.width = 2400; c.height = 1600
  const g = c.getContext('2d')
  g.fillStyle = '#e8734a'; g.fillRect(0, 0, 2400, 1600)
  g.fillStyle = '#111'; g.fillRect(200, 200, 900, 700)
  return c.toDataURL('image/png')
})
const buffer = Buffer.from(bigPng.split(',')[1], 'base64')
console.log(`source image: 2400x1600 PNG, ${Math.round(buffer.length / 1024)} KB`)

async function newRecipe() {
  await page.goto(FILE)
  await page.waitForTimeout(500)
  await page.click('a[href="#/new"], button:has-text("New")').catch(async () => {
    await page.evaluate(() => { location.hash = '#/new' })
  })
  await page.waitForTimeout(400)
  if (!/#\/new/.test(await page.evaluate(() => location.hash))) {
    await page.evaluate(() => { location.hash = '#/new' })
    await page.waitForTimeout(400)
  }
}

/* --- 1. pick a photo from the device --- */
await newRecipe()
console.log('\n1. choose photo')
console.log('   drop well visible:', ok(await page.isVisible('.photo-drop')))
await page.setInputFiles('input[type="file"][accept="image/*"]', {
  name: 'screenshot.png', mimeType: 'image/png', buffer
})
await page.waitForSelector('.photo-preview img', { timeout: 5000 })
let shot = await page.evaluate(() => {
  const img = document.querySelector('.photo-preview img')
  return { src: img.src.slice(0, 23), w: img.naturalWidth, h: img.naturalHeight, size: document.querySelector('.photo-preview .size')?.textContent }
})
console.log('   stored as jpeg data url:', ok(shot.src === 'data:image/jpeg;base64,'), shot.src)
console.log('   downscaled to <=1600px:', ok(Math.max(shot.w, shot.h) <= 1600), `${shot.w}x${shot.h}`)
console.log('   size shown:', shot.size)

/* --- 2. remove --- */
console.log('\n2. remove')
await page.click('.photo-preview .remove')
await page.waitForTimeout(200)
console.log('   back to empty well:', ok(await page.isVisible('.photo-drop')))

/* --- 3. paste a screenshot (Ctrl+V) --- */
console.log('\n3. paste')
await page.evaluate(async () => {
  const c = document.createElement('canvas')
  c.width = 1200; c.height = 900
  const g = c.getContext('2d')
  g.fillStyle = '#5cb270'; g.fillRect(0, 0, 1200, 900)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const dt = new DataTransfer()
  dt.items.add(new File([blob], 'paste.png', { type: 'image/png' }))
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
})
await page.waitForSelector('.photo-preview img', { timeout: 5000 })
shot = await page.evaluate(() => {
  const img = document.querySelector('.photo-preview img')
  return { w: img.naturalWidth, h: img.naturalHeight }
})
console.log('   pasted image accepted:', ok(shot.w > 0), `${shot.w}x${shot.h}`)

/* --- 4. text paste must still reach the textarea --- */
console.log('\n4. text paste not hijacked')
await page.focus('.textarea.mono')
await page.evaluate(() => {
  const dt = new DataTransfer()
  dt.setData('text/plain', '1 cup flour')
  document.querySelector('.textarea.mono').dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
  )
})
await page.waitForTimeout(150)
console.log('   photo unchanged by a text paste:', ok(await page.isVisible('.photo-preview img')))

/* --- 5. video link detection --- */
console.log('\n5. video link')
const cases = [
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'ok'],
  ['https://www.tiktok.com/@user/video/7123456789012345678', 'ok'],
  ['https://vm.tiktok.com/ZMabcdef/', 'unresolved'],
  ['https://example.com/some-post', 'plain']
]
for (const [url, want] of cases) {
  await page.fill('input[type="url"]', url)
  await page.waitForTimeout(120)
  const hint = (await page.textContent('input[type="url"] + .hint, input[type="url"] ~ .hint')) || ''
  const isOk = await page.isVisible('.hint.ok')
  const got = isOk ? 'ok' : /short share link/.test(hint) ? 'unresolved' : /plain link/.test(hint) ? 'plain' : '?'
  console.log(`   ${ok(got === want)} ${new URL(url).hostname} -> ${got.padEnd(10)} "${hint.trim().slice(0, 46)}"`)
}

/* --- 6. save, reload, check it survived --- */
console.log('\n6. persistence')
await page.fill('input[type="url"]', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
await page.fill('.input', 'Photo test recipe')
await page.click('button[type="submit"]')
await page.waitForTimeout(700)
const persisted = await page.evaluate(() => navigator.storage.persisted())
console.log('   storage persisted after first save:', persisted, '(file:// never grants this — expected false)')

await page.reload()
await page.waitForTimeout(900)
const after = await page.evaluate(() => ({
  hash: location.hash,
  hero: !!document.querySelector('.media img'),
  heroIsData: (document.querySelector('.media img')?.src || '').startsWith('data:'),
  title: document.querySelector('.recipe-title')?.textContent
}))
console.log('   recipe reopened:', after.title)
console.log('   photo survived reload:', ok(after.hero && after.heroIsData))

// The video sits behind its own chip so a third-party iframe never loads unasked.
await page.click('.media-switch .chip:has-text("Video")')
await page.waitForTimeout(400)
const frame = await page.evaluate(() => document.querySelector('.media iframe')?.src || '')
console.log('   video embed after switching tab:', ok(frame.includes('youtube')), frame.slice(0, 46))

// The card in the library should show the same photo.
await page.evaluate(() => { location.hash = '#/' })
await page.waitForTimeout(500)
const card = await page.evaluate(() => (document.querySelector('.recipe-card img')?.src || '').slice(0, 22))
console.log('   library card thumbnail:', ok(card.startsWith('data:image')), card)

console.log('\nerrors:', errs.length ? errs.join('\n') : '(none)')
await b.close()
