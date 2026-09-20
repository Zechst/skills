#!/usr/bin/env node
// Screenshots every homepage section of a page (by section id) in a colour scheme: node scripts/section-shots.mjs <url> <outDir> <prefix> [--scheme=dark] [--width=1710]
import { chromium } from 'playwright'
import fs from 'node:fs'
const [url, out, prefix] = process.argv.slice(2)
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=')[1]
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: Number(arg('width', 1710)), height: 900 }, colorScheme: arg('scheme', 'dark') })
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(5000)
await page.addStyleTag({ content: '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; scroll-behavior: auto !important; }' })
const h = await page.evaluate(() => document.documentElement.scrollHeight)
for (let y = 0; y < h; y += 600) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(150) }
const ids = ['home-hero', 'home-region-earth', 'home-customers', 'home-title-why', 'home-waveform', 'home-title-pricing', 'home-home-pricing', 'home-title-tailored', 'home-tailored', 'build']
for (const id of ids) {
  const el = page.locator(`#${id}`).first()
  try { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await el.screenshot({ path: `${out}/${prefix}-${id}.png`, timeout: 120000 }) } catch (e) { console.log('skip', id) }
}
try { await page.locator('footer').first().scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.locator('footer').first().screenshot({ path: `${out}/${prefix}-footer.png`, timeout: 120000 }) } catch {}
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/${prefix}-top.png`, timeout: 120000 })
console.log('done', prefix)
await browser.close()
