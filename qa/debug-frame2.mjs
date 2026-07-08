import { chromium } from 'playwright-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`document.getElementById('hero')?.classList.contains('is-live')`, null, { timeout: 60000 });
await page.waitForTimeout(2000);
const hash = `(() => { const c = document.getElementById('hero-canvas'); const d = c.getContext('2d').getImageData(0, Math.floor(c.height/2), 600, 2).data; let h=0; for (let i=0;i<d.length;i+=16) h=(h*31+d[i])>>>0; return h; })()`;
console.log('initial      ', await page.evaluate(hash));
// manual redraw of frame-001 with identical cover-fit math
const manual = `new Promise(res => {
  const c = document.getElementById('hero-canvas');
  const ctx = c.getContext('2d');
  const img = new Image();
  img.onload = () => {
    const scale = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    const d = ctx.getImageData(0, Math.floor(c.height/2), 600, 2).data;
    let hh = 0; for (let i = 0; i < d.length; i += 16) hh = (hh*31+d[i])>>>0;
    res(hh);
  };
  img.src = './frames/frame-001.webp';
})`;
console.log('manual redraw', await page.evaluate(manual));
console.log('after manual ', await page.evaluate(hash));
await browser.close();
