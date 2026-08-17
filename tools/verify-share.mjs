/* Checks the cloud share-link rewrites and the photo-link UI on file://.
   The transforms are asserted exactly; the live render is only asserted for the
   negative case, since a real "anyone with the link" file is needed for the rest. */
import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const FILE = 'file:///D:/Copilot/recipe-keeper/standalone/index.html'
const ok = (c) => (c ? 'PASS' : 'FAIL')

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await b.newPage({ viewport: { width: 430, height: 932 } })
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
await page.goto(FILE)
await page.waitForTimeout(600)

/* --- 1. the rewrites, through the live app --- */
console.log('1. link rewrites')
const LINKS = [
  ['https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view?usp=sharing', 'google-drive'],
  ['https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQr', 'google-drive'],
  ['https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQr/edit', 'google-drive'],
  ['https://1drv.ms/i/s!AjkLmNoPqRsTuVw', 'onedrive'],
  ['https://onedrive.live.com/?cid=ABC&id=ABC%21123', 'onedrive'],
  ['https://contoso-my.sharepoint.com/:i:/g/personal/me/EabcXYZ', 'sharepoint'],
  ['https://www.dropbox.com/s/abc123/pasta.jpg?dl=0', 'dropbox'],
  ['https://www.dropbox.com/s/abc123/pasta.jpg?dl=0&rlkey=zzz', 'dropbox'],
  ['https://example.com/photo.jpg', null],
  ['https://example.com/not-a-photo', null]
]
for (const [url, wantHost] of LINKS) {
  const r = await page.evaluate(async (u) => {
    const m = await import('./src/lib/share-links.js').catch(() => null)
    return m ? { s: m.detectShareLink(u), img: m.imageUrlFor(u) } : null
  }, url).catch(() => null)
  if (r === null) { console.log('   (module not reachable in the bundle — using the UI instead)'); break }
  const host = r.s?.host ?? null
  console.log(`   ${ok(host === wantHost)} ${url.slice(8, 52).padEnd(46)} -> ${String(host).padEnd(13)} ${(r.img || '(no image url)').slice(0, 62)}`)
}

/* --- 2. same thing, but driven through the photo field --- */
console.log('\n2. photo field, link mode')
await page.evaluate(() => { location.hash = '#/new' })
await page.waitForTimeout(500)

async function tryLink(url) {
  if (await page.isVisible('.photo-preview .remove')) {
    await page.click('.photo-preview .remove')
    await page.waitForTimeout(150)
  }
  if (!(await page.isVisible('.photo-drop .link-row'))) {
    await page.click('.photo-drop button:has-text("Use a link")')
    await page.waitForTimeout(150)
  }
  await page.fill('.photo-drop .link-row .input', url)
  await page.click('.photo-drop .link-row .btn:not(.ghost)')
  await page.waitForTimeout(2500)
  return page.evaluate(() => ({
    src: document.querySelector('.photo-preview img')?.src || '',
    hints: [...document.querySelectorAll('.field .hint')].map((e) => e.textContent.trim())
  }))
}

let r = await tryLink('https://contoso-my.sharepoint.com/:i:/g/personal/me/EabcXYZ')
console.log('   work/school link refused up front:', ok(!r.src && /sign-in/.test(r.hints.join(' '))))
console.log('     ->', r.hints.find((h) => /sign-in/.test(h))?.slice(0, 90))

r = await tryLink('https://example.com/definitely-not-a-picture')
console.log('   non-picture link refused:', ok(!r.src && /look like a link/.test(r.hints.join(' '))))

r = await tryLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view?usp=sharing')
console.log('   drive link accepted, rewritten:', ok(r.src.includes('drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQr')))
console.log('     ->', r.src.slice(0, 74))
await page.waitForTimeout(2500)
const broken = await page.evaluate(() => [...document.querySelectorAll('.field .hint')].map((e) => e.textContent.trim()))
console.log('   bad/private file reports itself:', ok(broken.some((h) => /probably not shared/.test(h))))
console.log('     ->', broken.find((h) => /probably not shared/.test(h))?.slice(0, 90))

/* --- 3. a Drive link in the video field --- */
console.log('\n3. drive link as a video')
await page.fill('input[type="url"]:not(.photo-drop .input)', 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view')
await page.waitForTimeout(200)
const vhint = await page.textContent('.hint.ok').catch(() => '')
console.log('   detected as playable:', ok(/Google Drive/.test(vhint || '')), (vhint || '').trim())

console.log('\nerrors:', errs.length ? errs.join('\n') : '(none)')
await b.close()
