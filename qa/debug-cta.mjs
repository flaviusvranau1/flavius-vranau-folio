import { chromium } from 'playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-position=-2600,-2600','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--mute-audio','--no-first-run'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`document.getElementById('hero')?.classList.contains('is-live')`, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const max = await page.evaluate(`document.documentElement.scrollHeight - innerHeight`);
const probe = `(() => { const c = document.getElementById('cta-sticky'); const g = window.gsap || null; return {
  ty: getComputedStyle(c).transform, inline: c.style.transform, h: c.offsetHeight,
  yp: g ? g.getProperty(c, 'yPercent') : 'n/a', tweens: g ? g.getTweensOf(c).map(t => ({prog: +t.progress().toFixed(2), vars: JSON.stringify(t.vars.yPercent)})) : 'n/a',
  scrollY: Math.round(scrollY)
}; })()`;
await page.evaluate(`window.gsap = window.gsap`); // noop
// expose gsap: it's bundled — grab from a tween? add global in scroll? fallback: read via inline style only
await page.evaluate(`window.__lenis.scrollTo(${max} * 0.3, {immediate:true})`);
await page.waitForTimeout(1500);
console.log('at30%', await page.evaluate(probe));
await page.evaluate(`window.__lenis.scrollTo(${max} * 0.62, {immediate:true})`);
for (let i = 0; i < 10; i++) { await page.waitForTimeout(400); console.log(i, await page.evaluate(probe)); }
await browser.close();
