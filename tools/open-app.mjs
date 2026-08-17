/* Opens the standalone app in a real, visible Edge window that stays put.
   The profile lives in the project so recipes survive between launches, and
   the debugging port lets me attach and drive the same window you're seeing. */
import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const FILE = 'file:///D:/Copilot/recipe-keeper/standalone/index.html'
const PROFILE = 'D:/Copilot/recipe-keeper/.browser-profile'

const ctx = await chromium.launchPersistentContext(PROFILE, {
  executablePath: EDGE,
  headless: false,
  viewport: null,
  args: [
    '--remote-debugging-port=9222',
    '--app=' + FILE,       // chromeless window — no tabs, no address bar
    '--window-size=430,932'
  ]
})

const page = ctx.pages()[0] || (await ctx.waitForEvent('page'))
await page.waitForTimeout(1500)
console.log('open:', page.url())
console.log('attach with: chromium.connectOverCDP("http://localhost:9222")')

// Hold the window open until it's closed by hand.
await new Promise((resolve) => ctx.on('close', resolve))
