#!/usr/bin/env node
// Keyboard audit: press Tab repeatedly and record what takes focus (tag, role, accessible label).
//   node scripts/tab-order-audit.mjs <url> <out.json> [--presses=90]
// Run it on the original and the clone, then `node scripts/tab-order-audit.mjs diff a.json b.json`.
import { chromium } from 'playwright'
import fs from 'node:fs'

const [a, b, c] = process.argv.slice(2)
if (a === 'diff') {
  const A = JSON.parse(fs.readFileSync(b, 'utf8')), B = JSON.parse(fs.readFileSync(c, 'utf8'))
  const n = Math.max(A.length, B.length)
  let same = 0
  for (let i = 0; i < n; i++) {
    if (A[i] === B[i]) same++
    else console.log(String(i).padStart(3), 'original:', A[i] ?? '-', ' | clone:', B[i] ?? '-')
  }
  console.log(`\n${same}/${n} stops identical`)
} else {
  const presses = Number((process.argv.find((x) => x.startsWith('--presses=')) ?? '--presses=90').split('=')[1])
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1710, height: 900 } })
  await page.goto(a, { waitUntil: 'load' })
  await page.waitForTimeout(4000)
  const order = []
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(60)
    order.push(
      await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return 'body'
        const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 36)
        return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''}: ${label}`
      }),
    )
  }
  fs.writeFileSync(b, JSON.stringify(order, null, 1))
  console.log(`recorded ${order.length} stops -> ${b}`)
  await browser.close()
}
