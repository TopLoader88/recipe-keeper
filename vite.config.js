import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// A build stamp so a running copy can show exactly which version it is - the
// quickest way to confirm an update actually landed. The short commit hash comes
// from the CI checkout (GITHUB_SHA) or local git; it degrades to 'local' offline.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))
function buildSha() {
  try {
    return (process.env.GITHUB_SHA || execSync('git rev-parse HEAD').toString()).trim().slice(0, 7)
  } catch {
    return 'local'
  }
}
const BUILD_STAMP = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __BUILD_SHA__: JSON.stringify(buildSha()),
  __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10))
}

// Two build shapes, both server-free:
//   npm run build       -> dist/        a normal PWA folder (installable, offline)
//   npm run build:file  -> standalone/  one .html you can double-click or email
//
// Relative base so either output runs from a domain root, a subfolder, a USB
// stick, or a synced folder without a rebuild.
// A standalone file has no sibling manifest or icon files to point at, and a
// broken <link> is a console error on every load. Drop them from that build only.
function stripSidecarLinks() {
  return {
    name: 'strip-sidecar-links',
    transformIndexHtml(html) {
      return html.replace(/\s*<link rel="(?:manifest|icon|apple-touch-icon)"[^>]*>/g, '')
    }
  }
}

export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone'
  return {
    base: './',
    define: BUILD_STAMP,
    plugins: [react(), ...(standalone ? [viteSingleFile(), stripSidecarLinks()] : [])],
    server: { host: true, port: 5173 },
    preview: { host: true, port: 4173 },
    build: {
      target: 'es2022',
      outDir: standalone ? 'standalone' : 'dist',
      sourcemap: false,
      // The service worker is meaningless in a single file and its registration
      // throws on file:// — the app is already fully offline once loaded.
      ...(standalone ? { assetsInlineLimit: 100_000_000, cssCodeSplit: false } : {})
    }
  }
})
