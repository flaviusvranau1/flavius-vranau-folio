import { chromium } from 'playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-position=-2600,-2600','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--mute-audio','--no-first-run'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`!document.getElementById('preloader')`, null, { timeout: 40000 });
await page.evaluate(`window.__lenis.scrollTo(document.getElementById('igloo').offsetTop, { immediate: true })`);
await page.waitForFunction(`window.__iglooInfo !== undefined`, null, { timeout: 45000 });
await page.waitForTimeout(4500); // assembly + texture/HDRI swap-in
await page.screenshot({ path: 'qa/shots/v9-igloo-real.png' });
const ap = await page.evaluate(`window.__iglooScreenPos()`);
for (let i = 0; i < 8; i++) { await page.mouse.move(ap.x + Math.cos(i*0.9)*42, ap.y + 30 + Math.sin(i*0.9)*30); await page.waitForTimeout(70); }
await page.screenshot({ path: 'qa/shots/v9-igloo-real-hover.png' });
await browser.close();
console.log('shots saved');
