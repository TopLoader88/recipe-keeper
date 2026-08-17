/* Attaches to the already-open window and reports what's on screen. */
import { chromium } from 'playwright-core'

const b = await chromium.connectOverCDP('http://localhost:9222')
const page = b.contexts()[0].pages()[0]

console.log('url:  ', page.url())
console.log('hash: ', await page.evaluate(() => location.hash || '(none)'))
console.log('recipes in library:', JSON.stringify(
  await page.evaluate(() => [...document.querySelectorAll('.recipe-card .name')].map((e) => e.textContent.trim()))))
console.log('storage:', JSON.stringify(await page.evaluate(async () => {
  const e = await navigator.storage.estimate()
  return { usedKB: Math.round(e.usage / 1024), persisted: await navigator.storage.persisted() }
})))

await page.screenshot({ path: 'D:/Copilot/recipe-keeper/.smoke/live-01.png' })
await b.close() // detaches only; the window stays open
