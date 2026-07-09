/* Natural-motion probe: samples the bump height over time during attack & release. */
import { chromium } from 'playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-position=-2600,-2600','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--mute-audio','--no-first-run'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`!document.getElementById('preloader')`, null, { timeout: 40000 });
await page.evaluate(`window.__lenis.scrollTo(document.getElementById('igloo').offsetTop, { immediate: true })`);
await page.waitForFunction(`window.__iglooInfo !== undefined`, null, { timeout: 45000 });
await page.waitForTimeout(3200); // assembly settles
const ap = await page.evaluate(`window.__iglooScreenPos()`);
const lift = () => page.evaluate(`window.__iglooInfo().maxLift`);

// pre-position far away, let everything seat
await page.mouse.move(1400, 880);
await page.waitForTimeout(1500);

// ATTACK: jump the cursor onto the apex, sample every 100ms
await page.mouse.move(ap.x, ap.y + 25);
const attack = [];
for (let i = 0; i <= 6; i++) { attack.push(+(await lift()).toFixed(3)); await page.waitForTimeout(100); }

// hold, then RELEASE: move far away, sample the decay
await page.waitForTimeout(500);
const peak = +(await lift()).toFixed(3);
await page.mouse.move(1400, 880);
const release = [];
for (let i = 0; i <= 14; i++) { release.push(+(await lift()).toFixed(3)); await page.waitForTimeout(100); }

console.log({ attack, peak, release });
const attackFast = attack[3] > peak * 0.7;            // ~70%+ height within ~300ms
const releaseSlower = release[3] > peak * 0.18;       // still coming down at 300ms — slower than attack
const settled = release[12] < 0.02;                    // seated by ~1.2s
console.log({ attackFast, releaseSlower, settled, verdict: attackFast && releaseSlower && settled ? 'NATURAL' : 'CHECK' });
await browser.close();
