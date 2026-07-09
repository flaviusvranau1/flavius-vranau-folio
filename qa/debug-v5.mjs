import { chromium } from 'playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-position=-2600,-2600','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--mute-audio','--no-first-run'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`!document.getElementById('preloader')`, null, { timeout: 40000 });
await page.waitForTimeout(1500);

// DESK
const deskTop = await page.evaluate(`document.getElementById('desk').offsetTop`);
await page.evaluate(`window.__lenis.scrollTo(${deskTop}, { immediate: true })`);
await page.waitForFunction(`window.__deskInfo !== undefined`, null, { timeout: 45000 });
await page.waitForTimeout(3000);
console.log('scrollY vs deskTop:', await page.evaluate('Math.round(scrollY)'), deskTop);
const lp = await page.evaluate(`window.__deskScreenPos('classic_laptop')`);
console.log('laptop screen pos', lp);
await page.mouse.move(lp.x, lp.y);
await page.waitForTimeout(1000);
console.log('hover:', await page.evaluate(`window.__deskInfo()`));
await page.mouse.move(720, 60);
for (let i = 0; i < 5; i++) { await page.waitForTimeout(600); console.log('settle', i, await page.evaluate(`JSON.stringify(window.__deskInfo())`)); }

// MOUNTAIN
const heroTop = await page.evaluate(`document.getElementById('hero').offsetTop`);
await page.evaluate(`window.__lenis.scrollTo(${heroTop - 400}, { immediate: true })`);
await page.waitForFunction(`document.getElementById('hero').classList.contains('is-live')`, null, { timeout: 30000 });
await page.waitForTimeout(800);
console.log('heroST after wire:', await page.evaluate(`window.__heroST()`), 'heroTopNow:', await page.evaluate(`document.getElementById('hero').offsetTop`));
await page.evaluate(`window.__lenis.scrollTo(document.getElementById('hero').offsetTop + 1300, { immediate: true })`);
for (let i = 0; i < 5; i++) { await page.waitForTimeout(500); console.log('mt', i, await page.evaluate(`window.__heroST()`), 'frame', await page.evaluate(`Math.round(window.__heroFrame())`)); }
await browser.close();
