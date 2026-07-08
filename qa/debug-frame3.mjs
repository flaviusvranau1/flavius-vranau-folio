import { chromium } from 'playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`document.getElementById('hero')?.classList.contains('is-live')`, null, { timeout: 60000 });
await page.waitForTimeout(2000);
const hashNow = `(() => { const c = document.getElementById('hero-canvas'); const d = c.getContext('2d').getImageData(0, Math.floor(c.height/2), 600, 2).data; let h=0; for (let i=0;i<d.length;i+=16) h=(h*31+d[i])>>>0; return h; })()`;
await page.evaluate(`window.__lenis.scrollTo(1500, {immediate:true})`);
await page.waitForTimeout(1500);
await page.evaluate(`window.__lenis.scrollTo(0, {immediate:true})`);
await page.waitForTimeout(1800);
const returned = await page.evaluate(hashNow);
console.log('returned-state hash', returned);
// hash frames 1..6 drawn manually on an offscreen canvas of same size
const probe = `(async () => {
  const ref = document.getElementById('hero-canvas');
  const out = {};
  for (let f = 1; f <= 6; f++) {
    const img = new Image();
    img.src = './frames/frame-' + String(f).padStart(3, '0') + '.webp';
    await new Promise(r => img.onload = r);
    const c = document.createElement('canvas'); c.width = ref.width; c.height = ref.height;
    const ctx = c.getContext('2d');
    const scale = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
    ctx.drawImage(img, (c.width - img.naturalWidth*scale)/2, (c.height - img.naturalHeight*scale)/2, img.naturalWidth*scale, img.naturalHeight*scale);
    const d = ctx.getImageData(0, Math.floor(c.height/2), 600, 2).data;
    let hh = 0; for (let i = 0; i < d.length; i += 16) hh = (hh*31+d[i])>>>0;
    out[f] = hh;
  }
  return out;
})()`;
console.log('frame hashes', await page.evaluate(probe));
await browser.close();
