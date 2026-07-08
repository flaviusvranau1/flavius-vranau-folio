import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

export let lenis: Lenis | null = null;

export function initSmoothScroll(reduced: boolean): void {
  if (reduced) return;
  lenis = new Lenis({
    lerp: 0.1,
    smoothWheel: true,
    syncTouch: false,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis!.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);
  // Exposed for QA tooling (deterministic programmatic scrolling)
  (window as unknown as { __lenis: Lenis }).__lenis = lenis;
}
