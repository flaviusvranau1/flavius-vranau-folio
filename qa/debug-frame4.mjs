import { chromium } from 'playwright-core';
import fs from 'node:fs';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('http://localhost:5199/?slowload=60', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`document.getElementById('hero')?.classList.contains('is-live')`, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const dump = async (name) => {
  const url = await page.evaluate(`document.getElementById('hero-canvas').toDataURL('image/png')`);
  fs.writeFileSync('qa/shots/' + name, Buffer.from(url.split(',')[1], 'base64'));
  return page.evaluate(`(() => { const c = document.getElementById('hero-canvas'); const d = c.getContext('2d').getImageData(0, Math.floor(c.height/2), 600, 2).data; let h=0; for (let i=0;i<d.length;i+=16) h=(h*31+d[i])>>>0; return {h, frame: window.__heroFrame()}; })()`);
};
console.log('initial', await dump('c0-initial.png'));
// replicate verify sequence incl. screenshot
await page.evaluate(`window.__lenis.scrollTo(1500, {immediate:true})`); await page.waitForTimeout(1200);
await page.screenshot({ path: 'qa/shots/c-tmp.png' });
await page.evaluate(`window.__lenis.scrollTo(2900, {immediate:true})`); await page.waitForTimeout(1200);
await page.evaluate(`window.__lenis.scrollTo(1500, {immediate:true})`); await page.waitForTimeout(1200);
await page.evaluate(`window.__lenis.scrollTo(0, {immediate:true})`); await page.waitForTimeout(2000);
console.log('returned', await dump('c1-returned.png'));
console.log('scrollY', await page.evaluate('window.scrollY'), 'lenisTarget', await page.evaluate('window.__lenis.targetScroll'), 'lenisAnimated', await page.evaluate('window.__lenis.animatedScroll'));
await browser.close();
