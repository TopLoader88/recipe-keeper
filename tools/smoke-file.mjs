import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'
import { pathToFileURL } from 'url'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const FILE = pathToFileURL('D:\\Copilot\\recipe-keeper\\standalone\\index.html').href
const OUT = 'D:\\Copilot\\recipe-keeper\\.smoke'

mkdirSync(OUT, { recursive: true })
console.log('opening:', FILE, '\n')

const errors = []
// No flags: exactly what a double-click from Explorer gives you.
const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

const shot = (n) => page.screenshot({ path: `${OUT}\\file-${n}.png`, fullPage: true })

console.log('--- 1. Does it render at all? ---')
await page.goto(FILE)
await page.waitForTimeout(1200)
console.log('  body:', (await page.textContent('body')).replace(/\s+/g, ' ').slice(0, 120))
await shot('01-render')

console.log('\n--- 2. Is IndexedDB usable on file://? ---')
const idb = await page.evaluate(async () => {
  if (!('indexedDB' in window) || !indexedDB) return { ok: false, why: 'indexedDB absent' }
  try {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('__probe', 1)
      r.onupgradeneeded = () => r.result.createObjectStore('s')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error || new Error('open failed'))
      r.onblocked = () => rej(new Error('blocked'))
      setTimeout(() => rej(new Error('timeout — silently blocked')), 3000)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction('s', 'readwrite')
      tx.objectStore('s').put({ hi: 'there' }, 'k')
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
    })
    const got = await new Promise((res, rej) => {
      const r = db.transaction('s').objectStore('s').get('k')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    db.close()
    indexedDB.deleteDatabase('__probe')
    return { ok: got?.hi === 'there', roundTripped: got }
  } catch (e) {
    return { ok: false, why: String(e && e.message || e) }
  }
})
console.log(' ', JSON.stringify(idb))
if (!idb.ok) {
  console.log('\n  IndexedDB unavailable on file:// — stopping.')
  console.log('=== CONSOLE ERRORS ===\n' + (errors.join('\n') || '(none)'))
  await browser.close()
  process.exit(1)
}

console.log('\n--- 3. Save a recipe through the real UI ---')
await page.click('.tabbar button:nth-child(2)')
await page.waitForTimeout(400)
await page.click('.tabs button:nth-child(2)')
await page.waitForTimeout(300)
await page.fill('textarea', `Garlic Butter Pasta

Ingredients:
8 oz spaghetti
4 tbsp butter
6 cloves garlic, minced
1/2 cup parmesan, grated
1 tsp salt

Instructions:
1. Boil the pasta in salted water for 9 minutes until al dente.
2. Melt butter in a pan over medium heat and add garlic.
3. Cook garlic for 2 minutes until fragrant.
4. Toss pasta with the garlic butter and parmesan.
5. Season with salt and serve immediately.`)
await page.click('button[type="submit"]')
await page.waitForTimeout(1500)
console.log('  hash:', await page.evaluate(() => location.hash))
console.log('  parsed:', JSON.stringify(await page.evaluate(() => ({
  title: document.querySelector('.recipe-title, .topbar h1')?.textContent,
  ingredients: [...document.querySelectorAll('.checklist label span')].map(e => e.textContent.trim()),
  steps: [...document.querySelectorAll('.steps .text')].length
})), null, 2))
await shot('02-recipe')

console.log('\n--- 4. Does it survive a reload? (the whole point of a local app) ---')
await page.goto(FILE)
await page.waitForTimeout(1200)
const survived = await page.evaluate(() =>
  [...document.querySelectorAll('.recipe-card .name')].map(e => e.textContent.trim()))
console.log('  library after reload:', JSON.stringify(survived))
await shot('03-after-reload')

console.log('\n--- 5. Deep link into the saved recipe by hash ---')
const id = await page.evaluate(() => {
  document.querySelector('.recipe-card .name')?.click()
  return null
})
await page.waitForTimeout(700)
console.log('  hash:', await page.evaluate(() => location.hash))
console.log('  title:', await page.textContent('.recipe-title').catch(() => '(none)'))
await shot('04-deeplink')

console.log('\n=== CONSOLE ERRORS ===')
console.log(errors.length ? errors.join('\n') : '(none)')
await browser.close()
