import '@fontsource/anton';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles/main.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

import { initI18n } from './modules/i18n';
import { initSmoothScroll } from './modules/scroll';
import { FrameSequence, framePaths } from './modules/frameSequence';
import { setPreloadProgress, finishPreloader } from './modules/preloader';
import { initCursor } from './modules/cursor';
import { initGrain } from './modules/grain';
import { playHeroIntro, initHeroScrub } from './modules/heroScrub';
import { initMomentSweep } from './modules/momentSweep';
import { initDepthPortrait } from './modules/depthPortrait';
import { initManifesto, initCraft, initWork, initLazyThumbs, initStory, initContact, initStickyCta } from './modules/sections';

gsap.registerPlugin(ScrollTrigger, SplitText);

const HERO_FRAMES_DESKTOP = 120;
const HERO_FRAMES_MOBILE = 60;
const SWEEP_FRAMES_DESKTOP = 72;
const SWEEP_FRAMES_MOBILE = 48;

const reduced =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
  new URLSearchParams(location.search).has('reduced');
const mobile = window.innerWidth < 768;

document.getElementById('year')!.textContent = String(new Date().getFullYear());
initI18n();
initGrain();
initCursor();
initSmoothScroll(reduced);

async function boot(): Promise<void> {
  if (reduced) {
    // Static experience: hero stays on frame 001 (the fallback still), no scrub, no parallax.
    document.getElementById('moment-canvas')!.style.display = 'none';
    (document.getElementById('moment-pin') as HTMLElement).style.background =
      'url(./portrait-hero.jpg) center / cover no-repeat';
    await finishPreloader(true);
    initLazyThumbs();
    initContact(false);
    initStickyCta(false);
    ScrollTrigger.refresh();
    return;
  }

  // Real preload: the hero frame set drives the counter
  const heroDir = mobile ? './frames/mobile' : './frames';
  const heroCount = mobile ? HERO_FRAMES_MOBILE : HERO_FRAMES_DESKTOP;
  const canvas = document.getElementById('hero-canvas') as HTMLCanvasElement;
  const seq = new FrameSequence(canvas, framePaths(heroDir, heroCount));

  // ?slowload=<ms> throttles loading for QA of the preloader counter
  const throttle = Number(new URLSearchParams(location.search).get('slowload')) || 0;
  await seq.load((loaded, total) => setPreloadProgress(loaded / total), throttle);
  await finishPreloader(false);

  playHeroIntro();

  ScrollTrigger.saveStyles(
    '.manifesto__line, .craft__row, .craft__title, .craft__stack, .card, .work__track, .story__step, .hero__content, #hero-hint, .moment__title'
  );

  const mm = gsap.matchMedia();
  mm.add('(min-width: 768px)', () => {
    initHeroScrub(seq, true);
    initCraft(true);
    initWork(true);
    initMomentSweep(true, mobile ? './sweep/mobile' : './sweep', mobile ? SWEEP_FRAMES_MOBILE : SWEEP_FRAMES_DESKTOP);
    initDepthPortrait();
  });
  mm.add('(max-width: 767px)', () => {
    initHeroScrub(seq, false);
    initCraft(false);
    initWork(false);
    initMomentSweep(false, mobile ? './sweep/mobile' : './sweep', mobile ? SWEEP_FRAMES_MOBILE : SWEEP_FRAMES_DESKTOP);
    // No heavy WebGL below 768px — the static depth fallback image stays visible
  });

  initManifesto();
  initStory();
  initContact(true);
  initStickyCta(true);

  ScrollTrigger.refresh();
}

boot();
