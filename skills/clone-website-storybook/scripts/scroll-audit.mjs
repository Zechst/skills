#!/usr/bin/env node
// Scroll audit: scroll to fixed offsets and record what the header does (variant, nav visibility, "Start building" pill, dark mode).
//   node scripts/scroll-audit.mjs <url> <out.json> [--width=1710]
//   node scripts/scroll-audit.mjs diff a.json b.json
import { chromium } from 'playwright'
import fs from 'node:fs'

const [a, b, c] = process.argv.slice(2)
if (a === 'diff') {
  const A = JSON.parse(fs.readFileSync(b, 'utf8')), B = JSON.parse(fs.readFileSync(c, 'utf8'))
  let same = 0
  for (const k of Object.keys(A)) {
    if (JSON.stringify(A[k]) === JSON.stringify(B[k])) same++
    else console.log('DIFF at', k, '\n  original', JSON.stringify(A[k]), '\n  clone   ', JSON.stringify(B[k]))
  }
  console.log(`${same}/${Object.keys(A).length} offsets identical`)
} else {
  const width = Number((process.argv.find((x) => x.startsWith('--width=')) ?? '--width=1710').split('=')[1])
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto(a, { waitUntil: 'load' })
  await page.waitForTimeout(4000)
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }' })
  const out = {}
  const offsets = [0, 20, 40, 60, 80, 120, 300, 700, 1200, 2000, 2800, 3600, 4400, 5200, 5600, 5900, 6300]
  for (const y of offsets) {
    await page.evaluate((v) => window.scrollTo(0, v), y)
    await page.waitForTimeout(500)
    out[y] = await page.evaluate(() => {
      const h = document.querySelector('header')
      const cta = h.querySelector('#nav-start-building-button, [data-slot="button"][href*="sign-up"]')
      const nav = h.querySelector('#nav-container, #header-navigation')
      // opacity as painted: the product along the ancestor chain up to the header
      const painted = (el) => {
        let o = 1
        for (let n = el; n && n !== h.parentElement; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
        return o.toFixed(2)
      }
      return { onDark: h.getAttribute('data-nav-on-dark'), ctaPainted: cta ? painted(cta) : null, navPainted: nav ? painted(nav) : null }
    })
  }
  fs.writeFileSync(b, JSON.stringify(out, null, 1))
  console.log(`recorded ${offsets.length} offsets -> ${b}`)
  await browser.close()
}
