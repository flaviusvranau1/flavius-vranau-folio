import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { onLangChange, t } from './i18n';

/** 3 · Manifesto — masked line reveals */
export function initManifesto(): void {
  document.querySelectorAll<HTMLElement>('#manifesto-lines .mask').forEach((mask) => {
    const line = mask.querySelector('.manifesto__line')!;
    gsap.from(line, {
      yPercent: 112,
      duration: 1.1,
      ease: 'power3.out',
      scrollTrigger: { trigger: mask, start: 'top 86%', once: true },
    });
  });
}

/** 4 · Craft — pinned spec callouts revealing sequentially */
export function initCraft(pinned: boolean): void {
  const rows = gsap.utils.toArray<HTMLElement>('.craft__row');
  if (pinned) {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#craft',
        start: 'top top',
        end: '+=2600',
        scrub: 0.6,
        pin: '#craft-pin',
        pinType: 'fixed',
        anticipatePin: 1,
      },
    });
    tl.from('.craft__title', { xPercent: -8, autoAlpha: 0, ease: 'none', duration: 0.6 }, 0);
    rows.forEach((row, i) => {
      tl.from(row, { y: 90, autoAlpha: 0, ease: 'none', duration: 1 }, 0.5 + i * 0.9);
      tl.from(row.querySelector('.craft__stack'), { xPercent: 6, autoAlpha: 0, ease: 'none', duration: 0.7 }, 0.8 + i * 0.9);
    });
  } else {
    rows.forEach((row) => {
      gsap.from(row, {
        y: 48,
        autoAlpha: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: row, start: 'top 88%', once: true },
      });
    });
  }
}

/** Lazy work thumbnails — runs in every mode (incl. reduced motion). */
let thumbsWired = false;
export function initLazyThumbs(): void {
  if (thumbsWired) return;
  thumbsWired = true;
  const imgs = document.querySelectorAll<HTMLImageElement>('.card__img[data-src]');
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const img = en.target as HTMLImageElement;
        img.src = img.dataset.src!;
        delete img.dataset.src;
        io.unobserve(img);
      });
    },
    { rootMargin: '150% 0px' }
  );
  imgs.forEach((img) => io.observe(img));
}

/** 5 · Work — horizontal scrubbed track (desktop) / stacked reveals (mobile) */
export function initWork(pinned: boolean): void {
  initLazyThumbs();

  if (pinned) {
    const track = document.getElementById('work-track')!;
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: '#work',
        start: 'top top',
        end: () => `+=${distance() + window.innerHeight * 0.4}`,
        scrub: 0.7,
        pin: '#work-pin',
        pinType: 'fixed',
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });
  } else {
    gsap.utils.toArray<HTMLElement>('.card').forEach((card) => {
      gsap.from(card, {
        y: 56,
        autoAlpha: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: card, start: 'top 90%', once: true },
      });
    });
  }
}

/** 7 · Story — progress line + step reveals */
export function initStory(): void {
  gsap.to('#story-progress', {
    scaleY: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: '.story__rail',
      start: 'top 75%',
      end: 'bottom 45%',
      scrub: 0.6,
    },
  });
  gsap.utils.toArray<HTMLElement>('[data-step]').forEach((step) => {
    gsap.from(step, {
      x: -36,
      autoAlpha: 0,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: step, start: 'top 82%', once: true },
    });
  });
}

/** 8 · Contact — masked title lines + reveal */
let contactRevealed = false;

export function buildContactTitle(): void {
  const title = document.getElementById('contact-title')!;
  const lines = t('contactTitle').split(/<br\s*\/?>/i);
  title.innerHTML = lines
    .map((l) => `<span class="mask" style="display:block"><span class="contact__title-line" style="display:block">${l.trim()}</span></span>`)
    .join('');
  if (contactRevealed) gsap.set('.contact__title-line', { yPercent: 0 });
}

export function initContact(animate: boolean): void {
  buildContactTitle();
  onLangChange(() => buildContactTitle());
  if (!animate) {
    contactRevealed = true;
    return;
  }
  ScrollTrigger.create({
    trigger: '#contact',
    start: 'top 65%',
    once: true,
    onEnter: () => {
      contactRevealed = true;
      gsap.fromTo(
        '.contact__title-line',
        { yPercent: 108 },
        { yPercent: 0, duration: 1.2, ease: 'power3.out', stagger: 0.12 }
      );
      gsap.from('.contact__mail, .contact__links a', {
        y: 26,
        autoAlpha: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.07,
        delay: 0.35,
      });
    },
  });
}

/** Sticky CTA — slides in after 50% of total scroll, steps aside on the contact section */
export function initStickyCta(animate: boolean): void {
  const cta = document.getElementById('cta-sticky')!;
  let shown = false;
  let suppressed = false;
  const update = () => {
    const visible = shown && !suppressed;
    if (animate) gsap.to(cta, { y: 0, yPercent: visible ? 0 : 140, duration: 0.6, ease: 'power3.out', overwrite: true });
    else gsap.set(cta, { y: 0, yPercent: visible ? 0 : 140 });
    cta.style.pointerEvents = visible ? 'auto' : 'none';
  };
  // GSAP owns the transform from here on. The stylesheet's translateY(140%) is only
  // the pre-JS state — GSAP parses it as a pixel `y`, so zero it out explicitly.
  gsap.set(cta, { y: 0, yPercent: 140 });

  ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      const next = self.progress > 0.5;
      if (next !== shown) {
        shown = next;
        update();
      }
    },
  });
  ScrollTrigger.create({
    trigger: '#contact',
    start: 'top 80%',
    onEnter: () => {
      suppressed = true;
      update();
    },
    onLeaveBack: () => {
      suppressed = false;
      update();
    },
  });
}
