#!/usr/bin/env node
// The data-attribute contract: drive the same interaction in the React story and in the generated snippet + behaviour.js and
// compare the attributes the styles depend on. Needs Storybook running and dist/ built.
import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const sb = (process.argv.find((a) => a.startsWith('--storybook=')) ?? '--storybook=http://localhost:6006').split('=')[1]
const dist = path.resolve(import.meta.dirname, '../../dist')
const types = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.avif': 'image/avif', '.png': 'image/png' }
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); const p = path.join(dist, u.pathname)
  if (u.pathname === '/snippet') { r.setHeader('content-type', 'text/html'); return r.end(`<!doctype html><html><head><meta charset="utf-8"><base href="/html/a/b/"><link rel="stylesheet" href="/kit.css"></head><body>${fs.readFileSync(path.join(dist, u.searchParams.get('f')), 'utf8')}<script src="/behaviour.js"></script></body></html>`) }
  if (fs.existsSync(p) && fs.statSync(p).isFile()) { r.setHeader('content-type', types[path.extname(p)] ?? 'application/octet-stream'); return r.end(fs.readFileSync(p)) }
  r.statusCode = 404; r.end()
}).listen(7778)

const state = (page) => page.evaluate(() => {
  const pick = (e) => [e.getAttribute('role') ?? e.dataset.slot, e.hasAttribute('data-active'), e.hasAttribute('data-hidden'), e.hasAttribute('inert'), e.getAttribute('aria-selected'), e.getAttribute('tabindex')].join('|')
  return [...document.querySelectorAll('[role=tab],[role=tabpanel]')].map(pick)
})
const cases = [
  { name: 'Tabs: PlatformPricing → SASE tab', id: 'cloudflare-organisms-platformpricing--default', file: 'html/Organisms/PlatformPricing/Default.html', act: (p) => p.locator('[role=tab]').nth(1).click() },
  { name: 'Tabs: PlatformPricing → key End', id: 'cloudflare-organisms-platformpricing--default', file: 'html/Organisms/PlatformPricing/Default.html', act: async (p) => { await p.locator('[role=tab]').first().focus(); await p.keyboard.press('End') } },
]
const browser = await chromium.launch(); let bad = 0
for (const c of cases) {
  const a = await browser.newPage({ viewport: { width: 1440, height: 900 } }), b = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await a.goto(`${sb}/iframe.html?id=${c.id}&viewMode=story`); await a.waitForSelector('[role=tab]'); await a.waitForTimeout(1200)
  await b.goto(`http://localhost:7778/snippet?f=${encodeURIComponent(c.file)}`); await b.waitForSelector('[role=tab]'); await b.waitForTimeout(500)
  await c.act(a); await c.act(b); await a.waitForTimeout(700); await b.waitForTimeout(700)
  const [x, y] = [await state(a), await state(b)], same = JSON.stringify(x) === JSON.stringify(y)
  console.log(same ? 'OK  ' : 'FAIL', c.name); if (!same) { bad++; x.forEach((v, i) => v !== y[i] && console.log('   react', v, '\n   kit  ', y[i])) }
}
await browser.close(); srv.close(); process.exit(bad ? 1 : 0)
