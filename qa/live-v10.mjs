import { chromium } from 'playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-position=-2600,-2600','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--mute-audio','--no-first-run'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [], failed = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
page.on('response', r => r.status() >= 400 && failed.push(`${r.status()} ${r.url().slice(-60)}`));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
try {
  await page.goto('https://flaviusvranau1.github.io/flavius-vranau-folio/?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(`!document.getElementById('preloader')`, null, { timeout: 90000 });
  console.log('preloader done; lenis:', await page.evaluate('typeof window.__lenis'));
  await page.evaluate(`window.__lenis.scrollTo(document.getElementById('igloo').offsetTop - 450, { immediate: true })`);
  await page.waitForTimeout(1500);
  const fpsHandoff = await page.evaluate(`new Promise(res => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(+(n / 3).toFixed(1)); }; requestAnimationFrame(tick); })`);
  console.log('handoff fps @4x:', fpsHandoff, 'scrollY:', await page.evaluate('Math.round(scrollY)'));
  await page.evaluate(`window.__lenis.scrollTo(document.getElementById('igloo').offsetTop, { immediate: true })`);
  await page.waitForFunction(`window.__iglooInfo !== undefined`, null, { timeout: 45000 });
  await page.waitForTimeout(3500);
  const ap = await page.evaluate(`window.__iglooScreenPos()`);
  await page.mouse.move(ap.x, ap.y + 25);
  await page.waitForTimeout(1500);
  const s1 = await page.evaluate(`window.__iglooInfo().maxLift`);
  await page.waitForTimeout(400);
  const s2 = await page.evaluate(`window.__iglooInfo().maxLift`);
  await page.screenshot({ path: 'qa/shots/live-v10.png' });
  console.log({ liftHold1: +s1.toFixed(4), liftHold2: +s2.toFixed(4), alive: Math.abs(s1 - s2) > 0.002, perfLevel: await page.evaluate('window.__perfLevel ?? 0') });
} catch (e) {
  console.log('FAILED:', String(e).slice(0, 300));
  console.log('igloo typeof:', await page.evaluate(`typeof window.__iglooInfo`).catch(() => '?'));
  console.log('scrollY:', await page.evaluate('Math.round(scrollY)').catch(() => '?'));
}
console.log('errors:', errors.slice(0, 5), 'failed:', failed.slice(0, 5));
await browser.close();
