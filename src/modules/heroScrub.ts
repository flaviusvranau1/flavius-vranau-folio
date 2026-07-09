import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FrameSequence, framePaths } from './frameSequence';

/* Off-duty mountain beat: pinned canvas scrubbing the living-photo clip.
   Frames lazy-load when the section approaches; the fallback still covers until then. */

let seq: FrameSequence | null = null;
let framesReady = false;
let pinnedMode = true;
let activeTl: gsap.core.Timeline | null = null;
let extrasWired = false;

function wire(): void {
  const hero = document.getElementById('hero')!;
  activeTl?.scrollTrigger?.kill();
  activeTl?.kill();
  const state = { frame: 0 };
  activeTl = gsap.timeline({
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: pinnedMode ? '+=2600' : 'bottom top',
      scrub: 0.5,
      pin: pinnedMode,
      pinType: 'fixed',
      anticipatePin: 1,
    },
  });
  activeTl.to(
    state,
    {
      frame: seq!.total - 1,
      ease: 'none',
      snap: { frame: 1 },
      onUpdate: () => seq!.draw(state.frame),
      duration: 1,
    },
    0
  );
  (window as unknown as { __heroFrame: () => number }).__heroFrame = () => state.frame;
  const st = activeTl.scrollTrigger!;
  (window as unknown as { __heroST: () => object }).__heroST = () => ({
    start: st.start,
    end: st.end,
    progress: +st.progress.toFixed(3),
    scroll: st.scroll(),
    pinned: pinnedMode,
  });
  ScrollTrigger.refresh();
}

export function initHeroScrub(dir: string, frameCount: number, pinned: boolean, throttleMs = 0): void {
  pinnedMode = pinned;
  const hero = document.getElementById('hero')!;
  const canvas = document.getElementById('hero-canvas') as HTMLCanvasElement;

  if (!seq) {
    seq = new FrameSequence(canvas, framePaths(dir, frameCount));
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        seq!.load(undefined, throttleMs).then(() => {
          framesReady = true;
          seq!.resize();
          seq!.draw(0);
          hero.classList.add('is-live');
          wire();
        });
      },
      { rootMargin: '130% 0px' }
    );
    io.observe(hero);
  } else if (framesReady) {
    wire();
  }

  if (!extrasWired) {
    extrasWired = true;
    window.addEventListener('resize', () => seq?.resize());
    // cursor-following cool light over the snow (desktop pointers)
    if (window.matchMedia('(pointer: fine)').matches) {
      const light = document.getElementById('hero-light')!;
      const q = { x: 50, y: 40 };
      const target = { x: 50, y: 40 };
      hero.addEventListener('mousemove', (e) => {
        const r = hero.getBoundingClientRect();
        target.x = ((e.clientX - r.left) / r.width) * 100;
        target.y = ((e.clientY - r.top) / r.height) * 100;
      });
      gsap.ticker.add(() => {
        q.x += (target.x - q.x) * 0.06;
        q.y += (target.y - q.y) * 0.06;
        light.style.setProperty('--lx', `${q.x}%`);
        light.style.setProperty('--ly', `${q.y}%`);
      });
    }
  }
}
