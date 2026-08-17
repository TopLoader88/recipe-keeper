import { chromium } from 'playwright-core'
import { mkdirSync } from 'fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = 'http://localhost:5173'
const OUT = 'D:\\Copilot\\recipe-keeper\\.smoke'

mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

async function shot(name) {
  await page.screenshot({ path: `${OUT}\\${name}.png`, fullPage: true })
  console.log(`  shot: ${name}.png`)
}

console.log('--- 1. Library (empty state) ---')
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => indexedDB.deleteDatabase('recipe-keeper'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)
console.log('  body text:', (await page.textContent('body')).replace(/\s+/g, ' ').slice(0, 160))
await shot('01-library-empty')

console.log('--- 2. Navigate to Import ---')
await page.click('.tabbar button:nth-child(2)')
await page.waitForTimeout(500)
console.log('  hash:', await page.evaluate(() => location.hash))
await shot('02-import')

console.log('--- 3. Paste-import a recipe ---')
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
console.log('  hash after import:', await page.evaluate(() => location.hash))
await shot('03-recipe-view')

console.log('--- 4. Check parsed content ---')
const parsed = await page.evaluate(() => ({
  title: document.querySelector('.topbar h1')?.textContent,
  ingredients: [...document.querySelectorAll('.checklist label span')].map(e => e.textContent.trim()),
  steps: [...document.querySelectorAll('.steps .text')].map(e => e.textContent.trim()),
  meta: [...document.querySelectorAll('.meta-item')].map(e => e.textContent.trim())
}))
console.log(JSON.stringify(parsed, null, 2))

console.log('--- 5. Check an ingredient + a step ---')
const cb = await page.$('.checklist input')
if (cb) { await cb.click(); await page.waitForTimeout(200) }
const st = await page.$('.steps li:not(.group-head)')
if (st) { await st.click(); await page.waitForTimeout(200) }
await shot('04-checked')

console.log('--- 6. Back to library (populated) ---')
await page.click('.tabbar button:nth-child(1)')
await page.waitForTimeout(700)
await shot('05-library-populated')

console.log('--- 7. Settings ---')
await page.click('.tabbar button:nth-child(3)')
await page.waitForTimeout(600)
await shot('06-settings')

console.log('--- 8. Editor ---')
await page.click('.tabbar button:nth-child(1)')
await page.waitForTimeout(500)
await page.click('.recipe-card')
await page.waitForTimeout(700)
await page.click('button:has-text("Edit")')
await page.waitForTimeout(700)
await shot('07-editor')

console.log('\n=== CONSOLE ERRORS ===')
console.log(errors.length ? errors.join('\n') : '(none)')

await browser.close()
