import gsap from 'gsap';

/** Animated film grain: pre-rendered noise tiles cycled at ~10fps. */
export function initGrain(): void {
  const canvas = document.getElementById('grain') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TILE = 256;
  const tiles: HTMLCanvasElement[] = [];
  for (let t = 0; t < 4; t++) {
    const tile = document.createElement('canvas');
    tile.width = TILE;
    tile.height = TILE;
    const tctx = tile.getContext('2d')!;
    const data = tctx.createImageData(TILE, TILE);
    for (let i = 0; i < data.data.length; i += 4) {
      const v = Math.random() * 255;
      data.data[i] = v;
      data.data[i + 1] = v;
      data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
    tctx.putImageData(data, 0, 0);
    tiles.push(tile);
  }

  let frame = 0;
  const resize = () => {
    canvas.width = Math.ceil(innerWidth / 2);
    canvas.height = Math.ceil(innerHeight / 2);
    paint();
  };
  const paint = () => {
    const pattern = ctx.createPattern(tiles[frame % tiles.length], 'repeat')!;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };
  window.addEventListener('resize', resize);
  resize();

  if (reduced) return;

  // Ride the shared gsap.ticker (one rAF loop app-wide; rAF pauses when the tab is hidden)
  let last = 0;
  gsap.ticker.add((time) => {
    if (time - last < 0.1) return; // ~10fps is enough for grain
    last = time;
    frame++;
    paint();
  });
}
