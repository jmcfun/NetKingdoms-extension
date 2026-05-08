import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest.json'
import { resolve } from 'path'
import fs from 'node:fs'
import path from 'node:path'

// Strip the wildcard web_accessible_resources entry injected by crxjs.
// Extension-internal resources (popup, service worker, chunks) are accessible
// via chrome-extension:// without needing web_accessible_resources.
function cleanManifest(): Plugin {
  return {
    name: 'clean-manifest',
    closeBundle() {
      const manifestPath = path.resolve(__dirname, 'dist/manifest.json')
      if (!fs.existsSync(manifestPath)) return
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      if (Array.isArray(m.web_accessible_resources)) {
        m.web_accessible_resources = m.web_accessible_resources.filter(
          (entry: { resources: string[] }) =>
            !entry.resources.some((r) => r === '**/*' || r === '*')
        )
      }
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2))
    },
  }
}

export default defineConfig({
  plugins: [crx({ manifest }), react(), cleanManifest()],
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        onboarding: resolve(__dirname, 'onboarding.html'),
      },
    },
  },
})
