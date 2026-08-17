/* Drives the real Import screen against live recipe sites, from file://.
   This is the whole feature end to end: relay -> parse -> normalize -> save. */
import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const FILE = 'file:///D:/Copilot/recipe-keeper/standalone/index.html'
const SITES = [
  'https://www.bbcgoodfood.com/recipes/easy-pancakes',
  'https://www.seriouseats.com/classic-banana-bread-recipe',
  'https://www.allrecipes.com/recipe/16354/easy-meatloaf/'
]

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await b.newPage({ viewport: { width: 430, height: 932 } })
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)) })
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))

for (const site of SITES) {
  console.log(`\n--- ${new URL(site).hostname} ---`)
  await page.goto(FILE)
  await page.waitForTimeout(700)
  await page.click('.tabbar button:nth-child(2)')
  await page.waitForTimeout(300)
  await page.fill('input[type="url"], .input[placeholder*="ttps"], input[type="text"]', site).catch(() => {})
  const t0 = Date.now()
  await page.click('button[type="submit"]')

  // Wait for either the recipe view or an error note.
  let done = false
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000)
    const hash = await page.evaluate(() => location.hash)
    if (/#\/recipe\//.test(hash)) { done = true; break }
    const err = await page.$('.note.error')
    if (err) { console.log('  ERROR:', (await err.textContent()).trim().slice(0, 160)); break }
  }
  if (!done) {
    const prog = await page.$('.progress')
    if (prog) console.log('  still at:', (await prog.textContent()).trim())
    continue
  }

  const r = await page.evaluate(() => ({
    title: document.querySelector('.recipe-title')?.textContent?.trim(),
    ingredients: document.querySelectorAll('.checklist label span').length,
    steps: document.querySelectorAll('.steps .text').length,
    meta: [...document.querySelectorAll('.meta-item')].map((e) => e.textContent.trim()),
    hasImage: !!document.querySelector('.media img.hero, .recipe-card .thumb img'),
    source: document.querySelector('.source-block') ? 'captured' : 'none'
  }))
  console.log(`  ${Math.round((Date.now() - t0) / 1000)}s | ${r.title}`)
  console.log(`  ${r.ingredients} ingredients, ${r.steps} steps, image:${r.hasImage}, meta:[${r.meta.join(', ')}]`)
}

console.log('\nerrors:', errs.length ? errs.join('\n') : '(none)')
await b.close()
