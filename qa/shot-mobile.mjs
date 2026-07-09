import { chromium } from 'playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-position=-2600,-2600','--disable-backgrounding-occluded-windows','--mute-audio','--no-first-run'] });
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`!document.getElementById('preloader')`, null, { timeout: 30000 });
await page.waitForTimeout(1200);
const state = await page.evaluate(`({
  fallbackShown: getComputedStyle(document.getElementById('intro-fallback')).display !== 'none',
  phoneHidden: getComputedStyle(document.getElementById('phone')).display === 'none',
  deskHidden: getComputedStyle(document.getElementById('desk')).display === 'none',
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`);
await page.screenshot({ path: 'qa/shots/v5-mobile.png' });
console.log(state, 'errors:', errors.length);
await browser.close();
