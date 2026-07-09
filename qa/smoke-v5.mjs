/* V5 smoke: particle name, 3D phone corridor, desk lift — numeric checks + shots. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots') + path.sep;
fs.mkdirSync(SHOTS, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: false,
  args: ['--window-position=-2600,-2600', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--mute-audio', '--no-first-run'],
});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
const failed = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));

const note = (name, pass, detail) => console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);

await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`!document.getElementById('preloader')`, null, { timeout: 40000 });
await page.waitForTimeout(2600); // intro assembly settles

// --- 1. name particles
const nameCount = await page.evaluate(`window.__nameInfo ? window.__nameInfo().count : 0`);
await page.screenshot({ path: SHOTS + 'v5-intro.png' });
// sweep the cursor through the middle of the name
for (let i = 0; i <= 10; i++) {
  await page.mouse.move(300 + i * 90, 430 + Math.sin(i) * 10);
  await page.waitForTimeout(40);
}
const maxOffHover = await page.evaluate(`window.__nameInfo().maxOff`);
await page.screenshot({ path: SHOTS + 'v5-intro-hover.png' });
await page.mouse.move(60, 60);
await page.waitForTimeout(2600);
const maxOffAfter = await page.evaluate(`window.__nameInfo().maxOff`);
note('name particles react + settle', nameCount > 3000 && maxOffHover > 0.25 && maxOffAfter < 0.2, `n=${nameCount} hover=${maxOffHover.toFixed(2)} settle=${maxOffAfter.toFixed(3)}`);

// --- 2. phone
const phoneTop = await page.evaluate(`document.getElementById('phone').offsetTop`);
await page.evaluate(`window.__lenis.scrollTo(${phoneTop}, { immediate: true })`);
await page.waitForTimeout(3200); // boot + icon fly-in
await page.screenshot({ path: SHOTS + 'v5-phone.png' });
for (let i = 0; i <= 12; i++) {
  await page.mouse.move(720 - 140 + i * 24, 300 + i * 26);
  await page.waitForTimeout(50);
}
const phoneInfo = await page.evaluate(`window.__phoneInfo ? window.__phoneInfo() : null`);
await page.screenshot({ path: SHOTS + 'v5-phone-hover.png' });
await page.mouse.move(100, 100);
await page.waitForTimeout(2200);
const phoneAfter = await page.evaluate(`window.__phoneInfo().maxOff`);
note('phone icons dodge, stay in frame, settle', phoneInfo && phoneInfo.maxOff > 0.12 && phoneInfo.outOfBounds === 0 && phoneAfter < 0.06, JSON.stringify(phoneInfo) + ` settle=${phoneAfter?.toFixed(3)}`);

// --- 3. desk
const deskTop = await page.evaluate(`document.getElementById('desk').offsetTop`);
await page.evaluate(`window.__lenis.scrollTo(${deskTop}, { immediate: true })`);
await page.waitForFunction(`window.__deskInfo !== undefined`, null, { timeout: 45000 });
await page.waitForTimeout(3500); // drop-in intro
await page.screenshot({ path: SHOTS + 'v5-desk.png' });
const lp = await page.evaluate(`window.__deskScreenPos('classic_laptop')`);
if (lp) {
  await page.mouse.move(lp.x, lp.y);
  await page.waitForTimeout(900);
}
const lifted = await page.evaluate(`window.__deskInfo()['classic_laptop']`);
await page.screenshot({ path: SHOTS + 'v5-desk-hover.png' });
await page.mouse.move(1400, 880); // genuinely empty corner, far from every proxy
await page.waitForTimeout(1800);
const settled = await page.evaluate(`window.__deskInfo()['classic_laptop']`);
note('desk laptop lifts on hover + settles', lifted > 0.05 && Math.abs(settled) < 0.03, `lift=${lifted} settle=${settled}`);

// --- 4. mountain scrub still works (moved down)
const heroTop = await page.evaluate(`document.getElementById('hero').offsetTop`);
await page.evaluate(`window.__lenis.scrollTo(${heroTop - 400}, { immediate: true })`);
await page.waitForFunction(`document.getElementById('hero').classList.contains('is-live')`, null, { timeout: 30000 });
// after pinning, offsetTop is spacer-relative — scroll by the trigger's real start
await page.evaluate(`window.__lenis.scrollTo(window.__heroST().start + 1300, { immediate: true })`);
let frame = -1;
for (let i = 0; i < 20 && frame <= 20; i++) {
  await page.waitForTimeout(400);
  frame = await page.evaluate(`window.__heroFrame ? Math.round(window.__heroFrame()) : -1`);
}
await page.screenshot({ path: SHOTS + 'v5-mountain.png' });
note('mountain scrub (lazy, mid-page)', frame > 20, `frame=${frame}`);

// --- 5. bottom + errors
await page.evaluate(`window.__lenis.scrollTo(document.documentElement.scrollHeight, { immediate: true })`);
await page.waitForTimeout(1500);
await page.screenshot({ path: SHOTS + 'v5-contact.png' });
const overflow = await page.evaluate(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
note('no horizontal overflow', overflow <= 0, `excess=${overflow}`);
note('zero console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
note('no failed requests', failed.length === 0, failed.slice(0, 5).join(' | '));

await browser.close();
