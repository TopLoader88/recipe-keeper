/* Delete now goes through an in-app sheet, so this drives that:
   A — open the sheet and cancel  => recipe survives
   B — open the sheet and confirm => recipe gone from UI and IndexedDB
   Also asserts no native dialog is involved anywhere. */
import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const FILE = 'file:///D:/Copilot/recipe-keeper/standalone/index.html'

const b = await chromium.launch({ executablePath: EDGE, headless: true })
const page = await b.newPage({ viewport: { width: 430, height: 932 } })
const errs = []
let sawDialog = false
page.on('dialog', (d) => { sawDialog = true; d.dismiss() })
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))

const count = () => page.evaluate(() =>
  [...document.querySelectorAll('.recipe-card .name')].map((e) => e.textContent.trim()))

const rows = () => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('recipe-keeper')
  r.onsuccess = () => {
    const c = r.result.transaction('recipes').objectStore('recipes').count()
    c.onsuccess = () => res(c.result)
  }
}))

async function seed(name) {
  await page.goto(FILE)
  await page.waitForTimeout(900)
  await page.click('.tabbar button:nth-child(2)')
  await page.waitForTimeout(300)
  await page.click('.tabs button:nth-child(2)')
  await page.waitForTimeout(200)
  await page.fill('textarea', `${name}\n\nIngredients:\n1 cup flour\n2 eggs\n\nInstructions:\n1. Mix it all together.\n2. Bake for 20 minutes.`)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(1200)
}

console.log('--- A: open the delete sheet, then cancel ---')
await seed('Test Recipe A')
await page.click('.btn-row .btn.danger')
await page.waitForTimeout(400)
console.log('  sheet visible:', await page.isVisible('.sheet[role="alertdialog"]'))
console.log('  prompt:', (await page.textContent('.sheet h2'))?.trim())
await page.click('.sheet .btn:not(.danger)')            // Cancel
await page.waitForTimeout(400)
console.log('  sheet gone:', !(await page.isVisible('.sheet[role="alertdialog"]')))
await page.goto(FILE); await page.waitForTimeout(900)
console.log('  library:', JSON.stringify(await count()), '| rows:', await rows())

console.log('\n--- B: open the delete sheet, then confirm ---')
await page.click('.recipe-card .name')
await page.waitForTimeout(700)
await page.click('.btn-row .btn.danger')
await page.waitForTimeout(400)
await page.click('.sheet .btn.danger')                  // Delete
await page.waitForTimeout(1200)
console.log('  hash:', await page.evaluate(() => location.hash))
await page.goto(FILE); await page.waitForTimeout(1000)
console.log('  library after reload:', JSON.stringify(await count()), '| rows:', await rows())

console.log('\n--- C: Escape closes the sheet without deleting ---')
await seed('Test Recipe C')
await page.click('.btn-row .btn.danger')
await page.waitForTimeout(300)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
console.log('  sheet gone:', !(await page.isVisible('.sheet[role="alertdialog"]')), '| rows:', await rows())

console.log('\n--- D: Settings "delete all" uses the sheet too ---')
await page.click('.tabbar button:nth-child(3)')
await page.waitForTimeout(500)
await page.click('.btn.danger:has-text("Delete all")')
await page.waitForTimeout(400)
console.log('  prompt:', (await page.textContent('.sheet h2'))?.trim())
await page.click('.sheet .btn.danger')
await page.waitForTimeout(1200)
console.log('  rows after clear:', await rows())

console.log('\nnative dialog used anywhere:', sawDialog ? 'YES (bad)' : 'no')
console.log('errors:', errs.length ? errs.join('\n') : '(none)')
await b.close()
