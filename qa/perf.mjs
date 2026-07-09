/* Perf harness: rAF pacing per section + cursor input latency, under CDP CPU
   throttling and deviceScaleFactor 2 (big buffers = weak-GPU proxy).
   Usage: node qa/perf.mjs [label]   — runs 1x/4x/6x CPU throttle at DSF2. */
import { chromium } from 'playwright-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LABEL = process.argv[2] ?? 'run';
const CONFIGS = [
  { cpu: 1, dsf: 2 },
  { cpu: 4, dsf: 2 },
  { cpu: 6, dsf: 2 },
];
// [name, lenis target] — handoff rows park the scroll where two sections overlap 50/50
const SPOTS = [
  ['intro', `0`],
  ['intro/phone', `document.getElementById('phone').getBoundingClientRect().top + window.scrollY - innerHeight * 0.5`],
  ['phone', `'#phone'`],
  ['phone/igloo', `document.getElementById('igloo').getBoundingClientRect().top + window.scrollY - innerHeight * 0.5`],
  ['igloo', `'#igloo'`],
  ['hero', `'#hero'`],
  ['depth', `'#depth'`],
  ['contact', `'#contact'`],
];

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: false,
  args: [
    '--window-position=-2600,-2600',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--mute-audio',
    '--no-first-run',
  ],
});

const results = [];
for (const cfg of CONFIGS) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: cfg.dsf,
  });
  const page = await context.newPage();
  // rAF counter that survives reloads (Vite dep-optimization can reload the page once)
  await context.addInitScript(() => {
    window.__raf = 0;
    const loop = () => {
      window.__raf++;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cfg.cpu });

  await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`!document.getElementById('preloader')`, null, { timeout: 120000 });
  await page.waitForTimeout(2000);

  // WARMUP: touch every lazy chunk (phone, igloo, hero frames, depth) so any
  // Vite dep-optimization reload happens NOW, then reload onto a stable page.
  for (const [, expr] of SPOTS) {
    await page.evaluate(`window.__lenis.scrollTo(${expr}, { immediate: true })`).catch(() => undefined);
    await page.waitForTimeout(900);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`!document.getElementById('preloader')`, null, { timeout: 120000 });
  await page.waitForTimeout(2000);

  const row = { label: `${LABEL} cpu${cfg.cpu}x dsf${cfg.dsf}`, spots: {}, levels: {} };

  for (const [name, expr] of SPOTS) {
    await page.evaluate(`window.__lenis.scrollTo(${expr}, { immediate: true })`);
    await page.waitForTimeout(2200); // boot + settle
    // wiggle the mouse so pointer-driven sims are actually working during the window
    const wiggle = (async () => {
      for (let i = 0; i < 25; i++) {
        await page.mouse.move(700 + Math.sin(i * 0.7) * 300, 500 + Math.cos(i * 0.5) * 220);
        await page.waitForTimeout(180);
      }
    })();
    const fps = await page.evaluate(
      () =>
        new Promise((res) => {
          const start = window.__raf;
          const t0 = performance.now();
          setTimeout(() => res((window.__raf - start) / ((performance.now() - t0) / 1000)), 5000);
        })
    );
    await wiggle;
    row.spots[name] = Math.round(fps * 10) / 10;
    row.levels[name] = await page.evaluate(`window.__perfLevel ?? -1`);
    console.log(`  [${row.label}] ${name}: ${row.spots[name]} fps (L${row.levels[name]})`);
  }

  // cursor input latency: dispatch a synthetic move, poll the cursor transform
  const cursorLat = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const cursor = document.getElementById('cursor');
        if (!cursor) return resolve({ ms: -2, frames: -2 });
        const tx = 913;
        const ty = 517;
        const t0 = performance.now();
        const parse = () => {
          const m = /translate(?:3d)?\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(cursor.style.transform || '');
          return m ? { x: +m[1], y: +m[2] } : null;
        };
        const near = (p) => p && Math.abs(p.x - tx) < 8 && Math.abs(p.y - ty) < 8;
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: tx, clientY: ty }));
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: tx, clientY: ty }));
        if (near(parse())) return resolve({ ms: 0, frames: 0 });
        let frames = 0;
        const check = () => {
          frames++;
          if (near(parse())) resolve({ ms: Math.round(performance.now() - t0), frames });
          else if (performance.now() - t0 > 5000) resolve({ ms: -1, frames });
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      })
  );
  row.cursor = cursorLat;
  console.log(`  [${row.label}] cursor latency: ${cursorLat.ms}ms (${cursorLat.frames} frames)`);

  // scroll-through pacing: slow programmatic lenis scroll top->bottom while counting frames
  await page.evaluate(`window.__lenis.scrollTo(0, { immediate: true })`);
  await page.waitForTimeout(800);
  const scrollFps = await page.evaluate(
    () =>
      new Promise((res) => {
        const start = window.__raf;
        const t0 = performance.now();
        window.__lenis.scrollTo(document.documentElement.scrollHeight, { duration: 14, lock: true });
        setTimeout(() => res((window.__raf - start) / ((performance.now() - t0) / 1000)), 14000);
      })
  );
  row.scrollThrough = Math.round(scrollFps * 10) / 10;
  console.log(`  [${row.label}] scroll-through: ${row.scrollThrough} fps`);

  results.push(row);
  await context.close();
}

console.log('\n=== SUMMARY', LABEL, '===');
for (const r of results) {
  console.log(
    r.label,
    JSON.stringify(r.spots),
    'levels',
    JSON.stringify(r.levels),
    'cursor',
    JSON.stringify(r.cursor),
    'scroll',
    r.scrollThrough
  );
}
await browser.close();
