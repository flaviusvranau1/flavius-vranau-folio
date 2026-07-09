import gsap from 'gsap';

/** Custom cursor + magnetic elements. The dot is positioned DIRECTLY in the
 *  pointermove handler — zero coupling to the render loop, so it stays
 *  native-snappy even when a 3D scene drags the frame rate to 20fps.
 *  Centering is a trailing translate(-50%,-50%), so the hot path does no
 *  layout reads (no offsetWidth) and no lerp ticker at all. The hover
 *  grow/label effect stays in CSS (width/height transition — cheap, rare). */
export function initCursor(): void {
  const fine = window.matchMedia('(pointer: fine)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduced) return;

  document.body.classList.add('has-cursor');
  const cursor = document.getElementById('cursor')!;
  const label = document.getElementById('cursor-label')!;

  window.addEventListener(
    'pointermove',
    (e) => {
      cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
    },
    { passive: true }
  );

  const LABELS: Record<string, string> = { view: 'View', move: 'Move', hover: '' };
  document.querySelectorAll<HTMLElement>('[data-cursor]').forEach((elm) => {
    const kind = elm.dataset.cursor || 'hover';
    elm.addEventListener('mouseenter', () => {
      const text = LABELS[kind] ?? '';
      cursor.classList.add(text ? 'is-label' : 'is-hover');
      label.textContent = text;
    });
    elm.addEventListener('mouseleave', () => {
      cursor.classList.remove('is-hover', 'is-label');
      label.textContent = '';
    });
  });

  // Magnetic pull
  document.querySelectorAll<HTMLElement>('.magnetic').forEach((elm) => {
    const strength = 0.35;
    elm.addEventListener('mousemove', (e) => {
      const r = elm.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      gsap.to(elm, { x: x * strength, y: y * strength, duration: 0.4, ease: 'power3.out' });
    });
    elm.addEventListener('mouseleave', () => {
      gsap.to(elm, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
    });
  });
}
