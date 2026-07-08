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
      const done = () => {
        this.loaded++;
        onProgress?.(this.loaded, this.total);
        if (this.loaded === this.total) resolve();
      };
      const start = (i: number) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => (throttleMs ? setTimeout(done, throttleMs) : done());
        img.onerror = done;
        img.src = this.paths[i];
        this.images[i] = img;
      };
      this.paths.forEach((_, i) =>
        throttleMs ? setTimeout(() => start(i), i * throttleMs) : start(i)
      );
    });
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth, clientHeight } = this.canvas;
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
