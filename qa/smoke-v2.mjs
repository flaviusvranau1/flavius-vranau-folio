import { chromium } from 'playwright-core';
import fs from 'node:fs';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-position=-2600,-2600','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--mute-audio','--no-first-run'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`document.getElementById('hero')?.classList.contains('is-live')`, null, { timeout: 60000 });
await page.waitForTimeout(2000);
// craft: 5 rows
const rows = await page.evaluate(`document.querySelectorAll('.craft__row').length`);
// story: 5 steps with years
const years = await page.evaluate(`[...document.querySelectorAll('.story__year')].map(y => y.textContent)`);
// links
const links = await page.evaluate(`[...document.querySelectorAll('.contact__links a')].map(a => a.href)`);
const mail = await page.evaluate(`document.getElementById('contact-mail').href`);
console.log({ rows, years, links, mail });
// depth section screenshot (mountain)
const depthTop = await page.evaluate(`document.querySelector('#depth').offsetTop`);
await page.evaluate(`window.__lenis.scrollTo(${'"'}${'"'} + 0, {immediate:true})`).catch(()=>{});
await page.evaluate(`window.__lenis.scrollTo(document.querySelector('#depth').offsetTop - 100, {immediate:true})`);
await page.waitForTimeout(2500);
await page.screenshot({ path: 'qa/shots/v2-depth-mountain.png' });
// story screenshot
await page.evaluate(`window.__lenis.scrollTo(document.querySelector('#story').offsetTop + 400, {immediate:true})`);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'qa/shots/v2-story.png' });
console.log('errors:', errors);
await browser.close();
