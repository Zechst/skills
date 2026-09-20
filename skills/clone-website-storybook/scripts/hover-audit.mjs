#!/usr/bin/env node
// Hover audit: hover every visible link/button/tab with a real pointer and record which computed properties change.
//   node scripts/hover-audit.mjs <url> <out.json> [--wait=4000]
// Run it on the original and on the clone, then `node scripts/hover-audit.mjs diff a.json b.json`.
import { chromium } from 'playwright'
import fs from 'node:fs'

const [a, b, c] = process.argv.slice(2)
const PROPS = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'opacity', 'transform', 'boxShadow', 'textDecorationLine', 'outlineStyle', 'filter', 'scale', 'translate']

// serialisations of the same colour (srgb(), rgb(), oklab(), color-mix result) compare equal after rounding to rgba
function normColor(v) {
  if (typeof v !== 'string') return v
  const rgbaOf = (m) => `rgba(${m.slice(0, 3).map((x) => Math.round(x * 255 / 255)).join(',')},${(+(m[3] ?? 1)).toFixed(2)})`
  let m = v.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/)
  if (m) return rgbaOf([m[1] * 255, m[2] * 255, m[3] * 255, m[4] ?? 1])
  m = v.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/)
  if (m) return rgbaOf([+m[1], +m[2], +m[3], m[4] ?? 1])
  m = v.match(/^oklab\(([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/)
  if (m) {
    const [L, a, b] = [+m[1], +m[2], +m[3]]
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, ss = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    const lin = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss]
    const g = (c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055))
    return rgbaOf([g(lin[0]), g(lin[1]), g(lin[2]), m[4] ?? 1])
  }
  return v
}

const normValue = (v) => (typeof v === 'string' ? normColor(v) : v)
if (a === 'diff') {
  const A = JSON.parse(fs.readFileSync(b, 'utf8')), B = JSON.parse(fs.readFileSync(c, 'utf8'))
  let same = 0, differ = 0, missing = 0
  for (const k of Object.keys(A)) {
    if (!(k in B)) { missing++; console.log('only in original:', k, JSON.stringify(A[k])); continue }
    const nd = (d) => JSON.stringify(Object.fromEntries(Object.entries(d).map(([p, [x, y]]) => [p, [normValue(x), normValue(y)]]).filter(([, [x, y]]) => x !== y)))
    const x = nd(A[k]), y = nd(B[k])
    if (x === y) same++
    else { differ++; console.log('DIFF', k, '\n  original', x, '\n  clone   ', y) }
  }
  for (const k of Object.keys(B)) if (!(k in A)) console.log('only in clone:', k, JSON.stringify(B[k]))
  console.log(`\n${same} same, ${differ} differ, ${missing} missing in clone`)
} else {
  const wait = Number((process.argv.find((x) => x.startsWith('--wait=')) ?? '--wait=4000').split('=')[1])
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1710, height: 900 } })
  await page.goto(a, { waitUntil: 'load' })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  await page.waitForTimeout(wait)
  // scroll through once so lazy content exists
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 700) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(120) }
  // end states only: no transitions, so the value read right after forcing :hover is the final one
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' })
  const targets = await page.evaluate(() => {
    const out = []
    const seen = new Set()
    document.querySelectorAll('a[href], button, [role=tab]').forEach((el, i) => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || el.closest('[aria-hidden="true"], [inert]')) return
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
      let key = `${el.tagName.toLowerCase()}:${label}`
      let n = 1
      while (seen.has(`${key}#${n}`)) n++
      key = `${key}#${n}`
      seen.add(key)
      el.setAttribute('data-hover-audit', String(i))
      out.push({ key, i })
    })
    return out
  })
  const snap = (i) => page.evaluate(([i, props]) => {
    const el = document.querySelector(`[data-hover-audit="${i}"]`)
    const cs = getComputedStyle(el)
    const o = {}
    for (const p of props) o[p] = cs[p]
    const kids = el.querySelector('svg, img, span')
    if (kids) { const k = getComputedStyle(kids); o.childColor = k.color; o.childTransform = k.transform; o.childOpacity = k.opacity }
    return o
  }, [i, PROPS])
  const result = {}
  for (const { key, i } of targets) {
    try {
      const box = await page.evaluate((i) => {
        const el = document.querySelector(`[data-hover-audit="${i}"]`)
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }, i)
      const before = await snap(i)
      const doc = await cdp.send('DOM.getDocument', { depth: 0 })
      const node = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: `[data-hover-audit="${i}"]` })
      await cdp.send('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: ['hover'] })
      await page.waitForTimeout(60)
      const after = await snap(i)
      await cdp.send('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: [] })
      const delta = {}
      for (const p of Object.keys(before)) if (before[p] !== after[p]) delta[p] = [before[p], after[p]]
      result[key] = delta
    } catch { /* not hoverable right now */ }
  }
  fs.writeFileSync(b, JSON.stringify(result, null, 1))
  console.log(`audited ${Object.keys(result).length} of ${targets.length} elements -> ${b}`)
  await browser.close()
}
