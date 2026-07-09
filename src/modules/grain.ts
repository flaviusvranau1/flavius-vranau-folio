/** Animated film grain: noise is painted ONCE (half resolution, oversized by
 *  the animation travel), then cycled at ~10fps by a compositor-only steps()
 *  transform animation (.grain--animated in main.css). Replaces the old
 *  10fps fullscreen createPattern repaint — zero per-frame JS/paint work. */
export function initGrain(): void {
  const canvas = document.getElementById('grain') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // One 512px noise tile — white noise tiles seamlessly for all practical purposes.
  const TILE = 512;
  const tile = document.createElement('canvas');
  tile.width = tile.height = TILE;
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

  // Buffer at half resolution (as before). The animated canvas is 512 CSS px
  // (= 256 buffer px) larger than the viewport so the steps() translation
  // never exposes an edge.
  const OVERDRAW = reduced ? 0 : 256;
  const resize = () => {
    canvas.width = Math.ceil(innerWidth / 2) + OVERDRAW;
    canvas.height = Math.ceil(innerHeight / 2) + OVERDRAW;
    const pattern = ctx.createPattern(tile, 'repeat')!;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };
  window.addEventListener('resize', resize);
  resize();

  if (reduced) return; // static grain, exactly as before
  canvas.classList.add('grain--animated');
}
