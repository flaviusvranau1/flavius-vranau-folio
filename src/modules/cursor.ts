import gsap from 'gsap';

/** Custom cursor (lerped dot, grows + labels on hover) + magnetic elements. */
export function initCursor(): void {
  const fine = window.matchMedia('(pointer: fine)').matches;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduced) return;

  document.body.classList.add('has-cursor');
  const cursor = document.getElementById('cursor')!;
  const label = document.getElementById('cursor-label')!;

  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const target = { x: pos.x, y: pos.y };

  window.addEventListener('mousemove', (e) => {
    target.x = e.clientX;
    target.y = e.clientY;
  });

  gsap.ticker.add(() => {
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    // converged: skip the offsetWidth layout read + style write until the mouse moves again
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;
    pos.x += dx * 0.18;
    pos.y += dy * 0.18;
    cursor.style.transform = `translate(${pos.x - cursor.offsetWidth / 2}px, ${pos.y - cursor.offsetHeight / 2}px)`;
  });

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
