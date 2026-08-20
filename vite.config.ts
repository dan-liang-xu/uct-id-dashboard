import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// base '/' for local dev; the CI workflow sets VITE_BASE=/<repo-name>/ so the
// GitHub Pages project subpath (https://<user>.github.io/<repo>/) resolves all
// asset, data and PMTiles URLs correctly. For a user/org page or custom domain,
// leave VITE_BASE unset (base '/').
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
