import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'node:path'

// Compiles scripts/kit/kit.css (Tailwind + theme) to dist/kit.css. Used by scripts/build-kit.mjs.
export default defineConfig({
  root: path.resolve(import.meta.dirname, '../..'),
  plugins: [tailwindcss()],
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    cssMinify: true,
    rollupOptions: { input: 'scripts/kit/kit.css', output: { assetFileNames: 'kit.[ext]', entryFileNames: 'kit-entry.js' } },
  },
})
