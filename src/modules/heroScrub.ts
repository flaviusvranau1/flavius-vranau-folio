import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { FrameSequence } from './frameSequence';

/** Intro: name tracks in letter by letter, tagline fades up, hint appears. */
export function playHeroIntro(): void {
  const title = document.getElementById('hero-title')!;
  const split = new SplitText(title, { type: 'chars', charsClass: 'char' });
  gsap.timeline()
    .from(split.chars, {
      yPercent: 105,
      opacity: 0,
      letterSpacing: '0.2em',
      duration: 1.1,
      ease: 'power3.out',
      stagger: 0.035,
    })
    .to('#hero-tagline', { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, '-=0.55')
    .to('#hero-hint', { opacity: 1, duration: 0.8 }, '-=0.4');
  gsap.set('#hero-tagline', { y: 18 });
}

let extrasWired = false;

/** Pinned hero: scroll scrubs the living-portrait frames 0 → N-1. */
export function initHeroScrub(seq: FrameSequence, pinned: boolean): void {
  const hero = document.getElementById('hero')!;
  const canvas = document.getElementById('hero-canvas') as HTMLCanvasElement;

  seq.resize();
  seq.draw(0);
  hero.classList.add('is-live');

  // One timeline owns the pin: frame scrub + text beats share the same scroll distance
  const state = { frame: 0 };
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: pinned ? '+=3000' : 'bottom top',
      scrub: 0.5,
      pin: pinned,
      pinType: 'fixed',
      anticipatePin: 1,
    },
  });
  tl.to(
    state,
    {
      frame: seq.total - 1,
      ease: 'none',
      snap: { frame: 1 },
      onUpdate: () => seq.draw(state.frame),
      duration: 1,
    },
    0
  );
  if (pinned) {
    tl.to('#hero-hint', { autoAlpha: 0, duration: 0.08, ease: 'none' }, 0.03);
    tl.to('.hero__content', { yPercent: -22, autoAlpha: 0, duration: 0.3, ease: 'none' }, 0.64);
  }
  // QA hook: current scrubbed frame index
  (window as unknown as { __heroFrame: () => number }).__heroFrame = () => state.frame;

  // One-time listeners (matchMedia contexts may re-run this init)
  if (extrasWired) return;
  extrasWired = true;
  window.addEventListener('resize', () => seq.resize());

  // Cursor-following warm light over the hero (desktop only)
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

  void canvas;
}
