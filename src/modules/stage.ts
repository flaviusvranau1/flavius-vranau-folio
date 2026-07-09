/* Stage coordinator: at any scroll position AT MOST ONE 3D scene renders its
   full post stack. Every 3D section registers here; one IntersectionObserver
   with fine thresholds tracks visibility, and the DOMINANT section (largest
   intersectionRatio) is the only one allowed to run its composer. Non-dominant
   scenes render plain (renderer.render, no post) while >=14% visible so
   handoffs stay alive, and pause entirely below that.

   igloo3d.ts is not editable right now: it keeps its own >=0.14 gate and its
   own composer. It is registered as an EXTERNAL stage — while it is visible
   the coordinator refuses 'full' to every controlled scene, so the "one full
   post stack" invariant holds even though we cannot pause the igloo itself.
   (One-line hook for the igloo agent, replacing its private observer:
      const mode = registerStage(section, () => undefined);
    then read mode() in its ticker — 'off' skips, 'plain' renderer.render,
    'full' post.render.) */

export type StageMode = 'off' | 'plain' | 'full';

type Entry = {
  el: Element;
  ratio: number;
  external: boolean;
  onMode: (m: StageMode) => void;
  mode: StageMode;
};

const MIN_VISIBLE = 0.14;
const entries: Entry[] = [];
let io: IntersectionObserver | null = null;

function recompute(): void {
  let dominant: Entry | null = null;
  let externalActive = false;
  for (const e of entries) {
    if (e.ratio < MIN_VISIBLE) continue;
    if (e.external) externalActive = true;
    if (!dominant || e.ratio > dominant.ratio) dominant = e;
  }
  for (const e of entries) {
    if (e.external) continue; // external stages gate themselves
    const mode: StageMode =
      e.ratio < MIN_VISIBLE ? 'off' : e === dominant && !externalActive ? 'full' : 'plain';
    if (mode !== e.mode) {
      e.mode = mode;
      e.onMode(mode);
    }
  }
  // QA hook
  (window as unknown as { __stageModes: Record<string, string> }).__stageModes = Object.fromEntries(
    entries.map((e) => [e.el.id || 'anon', e.external ? `ext:${e.ratio.toFixed(2)}` : e.mode])
  );
}

function ensureIO(): IntersectionObserver {
  if (!io) {
    // fine thresholds so dominance flips close to the true 50/50 crossover
    const thresholds = Array.from({ length: 21 }, (_, i) => i / 20);
    io = new IntersectionObserver(
      (obs) => {
        for (const en of obs) {
          const e = entries.find((x) => x.el === en.target);
          if (e) e.ratio = en.isIntersecting ? en.intersectionRatio : 0;
        }
        recompute();
      },
      { threshold: thresholds }
    );
  }
  return io;
}

/** Register a controlled 3D scene. Returns a getter for the current mode;
 *  onMode fires on every transition (including the initial one). */
export function registerStage(el: Element, onMode: (m: StageMode) => void): () => StageMode {
  const entry: Entry = { el, ratio: 0, external: false, onMode, mode: 'off' };
  entries.push(entry);
  ensureIO().observe(el);
  return () => entry.mode;
}

/** Register a scene the coordinator cannot pause (it keeps its own gate).
 *  While it is visible, no controlled scene is granted 'full'. */
export function registerExternalStage(el: Element): void {
  entries.push({ el, ratio: 0, external: true, onMode: () => undefined, mode: 'off' });
  ensureIO().observe(el);
}
