import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

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
