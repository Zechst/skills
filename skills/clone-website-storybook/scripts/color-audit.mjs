#!/usr/bin/env node
// Colour audit: record colours, borders and shadows of every visible text/box element, keyed by tag + text, in a colour scheme.
//   node scripts/color-audit.mjs <url> <out.json> [--scheme=dark]     then     node scripts/color-audit.mjs diff a.json b.json
import { chromium } from 'playwright'
import fs from 'node:fs'
const [a, b, c] = process.argv.slice(2)
const PROPS = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'boxShadow', 'filter', 'backgroundImage', 'fill', 'stroke', 'textDecorationColor']
const norm = (v) => (typeof v === 'string' ? v.replace(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)/g, (_, r, g, bl, al) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(bl * 255)},${(+(al ?? 1)).toFixed(2)})`).replace(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/g, (_, r, g, bl, al) => `rgba(${r},${g},${bl},${(+(al ?? 1)).toFixed(2)})`) : v)
if (a === 'diff') {
  const A = JSON.parse(fs.readFileSync(b, 'utf8')), B = JSON.parse(fs.readFileSync(c, 'utf8'))
  let same = 0, differ = 0, missing = 0
  for (const k of Object.keys(A)) {
    if (!(k in B)) { missing++; continue }
    const d = []
    for (const p of PROPS) if (norm(A[k][p]) !== norm(B[k][p]) && !(p === 'backgroundImage' && /gradient|url/.test(String(A[k][p]) + String(B[k][p])))) d.push(`${p}: live ${A[k][p]} | clone ${B[k][p]}`)
    if (d.length) { differ++; console.log(k, '\n  ' + d.join('\n  ')) } else same++
  }
  console.log(`\n${same} same, ${differ} differ, ${missing} not in clone`)
} else {
  const scheme = (process.argv.find((x) => x.startsWith('--scheme=')) ?? '--scheme=dark').split('=')[1]
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1710, height: 900 }, colorScheme: scheme })
  await page.goto(a, { waitUntil: 'load' })
  await page.waitForTimeout(5000)
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' })
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < h; y += 500) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(120) }
  const data = await page.evaluate((props) => {
    const out = {}, seen = {}
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    document.querySelectorAll('body *').forEach((el) => {
      if (!visible(el) || el.closest('svg') && el.tagName !== 'svg' || ['SCRIPT', 'STYLE', 'CANVAS', 'VIDEO', 'IMG'].includes(el.tagName)) return
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').replace(/\s+/g, ' ').slice(0, 28)
      const cs = getComputedStyle(el)
      const hasBox = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== 'none'
      if (!own && !hasBox) return
      const r = el.getBoundingClientRect()
      const at = `${Math.round((r.left + scrollX) / 6) * 6},${Math.round((r.top + scrollY) / 6) * 6},${Math.round(r.width / 6) * 6},${Math.round(r.height / 6) * 6}`
      const key0 = own ? `${el.tagName.toLowerCase()}:${own}` : `box@${at}`
      seen[key0] = (seen[key0] || 0) + 1
      const o = {}
      for (const p of props) o[p] = p === 'borderTopColor' || p === 'borderBottomColor' || p === 'borderLeftColor' ? (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 ? cs[p] : '') : cs[p]
      out[`${key0}#${seen[key0]}`] = o
    })
    return out
  }, PROPS)
  fs.writeFileSync(b, JSON.stringify(data, null, 1))
  console.log(`recorded ${Object.keys(data).length} elements -> ${b}`)
  await browser.close()
}
