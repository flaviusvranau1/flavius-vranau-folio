/** Frame-sequence loader + DPR-capped cover-fit canvas drawing. */
export class FrameSequence {
  images: HTMLImageElement[] = [];
  loaded = 0;
  total: number;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentIndex = -1;

  constructor(canvas: HTMLCanvasElement, private paths: string[]) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.total = paths.length;
  }

  load(onProgress?: (loaded: number, total: number) => void, throttleMs = 0): Promise<void> {
    return new Promise((resolve) => {
      if (this.total === 0) return resolve();
      // pooled loading: a handful of images in flight at a time — 120 parallel
      // downloads+decodes stampede a throttled CPU into single-digit fps
      const POOL = 4;
      let next = 0;
      const done = () => {
        this.loaded++;
        onProgress?.(this.loaded, this.total);
        if (this.loaded === this.total) resolve();
        else pump();
      };
      const pump = () => {
        if (next >= this.total) return;
        const i = next++;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          // decode off the render path NOW, paced by the pool
          const fin = () => (throttleMs ? setTimeout(done, throttleMs) : done());
          img.decode ? img.decode().then(fin, fin) : fin();
        };
        img.onerror = done;
        img.src = this.paths[i];
        this.images[i] = img;
      };
      for (let k = 0; k < Math.min(POOL, this.total); k++) pump();
    });
  }

  resize(): void {
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth, clientHeight } = this.canvas;
    // Never allocate more backing pixels than the source frames can resolve:
    // painting a DPR-2 buffer from 1600px frames costs 2-4x the fill for zero
    // visible sharpness. min(iw/cssW, ih/cssH) is the DPR at which the visible
    // cover-fit region maps ~1:1 to source pixels.
    const first = this.images.find((im) => im && im.naturalWidth > 0);
    if (first && clientWidth > 0 && clientHeight > 0) {
      const useful = Math.min(first.naturalWidth / clientWidth, first.naturalHeight / clientHeight);
      dpr = Math.max(1, Math.min(dpr, useful));
    }
    this.canvas.width = Math.round(clientWidth * dpr);
    this.canvas.height = Math.round(clientHeight * dpr);
    if (this.currentIndex >= 0) this.draw(this.currentIndex);
  }

  draw(index: number): void {
    const i = Math.max(0, Math.min(this.total - 1, Math.round(index)));
    const img = this.images[i];
    if (!img || !img.naturalWidth) return;
    this.currentIndex = i;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    this.ctx.clearRect(0, 0, cw, ch);
    this.ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }
}

export function framePaths(dir: string, count: number, ext = 'webp'): string[] {
  return Array.from({ length: count }, (_, i) => `${dir}/frame-${String(i + 1).padStart(3, '0')}.${ext}`);
}
