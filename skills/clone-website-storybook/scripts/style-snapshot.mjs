#!/usr/bin/env node
// Refactor proof: snapshot every story's element rects + computed styles, then diff two snapshots.
//   node scripts/style-snapshot.mjs snap <dir> [--filter=substr] [--url=http://localhost:6020]
//   node scripts/style-snapshot.mjs diff <dirA> <dirB> [more dirs to treat as noise baselines are passed as A, A2]
// Elements are keyed by their tag path, so the DOM must not change between runs (only classes/styles may).
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const [cmd, ...rest] = process.argv.slice(2)
const flag = (n, d) => (rest.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=').slice(1).join('=')
const WIDTHS = (process.argv.find((a) => a.startsWith('--widths=')) ?? '--widths=1710,768,390').split('=')[1].split(',').map(Number)
const PROPS = ['display','position','top','left','width','height','marginTop','marginRight','marginBottom','marginLeft','paddingTop','paddingRight','paddingBottom','paddingLeft','color','backgroundColor','backgroundImage','borderTopWidth','borderTopColor','borderTopStyle','borderBottomWidth','borderBottomColor','borderLeftWidth','borderRightWidth','borderTopLeftRadius','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','textTransform','textDecorationLine','opacity','transform','boxShadow','overflow','zIndex','flexDirection','justifyContent','alignItems','gap','gridTemplateColumns','filter','maskImage','whiteSpace','transitionProperty','transitionDuration','transitionTimingFunction','animationName','animationDuration','cursor','pointerEvents','visibility']

async function snap(dir) {
  const base = flag('url', 'http://localhost:6020')
  const filter = flag('filter', '')
  const index = await (await fetch(`${base}/index.json`)).json()
  const ids = Object.values(index.entries).filter((e) => e.type === 'story' && e.id.includes(filter)).map((e) => e.id)
  fs.mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch()
  const jobs = ids.flatMap((id) => WIDTHS.map((w) => [id, w]))
  let next = 0
  const worker = async () => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' })
    while (next < jobs.length) {
      const [id, w] = jobs[next++]
      const page = await ctx.newPage()
      await page.setViewportSize({ width: w, height: 900 })
      try {
        await page.goto(`${base}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'load' })
        await page.waitForSelector('#storybook-root > *, #storybook-root:not(:empty)', { timeout: 8000 }).catch(() => {})
        await page.waitForTimeout(1600)
        const data = await page.evaluate((props) => {
          const root = document.querySelector('#storybook-root')
          const out = {}
          const walk = (el, key) => {
            const cs = getComputedStyle(el)
            const r = el.getBoundingClientRect()
            const o = { r: [Math.round(r.left * 10) / 10, Math.round((r.top + scrollY) * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10] }
            for (const p of props) o[p] = cs[p]
            out[key] = o
            const seen = {}
            for (const c of el.children) {
              const t = c.tagName.toLowerCase()
              seen[t] = (seen[t] || 0) + 1
              walk(c, `${key}>${t}${seen[t]}`)
            }
          }
          walk(root, 'root')
          // portals (menus, dialogs) live outside the root
          const seen = {}
          for (const c of document.body.children) {
            if (c === root || c.tagName === 'SCRIPT' || c.id === 'storybook-docs' || c.classList.contains('sb-wrapper') || c.classList.contains('sb-errordisplay')) continue
            const t = c.tagName.toLowerCase(); seen[t] = (seen[t] || 0) + 1
            walk(c, `body>${t}${seen[t]}`)
          }
          return out
        }, PROPS)
        fs.writeFileSync(path.join(dir, `${id}@${w}.json`), JSON.stringify(data))
      } catch (e) {
        console.error('fail', id, w, e.message)
      }
      await page.close()
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  await browser.close()
  console.log(`snapshotted ${jobs.length} story/width pairs into ${dir}`)
}

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
const IDENT = { filter: ['blur(0px)', 'none'], transform: ['none', 'matrix(1, 0, 0, 1, 0, 0)'] }
function same(p, a, b, ea, eb) {
  if (JSON.stringify(a) === JSON.stringify(b)) return true
  // a border with no width paints nothing, whatever its colour or style
  const edge = p.match(/^border(Top|Bottom|Left|Right)(Color|Style)$/)
  if (edge && ea['border' + edge[1] + 'Width'] === '0px' && eb['border' + edge[1] + 'Width'] === '0px') return true
  // Tailwind's shadow utilities prepend transparent ring/offset layers that paint nothing
  if (p === 'boxShadow') {
    const strip = (x) => String(x).replace(/(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(?: inset)?(?:, )?)+/g, '').replace(/, $/, '')
    if (strip(a) === strip(b)) return true
  }
  if ((p === 'alignItems' || p === 'justifyItems' || p === 'alignSelf') && [a, b].every((v) => v === 'start' || v === 'flex-start')) return true
  // pill radii: 9999px and calc(infinity * 1px) both round the whole box
  if (/Radius$/.test(p) && parseFloat(a) >= 9999 && parseFloat(b) >= 9999) return true
  if (typeof a === 'string' && typeof b === 'string') {
    if (normColor(a) === normColor(b)) return true
    if (IDENT[p]?.includes(a) && IDENT[p]?.includes(b)) return true
    if ((p === 'transitionDuration' || p === 'transitionTimingFunction') && (ea.transitionProperty === 'none' || eb.transitionProperty === 'none')) return true
    if ((p === 'animationDuration') && (ea.animationName === 'none' && eb.animationName === 'none')) return true
    if (p === 'transform' && JSON.stringify(ea.r) === JSON.stringify(eb.r)) return true // same painted box, different property split
    // colours embedded in longer values (gradients, shadows)
    if (/color\(srgb|oklab|rgba?\(/.test(a + b)) {
      const n = (x) => x.replace(/color\(srgb [^)]*\)|oklab\([^)]*\)|rgba?\([^)]*\)/g, (c) => normColor(c))
      if (n(a) === n(b)) return true
    }
  }
  return false
}
function diff(a, b, noise) {
  const files = fs.readdirSync(a).filter((f) => f.endsWith('.json'))
  let total = 0, storiesWithDiff = 0
  for (const f of files) {
    if (!fs.existsSync(path.join(b, f))) { console.log('missing in B:', f); continue }
    const A = JSON.parse(fs.readFileSync(path.join(a, f)))
    const B = JSON.parse(fs.readFileSync(path.join(b, f)))
    const N = noise && fs.existsSync(path.join(noise, f)) ? JSON.parse(fs.readFileSync(path.join(noise, f))) : null
    const diffs = []
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (k.startsWith('body>svg')) continue
      if (!A[k] || !B[k]) { diffs.push(`${k}: ${A[k] ? 'removed' : 'added'}`); continue }
      for (const p of Object.keys(A[k])) {
        const av = JSON.stringify(A[k][p]), bv = JSON.stringify(B[k][p])
        if (same(p, A[k][p], B[k][p], A[k], B[k])) continue
        if (N && N[k] && !same(p, N[k][p], A[k][p], N[k], A[k])) continue // unstable between two baselines
        diffs.push(`${k} ${p}: ${av} -> ${bv}`)
      }
    }
    if (diffs.length) {
      storiesWithDiff++; total += diffs.length
      console.log(`\n${f}: ${diffs.length} differences`)
      diffs.slice(0, Number(flag('max', 8))).forEach((d) => console.log('  ' + d))
    }
  }
  console.log(`\n${storiesWithDiff}/${files.length} story-widths differ (${total} property differences)`)
}

if (cmd === 'snap') await snap(rest[0])
else if (cmd === 'diff') diff(rest[0], rest[1], rest.find((a) => !a.startsWith('--') && a !== rest[0] && a !== rest[1]))
else console.log('usage: snap <dir> | diff <a> <b> [noiseDir]')
