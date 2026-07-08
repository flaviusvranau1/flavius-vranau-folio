import gsap from 'gsap';

const el = () => document.getElementById('preloader')!;
const countEl = () => document.getElementById('preload-count')!;
const barEl = () => document.getElementById('preload-bar')!;

let displayed = 0;

/** Update the counter toward the real loading ratio (never backwards). */
export function setPreloadProgress(ratio: number): void {
  const target = Math.round(ratio * 100);
  if (target <= displayed) return;
  displayed = target;
  countEl().textContent = String(target);
  barEl().style.transform = `scaleX(${ratio})`;
}

/** Wipe the preloader away. Resolves when the hero is fully visible. */
export function finishPreloader(reduced: boolean): Promise<void> {
  setPreloadProgress(1);
  return new Promise((resolve) => {
    if (reduced) {
      gsap.to(el(), {
        autoAlpha: 0,
        duration: 0.4,
        onComplete: () => {
          el().remove();
          resolve();
        },
      });
      return;
    }
    gsap.timeline({
      onComplete: () => {
        el().remove();
        resolve();
      },
    })
      .to(el().querySelector('.preloader__inner'), { yPercent: -30, autoAlpha: 0, duration: 0.5, ease: 'power2.in', delay: 0.25 })
      .to(el(), { clipPath: 'inset(0 0 100% 0)', duration: 0.9, ease: 'power3.inOut' }, '-=0.1');
  });
}
