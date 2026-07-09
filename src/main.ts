import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles/main.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

import { initI18n } from './modules/i18n';
import { initSmoothScroll } from './modules/scroll';
import { setPreloadProgress, finishPreloader } from './modules/preloader';
import { initCursor } from './modules/cursor';
import { initGrain } from './modules/grain';
import { initHeroScrub } from './modules/heroScrub';
import { initMomentSweep } from './modules/momentSweep';
import { initDepthPortrait } from './modules/depthPortrait';
import { initManifesto, initCraft, initWork, initStory, initContact, initStickyCta } from './modules/sections';

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

function revealIntroMeta(): void {
  gsap.to('.intro__meta', { opacity: 1, duration: 1.1, ease: 'power2.out', delay: 0.9 });
  gsap.to('#intro-hint', { opacity: 1, duration: 0.9, delay: 1.4 });
}

async function boot(): Promise<void> {
  // ?slowload=<ms> throttles the mountain frames for QA of lazy loading
  const throttle = Number(new URLSearchParams(location.search).get('slowload')) || 0;

  if (reduced || mobile) {
    // Static-first experience: name as text, no 3D stages, no pins on mobile.
    setPreloadProgress(1);
    await finishPreloader(reduced);
    revealIntroMeta();
    if (!reduced) {
      // mobile keeps the light unpinned mountain scrub + reveals
      initHeroScrub('./frames/mobile', HERO_FRAMES_MOBILE, false, throttle);
      initMomentSweep(false, './sweep/mobile', SWEEP_FRAMES_MOBILE);
      initManifesto();
      initCraft(false);
      initWork(false);
      initStory();
    } else {
      document.getElementById('moment-canvas')!.style.display = 'none';
      (document.getElementById('moment-pin') as HTMLElement).style.background =
        'url(./portrait-depth-src.jpg) center / cover no-repeat';
    }
    initContact(!reduced);
    initStickyCta(!reduced);
    ScrollTrigger.refresh();
    return;
  }

  // Desktop: the 3D stages load as async chunks — mobile never parses three.js
  const [{ initNameParticles }, { initPhone3d }, { initIgloo3d }] = await Promise.all([
    import('./modules/nameParticles'),
    import('./modules/phone3d'),
    import('./modules/igloo3d'),
  ]);

  // the preloader tracks fonts + the particle-name build (fast, honest)
  setPreloadProgress(0.15);
  await document.fonts.ready;
  setPreloadProgress(0.55);
  await initNameParticles();
  setPreloadProgress(1);
  await finishPreloader(false);
  revealIntroMeta();

  ScrollTrigger.saveStyles(
    '.manifesto__line, .craft__row, .craft__title, .craft__stack, .card, .work__track, .story__step, .moment__title'
  );

  initPhone3d();
  initIgloo3d(); // registers itself with the stage coordinator (off/plain/full)
  initHeroScrub('./frames', HERO_FRAMES_DESKTOP, true, throttle);
  initMomentSweep(true, './sweep', SWEEP_FRAMES_DESKTOP);
  initDepthPortrait();
  initManifesto();
  initCraft(true);
  initWork(true);
  initStory();
  initContact(true);
  initStickyCta(true);

  ScrollTrigger.refresh();
}

boot();
