#!/usr/bin/env node
// Acceptance gate: live page vs clone story, same browser, same viewport, same absolute scroll y.
// Fails (exit 1) on height mismatch at load, mismatched frames, or empty screens the original doesn't have.
//
// Usage (run from the clone project root, which must have `playwright` installed):
//   node <skill-dir>/scripts/verify-live.mjs \
//     --live https://example.com/ \
//     --clone 'http://localhost:6006/iframe.html?id=pages-home--default&viewMode=story' \
//     --out docs/design-references/<site-key>/verify
// Options:
//   --partial          clone covers only part of the page: skip the total-height check, but still sweep for empty screens
//   --offset-live N    add N px to every live y (partial clones whose story starts at the cloned section);
//                      per viewport: --offset-live desktop:5914,mobile:4561
//   --max-diff P       max % of differing pixels per frame (default 8)
//   --allow-y Y,Y      frames allowed to exceed --max-diff (timers/video); each must be justified in the report
//   --block REGEX      extra request URLs to block (trackers are always blocked)
import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]);
    return acc;
  }, []),
);
if (!args.live || !args.clone) {
  console.error('verify-live: --live and --clone are required');
  process.exit(2);
}
const OUT = resolve(args.out ?? 'verify');
const MAX_DIFF = Number(args['max-diff'] ?? 8);
const ALLOW_Y = new Set(String(args['allow-y'] ?? '').split(',').filter(Boolean).map(Number));
const OFFSETS = String(args['offset-live'] ?? '0').includes(':')
  ? Object.fromEntries(String(args['offset-live']).split(',').map((kv) => kv.split(':')).map(([k, v]) => [k, Number(v)]))
  : {desktop: Number(args['offset-live'] ?? 0), mobile: Number(args['offset-live'] ?? 0)};
const PARTIAL = Boolean(args.partial);
const TRACKERS = new RegExp(
  'google-analytics|googletagmanager|doubleclick|facebook|ads-twitter|analytics\\.twitter|static\\.ads|t\\.co/|hotjar|klaviyo|tiktok|clarity\\.ms|segment\\.(io|com)|posthog|intercom|sentry|vercel-insights|vitals\\.vercel|plausible|reddit|linkedin|pinterest|snapchat|bing\\.com|monorail|web-pixels|trekkie|/metrics/|data-relay|omtrdc|demdex' +
    (args.block ? `|${args.block}` : ''),
  'i',
);
const VIEWPORTS = [
  {tag: 'desktop', width: 1440, height: 900, mobile: false},
  {tag: 'mobile', width: 390, height: 844, mobile: true},
];

const {chromium} = createRequire(join(process.cwd(), 'package.json'))('playwright');
mkdirSync(OUT, {recursive: true});
const browser = await chromium.launch();
const failures = [];
const report = {live: args.live, clone: args.clone, maxDiffPct: MAX_DIFF, viewports: []};

async function open(ctx, url) {
  const page = await ctx.newPage();
  await page.route('**/*', (r) => (TRACKERS.test(r.request().url()) ? r.abort() : r.continue()));
  await page.goto(url, {waitUntil: 'load', timeout: 60000}).catch(() => {});
  await page.waitForTimeout(6000); // intro animations and delayed pop-ups
  for (const sel of ['[role=dialog] [aria-label*="lose" i]', 'dialog [aria-label*="lose" i]', 'button:has-text("Close")', '[aria-label="Dismiss"]']) {
    const el = page.locator(sel).first();
    // Short timeout: some sites keep hidden dialogs mounted, and a covered close button would stall 30s.
    if (await el.isVisible().catch(() => false)) {
      await el.click({timeout: 2000}).catch(() => {});
      break;
    }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(800);
  return page;
}
// Height at load, before any scroll pass: lazy images that grow later must not hide a mismatch.
const height = (p) => p.evaluate(() => document.documentElement.scrollHeight);
async function shotAt(p, y) {
  await p.evaluate((y) => window.scrollTo(0, y), y);
  // A real wheel tick, so layers that only update on user scroll are positioned as a visitor sees them.
  await p.mouse.move(200, 200);
  await p.mouse.wheel(0, 1);
  await p.waitForTimeout(4000);
  // Freeze time-driven media at the same point on both pages so frames compare layout, not playback position.
  // Paused videos are left alone: scroll-scrubbed video sets currentTime itself and must keep its frame.
  await p.evaluate(async () => {
    const seeks = [...document.querySelectorAll('video')]
      .filter((v) => !v.paused && v.readyState >= 1)
      .map((v) => {
        v.pause();
        v.currentTime = 0;
        return new Promise((r) => {
          v.addEventListener('seeked', r, {once: true});
          setTimeout(r, 1500);
        });
      });
    for (const a of document.getAnimations()) {
      if (a.effect?.getTiming?.().iterations === Infinity) {
        a.pause();
        a.currentTime = 0;
      }
    }
    await Promise.all(seeks);
  });
  await p.waitForTimeout(300);
  return (await p.screenshot()).toString('base64');
}
// Pixel stats computed in a scratch page: % differing pixels and % of the dominant flat colour.
async function stats(scratch, a, b) {
  return scratch.evaluate(
    async ([a, b]) => {
      const load = async (s) => {
        const i = new Image();
        i.src = 'data:image/png;base64,' + s;
        await i.decode();
        const c = new OffscreenCanvas(i.width / 4, i.height / 4);
        const x = c.getContext('2d');
        x.drawImage(i, 0, 0, c.width, c.height);
        return x.getImageData(0, 0, c.width, c.height).data;
      };
      const flat = (d) => {
        const counts = new Map();
        for (let i = 0; i < d.length; i += 4) {
          const k = `${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        return Math.round((100 * Math.max(...counts.values())) / (d.length / 4));
      };
      const da = await load(a);
      if (!b) return {flat: flat(da)};
      const db = await load(b);
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) diff++;
      }
      return {diffPct: +((100 * diff) / (da.length / 4)).toFixed(2), flatLive: flat(da), flatClone: flat(db)};
    },
    [a, b],
  );
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({viewport: {width: vp.width, height: vp.height}, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 1});
  const scratch = await ctx.newPage();
  const live = await open(ctx, args.live);
  const clone = await open(ctx, args.clone);
  const [hl, hc] = [await height(live), await height(clone)];
  const OFFSET = OFFSETS[vp.tag] ?? 0;
  const v = {viewport: vp.tag, liveHeightAtLoad: hl, cloneHeightAtLoad: hc, frames: [], sweep: []};
  if (!PARTIAL && Math.abs(hl - hc) > 1) failures.push(`${vp.tag}: page height at load live ${hl} vs clone ${hc}`);

  // 1. Sweep the whole clone, one viewport at a time: no near-empty screens the original doesn't have.
  for (let y = 0; y < hc; y += vp.height) {
    const c = await shotAt(clone, y);
    const l = y + OFFSET < hl ? await shotAt(live, y + OFFSET) : null;
    const s = l ? await stats(scratch, l, c) : {flatClone: (await stats(scratch, c)).flat, flatLive: null};
    v.sweep.push({y, flatClonePct: s.flatClone, flatLivePct: s.flatLive});
    if (s.flatClone >= 95 && (s.flatLive === null || s.flatLive < 90)) {
      failures.push(`${vp.tag}: clone screen at y=${y} is ${s.flatClone}% one flat colour (live ${s.flatLive ?? 'n/a'}%) — empty spacer or unloaded media`);
    }
  }

  // 2. Paired frames at the same y across the page, side-by-side sheet for review.
  const pairs = [];
  for (const f of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
    const y = Math.round(f * Math.max(0, Math.min(hc, hl - OFFSET) - vp.height));
    const [a, b] = [await shotAt(live, y + OFFSET), await shotAt(clone, y)];
    const s = await stats(scratch, a, b);
    v.frames.push({y, liveY: y + OFFSET, diffPct: s.diffPct});
    if (s.diffPct > MAX_DIFF && !ALLOW_Y.has(y)) failures.push(`${vp.tag}: frame y=${y} differs ${s.diffPct}% (> ${MAX_DIFF}%)`);
    pairs.push({y, a, b, d: s.diffPct});
  }
  const w = vp.mobile ? 390 : 700;
  await scratch.setViewportSize({width: w * 2 + 30, height: 800});
  await scratch.setContent(
    `<body style="margin:0;background:#222;font:14px sans-serif;color:#eee"><div style="display:flex;gap:10px;padding:5px 10px"><b style="width:${w}px">LIVE</b><b>CLONE</b></div>` +
      pairs.map((p) => `<div style="padding:4px 10px">y=${p.y} · diff ${p.d}%</div><div style="display:flex;gap:10px;padding:0 10px 10px"><img style="width:${w}px" src="data:image/png;base64,${p.a}"><img style="width:${w}px" src="data:image/png;base64,${p.b}"></div>`).join(''),
  );
  await scratch.waitForTimeout(500);
  await scratch.screenshot({path: join(OUT, `sheet-${vp.tag}.png`), fullPage: true});
  report.viewports.push(v);
  await ctx.close();
}
await browser.close();

report.failures = failures;
report.pass = failures.length === 0;
writeFileSync(join(OUT, 'verify-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({pass: report.pass, failures, heights: report.viewports.map((v) => [v.viewport, v.liveHeightAtLoad, v.cloneHeightAtLoad])}, null, 2));
console.log(`sheets + report: ${OUT}`);
process.exit(report.pass ? 0 : 1);
