import { chromium } from 'playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-position=-2600,-2600','--disable-backgrounding-occluded-windows','--mute-audio','--no-first-run'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:4400', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`!document.getElementById('preloader')`, null, { timeout: 40000 }).catch(() => console.log('preloader stuck'));
await page.evaluate(`window.__lenis && window.__lenis.scrollTo(document.getElementById('igloo').offsetTop, { immediate: true })`);
await page.waitForTimeout(4000);
console.log({
  iglooInfo: await page.evaluate(`typeof window.__iglooInfo`),
  stageModes: await page.evaluate(`typeof window.__stageModes`),
  perfLevel: await page.evaluate(`window.__perfLevel ?? 'n/a'`),
  errors: errors.slice(0, 5),
});
await browser.close();
