/* Natural-motion probe: attack, LIVING HOLD (levitation shimmer), release.
   The hold window must oscillate — a parked cluster is a dead cluster. */
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
for (let i = 0; i <= 6; i++) { attack.push(+(await lift()).toFixed(4)); await page.waitForTimeout(100); }

// HOLD: keep the cursor dead-still for 2.5s — the levitation must stay ALIVE
const hold = [];
for (let i = 0; i < 25; i++) { hold.push(+(await lift()).toFixed(4)); await page.waitForTimeout(100); }
const peak = Math.max(...attack, ...hold);
const mean = hold.reduce((a, b) => a + b, 0) / hold.length;
const holdStd = Math.sqrt(hold.reduce((a, b) => a + (b - mean) ** 2, 0) / hold.length);

// RELEASE: move far away, sample the decay
await page.mouse.move(1400, 880);
const release = [];
for (let i = 0; i <= 15; i++) { release.push(+(await lift()).toFixed(4)); await page.waitForTimeout(100); }

console.log({ attack, holdStd: +holdStd.toFixed(4), peak, release });
const attackFast = attack[4] > peak * 0.7;             // ~70%+ of peak within ~400ms
const holdAlive = holdStd > 0.006 && holdStd < 0.05;   // shimmers, doesn't jitter
const releaseSlower = release[3] > peak * 0.15;        // still coming down at 300ms — slower than attack
const settled = release[15] < 0.02;                    // seated by ~1.5s
console.log({ attackFast, holdAlive, releaseSlower, settled, verdict: attackFast && holdAlive && releaseSlower && settled ? 'NATURAL' : 'CHECK' });
await browser.close();
