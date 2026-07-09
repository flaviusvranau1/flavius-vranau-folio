import { chromium } from 'playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-position=-2600,-2600','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--mute-audio','--no-first-run'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [], failed = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
page.on('response', r => r.status() >= 400 && failed.push(`${r.status()} ${r.url().slice(-50)}`));
await page.goto('https://flaviusvranau1.github.io/flavius-vranau-folio/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`!document.getElementById('preloader')`, null, { timeout: 60000 });
await page.evaluate(`window.__lenis.scrollTo(document.getElementById('igloo').offsetTop, { immediate: true })`);
await page.waitForFunction(`window.__iglooInfo !== undefined`, null, { timeout: 60000 });
await page.waitForTimeout(5000); // assembly + textures + HDRI over the wire
const ap = await page.evaluate(`window.__iglooScreenPos()`);
for (let i = 0; i < 8; i++) { await page.mouse.move(ap.x + Math.cos(i*0.9)*42, ap.y + 30 + Math.sin(i*0.9)*30); await page.waitForTimeout(70); }
const hover = await page.evaluate(`window.__iglooInfo()`);
await page.screenshot({ path: 'qa/shots/live-v9.png' });
console.log({ live: true, ...hover, errors: errors.slice(0,3), failed: failed.slice(0,3) });
await browser.close();
