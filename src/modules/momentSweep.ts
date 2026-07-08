import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FrameSequence, framePaths } from './frameSequence';

let seq: FrameSequence | null = null;
let framesReady = false;
let pinnedMode = true;
let activeTl: gsap.core.Timeline | null = null;
let resizeHooked = false;

function wire(): void {
  const section = document.getElementById('moment')!;
  activeTl?.scrollTrigger?.kill();
  activeTl?.kill();
  const state = { frame: 0 };
  activeTl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: pinnedMode ? '+=2000' : 'bottom top',
      scrub: 0.5,
      pin: pinnedMode ? '#moment-pin' : false,
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
  // Headline wipes in sync with the light sweep; the speaking stat follows
  activeTl.fromTo(
    '#moment-title',
    { clipPath: 'inset(0 100% 0 0)' },
    { clipPath: 'inset(0 0% 0 0)', ease: 'none', duration: 0.55 },
    0.18
  );
  activeTl.fromTo(
    '#moment-sub',
    { autoAlpha: 0, y: 14 },
    { autoAlpha: 1, y: 0, ease: 'none', duration: 0.2 },
    0.62
  );
  // A late-created pin changes page height; keep trigger positions truthful.
  ScrollTrigger.refresh();
}

/** Portrait moment 2a: pinned beat scrubbing the light-sweep clip (Clip B).
 *  Frames load once (lazily); the scrub timeline is (re)built per breakpoint context. */
export function initMomentSweep(pinned: boolean, dir: string, frameCount: number): void {
  pinnedMode = pinned;
  const section = document.getElementById('moment')!;
  const canvas = document.getElementById('moment-canvas') as HTMLCanvasElement;
  gsap.set('#moment-title', { clipPath: 'inset(0 100% 0 0)' });
  gsap.set('#moment-sub', { autoAlpha: 0 });

  if (!seq) {
    seq = new FrameSequence(canvas, framePaths(dir, frameCount));
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        seq!.load().then(() => {
          framesReady = true;
          seq!.resize();
          seq!.draw(0);
          wire();
        });
      },
      { rootMargin: '120% 0px' }
    );
    io.observe(section);
  } else if (framesReady) {
    wire();
  }
  // If frames are still loading, load() above wires with the latest pinnedMode.

  if (!resizeHooked) {
    resizeHooked = true;
    window.addEventListener('resize', () => seq?.resize());
  }
}
