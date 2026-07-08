/* QA harness: drives the site headlessly and proves each acceptance criterion.
   Run: node qa/verify.mjs  (dev server must be on :5199) */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:5199';
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots') + path.sep;
fs.mkdirSync(SHOTS, { recursive: true });

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const results = [];
const note = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
};

const heroCanvasHash = () =>
  `(() => {
    const c = document.getElementById('hero-canvas');
    const ctx = c.getContext('2d');
    if (!c.width) return 'empty';
    const d = ctx.getImageData(0, Math.floor(c.height/2), Math.min(600, c.width), 2).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 16) h = (h * 31 + d[i]) >>> 0;
    return h;
  })()`;

const momentCanvasHash = () =>
  `(() => {
    const c = document.getElementById('moment-canvas');
    if (!c || !c.width) return 'empty';
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, Math.floor(c.height/2), Math.min(600, c.width), 2).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 16) h = (h * 31 + d[i]) >>> 0;
    return h;
  })()`;

async function lenisScroll(page, y) {
  await page.evaluate((yy) => {
    const l = window.__lenis;
    if (l) l.scrollTo(yy, { immediate: true });
    else window.scrollTo(0, yy);
  }, y);
  await page.waitForTimeout(900); // let scrub (0.5-0.7) catch up
}

/** Poll an expression until its value is stable across 3 consecutive reads. */
async function settled(page, expr, timeout = 8000) {
  let prev;
  let stable = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await page.evaluate(expr);
    stable = v === prev ? stable + 1 : 0;
    prev = v;
    if (stable >= 2) return v;
    await page.waitForTimeout(350);
  }
  return prev;
}

/** Poll until predicate(value) is true; forces compositor frames each round
    (headless Chrome can freeze rAF when nothing invalidates paint). */
async function converges(page, expr, predicate, timeout = 9000) {
  let v;
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    v = await page.evaluate(expr);
    if (predicate(v)) return v;
    await page.screenshot({ clip: { x: 0, y: 0, width: 8, height: 8 } }); // BeginFrame tick
    await page.waitForTimeout(300);
  }
  return v;
}

// Headed (offscreen) — new-headless freezes rAF between compositor frames, which
// falsely stalls GSAP mid-tween. These flags keep an unfocused window rendering.
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: false,
  args: [
    '--window-position=-2600,-2600',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--mute-audio',
    '--no-first-run',
  ],
});

/* ============ DESKTOP ============ */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));

  // --- Preloader with real (throttled) load
  await page.goto(`${BASE}/?slowload=60`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const midCount = await page.evaluate(`document.getElementById('preload-count')?.textContent`);
  await page.screenshot({ path: SHOTS + 'd0-preloader.png' });
  await page.waitForTimeout(2500);
  const midCount2 = await page.evaluate(`document.getElementById('preload-count')?.textContent`);
  note('preloader counts with real load', Number(midCount) > 0 && Number(midCount2) > Number(midCount), `${midCount} -> ${midCount2}`);
  await page.waitForFunction(`document.getElementById('hero')?.classList.contains('is-live')`, null, { timeout: 60000 });
  const preGone = await page.evaluate(`!document.getElementById('preloader')`);
  note('preloader wipes away, hero live', preGone, '');

  // --- Hero intro + scrub fwd/back
  await page.waitForTimeout(1800);
  await page.screenshot({ path: SHOTS + 'd1-hero-start.png' });
  const frameIdx = `Math.round(window.__heroFrame())`;
  const h0 = await settled(page, heroCanvasHash());
  const f0 = await page.evaluate(frameIdx);
  await lenisScroll(page, 1500);
  const h1500 = await settled(page, heroCanvasHash());
  const f1500 = await converges(page, frameIdx, (v) => v > 10);
  await page.screenshot({ path: SHOTS + 'd2-hero-midscrub.png' });
  await lenisScroll(page, 2900);
  const h2900 = await settled(page, heroCanvasHash());
  const f2900 = await page.evaluate(frameIdx);
  await lenisScroll(page, 1500);
  const f1500b = await converges(page, frameIdx, (v) => v === f1500);
  await lenisScroll(page, 0);
  const f0b = await converges(page, frameIdx, (v) => v === f0);
  note(
    'hero scrubs forward (distinct frames drawn)',
    h0 !== h1500 && h1500 !== h2900 && f0 === 0 && f1500 > 30 && f2900 > 100,
    `frames ${f0} -> ${f1500} -> ${f2900}`
  );
  note('hero scrubs backward + snaps to whole frames', f1500b === f1500 && f0b === 0, `back to ${f1500b} then ${f0b}`);
  const pinSpacers = await page.evaluate(`document.querySelectorAll('.pin-spacer').length`);
  note('desktop pins exist (hero/craft/work/moment)', pinSpacers >= 3, `pin-spacers: ${pinSpacers}`);

  // --- Manifesto masked reveals
  const manifestoY = await page.evaluate(`document.getElementById('manifesto').offsetTop`);
  await lenisScroll(page, manifestoY + 2600); // account for hero pin distance offset
  await page.waitForTimeout(600);
  const lineState = await page.evaluate(`(() => {
    const l = document.querySelectorAll('.manifesto__line');
    const st = getComputedStyle(l[0]);
    return { count: l.length, transform: st.transform, opacity: st.opacity };
  })()`);
  await page.screenshot({ path: SHOTS + 'd3-manifesto.png' });
  note('manifesto lines revealed', lineState.count === 4 && (lineState.transform === 'none' || /matrix\(1, 0, 0, 1, 0, 0(\.\d+)?\)/.test(lineState.transform)), JSON.stringify(lineState));

  // --- Craft pinned reveal
  const craftTop = await page.evaluate(`document.querySelector('#craft').offsetTop`);
  await lenisScroll(page, craftTop + 200);
  const rowsEarly = await page.evaluate(`[...document.querySelectorAll('.craft__row')].map(r => +getComputedStyle(r).opacity)`);
  await lenisScroll(page, craftTop + 2100);
  const rowsLate = await page.evaluate(`[...document.querySelectorAll('.craft__row')].map(r => +getComputedStyle(r).opacity)`);
  await page.screenshot({ path: SHOTS + 'd4-craft.png' });
  const revealedProgressively = rowsEarly.filter((o) => o > 0.9).length < rowsLate.filter((o) => o > 0.9).length;
  note('craft spec rows pin+reveal on scroll', revealedProgressively, `early:${rowsEarly.map(n=>n.toFixed(1))} late:${rowsLate.map(n=>n.toFixed(1))}`);

  // --- Work horizontal scrub
  const workTop = await page.evaluate(`document.querySelector('#work').offsetTop`);
  await lenisScroll(page, workTop + 100);
  const tx1 = await page.evaluate(`getComputedStyle(document.getElementById('work-track')).transform`);
  await lenisScroll(page, workTop + 900);
  const tx2 = await page.evaluate(`getComputedStyle(document.getElementById('work-track')).transform`);
  await page.screenshot({ path: SHOTS + 'd5-work.png' });
  note('work track scrubs horizontally', tx1 !== tx2, `${tx1} -> ${tx2}`);
  const imgsLoaded = await page.evaluate(`[...document.querySelectorAll('.card__img')].map(i => i.complete && i.naturalWidth > 0)`);
  note('work thumbnails loaded', imgsLoaded.every(Boolean), JSON.stringify(imgsLoaded));

  // --- Moment sweep scrub
  const momentTop = await page.evaluate(`document.querySelector('#moment').offsetTop`);
  await lenisScroll(page, momentTop + 100);
  await page.waitForTimeout(1500); // allow lazy frames
  const m1 = await page.evaluate(momentCanvasHash());
  const clip1 = await page.evaluate(`document.getElementById('moment-title').style.clipPath`);
  await lenisScroll(page, momentTop + 1500);
  const m2 = await page.evaluate(momentCanvasHash());
  const clip2 = await page.evaluate(`document.getElementById('moment-title').style.clipPath`);
  await page.screenshot({ path: SHOTS + 'd6-moment.png' });
  note('light-sweep beat scrubs frames', m1 !== 'empty' && m2 !== 'empty' && m1 !== m2, `${m1} -> ${m2}`);
  note('moment headline wipes in', clip1 !== clip2, `${clip1} -> ${clip2}`);

  // --- Depth portrait: mouse reaction
  const depthTop = await page.evaluate(`document.querySelector('#depth').offsetTop`);
  await lenisScroll(page, depthTop - 200);
  await page.waitForTimeout(2000);
  const live = await page.evaluate(`document.getElementById('depth-stage').classList.contains('is-live')`);
  const stage = await page.locator('#depth-stage').boundingBox();
  await page.mouse.move(stage.x + stage.width * 0.15, stage.y + stage.height * 0.3);
  await page.waitForTimeout(700);
  const shotA = await page.locator('#depth-stage').screenshot();
  await page.mouse.move(stage.x + stage.width * 0.85, stage.y + stage.height * 0.7);
  await page.waitForTimeout(700);
  const shotB = await page.locator('#depth-stage').screenshot();
  fs.writeFileSync(SHOTS + 'd7-depth.png', shotB);
  let diff = 0;
  const len = Math.min(shotA.length, shotB.length);
  for (let i = 0; i < len; i += 97) if (shotA[i] !== shotB[i]) diff++;
  note('depth portrait live + reacts to mouse', live && diff > 20, `webgl:${live} diffSamples:${diff}`);

  // --- Story progress + steps
  const storyTop = await page.evaluate(`document.querySelector('#story').offsetTop`);
  await lenisScroll(page, storyTop + 600);
  const prog = await page.evaluate(`getComputedStyle(document.getElementById('story-progress')).transform`);
  const stepOp = await page.evaluate(`+getComputedStyle(document.querySelector('[data-step]')).opacity`);
  await page.screenshot({ path: SHOTS + 'd8-story.png' });
  const scaleY = prog.startsWith('matrix') ? Number(prog.split(',')[3]) : 0;
  note('timeline progress line + steps animate', scaleY > 0.05 && stepOp > 0.9, `scaleY:${scaleY.toFixed(2)} stepOpacity:${stepOp}`);

  // --- Sticky CTA after 50%
  const maxScroll = await page.evaluate(`document.documentElement.scrollHeight - innerHeight`);
  const yOf = (t) => (t && t.startsWith('matrix') ? Number(t.split(',')[5].replace(')', '')) : 0);
  const ctaExpr = `getComputedStyle(document.getElementById('cta-sticky')).transform`;
  await lenisScroll(page, maxScroll * 0.3);
  const cta30 = await converges(page, ctaExpr, (t) => yOf(t) > 40);
  await lenisScroll(page, maxScroll * 0.62);
  const cta62 = await converges(page, ctaExpr, (t) => Math.abs(yOf(t)) < 2);
  note('sticky CTA appears after 50%', yOf(cta30) > 40 && Math.abs(yOf(cta62)) < 2, `30%:${yOf(cta30)} 62%:${yOf(cta62)}`);

  // --- Contact
  await lenisScroll(page, maxScroll);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOTS + 'd9-contact.png' });
  const contactShown = await page.evaluate(`(() => {
    const l = document.querySelector('.contact__title-line');
    const st = getComputedStyle(l);
    return { transform: st.transform, opacity: st.opacity };
  })()`);
  note('contact title revealed', contactShown.transform === 'none' || /matrix\(1, 0, 0, 1, 0, 0(\.\d+)?\)/.test(contactShown.transform), JSON.stringify(contactShown));

  // --- Language toggle
  await page.evaluate(`window.__lenis.scrollTo(0, { immediate: true })`);
  await page.click('#lang-toggle');
  const roTagline = await page.evaluate(`document.getElementById('hero-tagline').textContent`);
  note('RO toggle swaps strings', roTagline.includes('Construiesc'), roTagline.trim().slice(0, 60));
  await page.click('#lang-toggle');

  // --- Overflow + console + DPR
  const overflowX = await page.evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  note('no horizontal overflow (desktop)', overflowX <= 0, `excess:${overflowX}px`);
  note('zero console errors (desktop)', errors.length === 0, errors.slice(0, 4).join(' | '));
  note('no failed requests', failed.length === 0, failed.slice(0, 4).join(' | '));
  await ctx.close();
}

/* ============ REDUCED MOTION ============ */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const state = await page.evaluate(`(() => ({
    preloaderGone: !document.getElementById('preloader'),
    heroLive: document.getElementById('hero').classList.contains('is-live'),
    fallbackVisible: getComputedStyle(document.getElementById('hero-fallback')).visibility === 'visible',
    pinSpacers: document.querySelectorAll('.pin-spacer').length,
    canvasShown: getComputedStyle(document.getElementById('hero-canvas')).opacity
  }))()`);
  await page.screenshot({ path: SHOTS + 'r1-reduced-hero.png' });
  note(
    'reduced-motion: static hero, no scrub/pins',
    state.preloaderGone && !state.heroLive && state.fallbackVisible && state.pinSpacers === 0,
    JSON.stringify(state)
  );
  note('reduced-motion: zero errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ============ MOBILE 375 ============ */
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`document.getElementById('hero')?.classList.contains('is-live')`, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOTS + 'm1-hero.png' });
  const pinSpacers = await page.evaluate(`document.querySelectorAll('.pin-spacer').length`);
  note('mobile: pinning disabled', pinSpacers === 0, `pin-spacers:${pinSpacers}`);
  const mh0 = await page.evaluate(heroCanvasHash());
  await page.evaluate(`window.scrollTo(0, 400)`);
  await page.waitForTimeout(900);
  const mh400 = await page.evaluate(heroCanvasHash());
  note('mobile: reduced hero scrub works', mh0 !== mh400, `${mh0} -> ${mh400}`);
  const overflowX = await page.evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  note('mobile: no horizontal overflow', overflowX <= 0, `excess:${overflowX}px`);
  await page.evaluate(`window.scrollTo(0, document.body.scrollHeight * 0.45)`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: SHOTS + 'm2-mid.png' });
  const dpr = await page.evaluate(`(() => { const c = document.getElementById('hero-canvas'); return c.width / c.clientWidth; })()`);
  note('mobile: DPR-capped canvas (<=2)', dpr > 1 && dpr <= 2.01, `ratio:${dpr}`);
  note('mobile: zero errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  await ctx.close();
}

await browser.close();
const failCount = results.filter((r) => !r.pass).length;
console.log(`\n=== ${results.length - failCount}/${results.length} checks passed ===`);
fs.writeFileSync(SHOTS + 'results.json', JSON.stringify(results, null, 2));
process.exit(failCount ? 1 : 0);
