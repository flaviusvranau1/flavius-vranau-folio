type Lang = 'en' | 'ro';

const strings: Record<Lang, Record<string, string>> = {
  en: {
    status: 'Available for work',
    tagline: 'Creative Full-Stack Developer.<br />I build web experiences that move.',
    scroll: 'Scroll',
    manifestoLabel: '01 — Who I am',
    m1: 'Five-plus years turning ideas into things people actually use.',
    m2: 'Clean code. Real motion. <em>Shipped.</em>',
    m3: 'Front end to back end — design to deploy.',
    m4: 'The details are the product.',
    craftLabel: '02 — What I do',
    craftTitle: 'CRAFT',
    c1: 'Front-end',
    c1stack: 'React · Next.js · TypeScript · Tailwind',
    c2: 'Motion',
    c2stack: 'GSAP · Three.js · Framer Motion · Lenis',
    c3: 'Back-end',
    c3stack: 'Node.js · Ruby on Rails · REST APIs',
    c4: 'Data',
    c4stack: 'MongoDB · PostgreSQL · MySQL',
    c5: 'Approach',
    c5stack: 'Ship fast · AI-assisted · Detail-obsessed',
    workLabel: '03 — Selected work',
    workTitle: 'WORK',
    w1: 'Cross-platform companion app — one back end, web and both app stores.',
    w2: 'Luxury chauffeur & fleet booking platform — web + mobile. In progress.',
    w3name: 'FREELANCE WEB',
    w3: 'Cinematic landing pages and presentation sites that sell.',
    momentTitle: 'LIGHT DOES THE TALKING',
    momentSub: '7 years of public speaking — rooms of 500 to 800 people',
    depthLabel: '04 — Off duty',
    depthCaption: 'Move the cursor — the mountain answers.',
    storyLabel: '05 — The path',
    s1y: '2015 — 2019',
    s1t: 'Foundations',
    s1: 'Computer Science at TU Cluj-Napoca — algorithms, C++, and a real-time lane-detection thesis in OpenCV.',
    s2y: '2018 — 2022',
    s2t: 'First dev roles',
    s2: 'Full-stack at Takeoff Labs in Cluj (Rails, PostgreSQL), then front-end for FOUND CO in London.',
    s3y: '2024 — 2025',
    s3t: 'Product work',
    s3: 'Logistics booking platform at Smart Box Digital — React, Node.js, MongoDB. Then Miami and the Escalade fleet platform.',
    s4y: '2025 — NOW',
    s4t: 'Automation & creative work',
    s4: 'n8n automations and internal tools at Far Foundation — plus cinematic, scroll-driven sites for real clients.',
    s5y: 'NEXT',
    s5t: 'Your project',
    s5: 'Remote, worldwide.',
    contactTitle: 'GET IN<br />TOUCH',
    cta: "Let's build something",
    ctaShort: "Let's build something",
    foot: 'Based in Bistrița, Romania — working worldwide',
  },
  ro: {
    status: 'Disponibil pentru proiecte',
    tagline: 'Creative Full-Stack Developer.<br />Construiesc experiențe web care prind viață.',
    scroll: 'Derulează',
    manifestoLabel: '01 — Cine sunt',
    m1: 'De peste 5 ani transform idei în lucruri pe care oamenii chiar le folosesc.',
    m2: 'Cod curat. Mișcare reală. <em>Livrat.</em>',
    m3: 'De la front end la back end — de la design la deploy.',
    m4: 'Detaliile sunt produsul.',
    craftLabel: '02 — Ce fac',
    craftTitle: 'CRAFT',
    c1: 'Front-end',
    c1stack: 'React · Next.js · TypeScript · Tailwind',
    c2: 'Motion',
    c2stack: 'GSAP · Three.js · Framer Motion · Lenis',
    c3: 'Back-end',
    c3stack: 'Node.js · Ruby on Rails · REST APIs',
    c4: 'Date',
    c4stack: 'MongoDB · PostgreSQL · MySQL',
    c5: 'Abordare',
    c5stack: 'Livrez rapid · Asistat de AI · Obsedat de detalii',
    workLabel: '03 — Proiecte alese',
    workTitle: 'PROIECTE',
    w1: 'Aplicație companion cross-platform — un singur back end, web și ambele app store-uri.',
    w2: 'Platformă de booking șofer & flotă de lux — web + mobil. În lucru.',
    w3name: 'WEB FREELANCE',
    w3: 'Landing page-uri cinematice și site-uri de prezentare care vând.',
    momentTitle: 'LUMINA VORBEȘTE PENTRU MINE',
    momentSub: '7 ani de vorbit în public — săli de 500–800 de oameni',
    depthLabel: '04 — În timpul liber',
    depthCaption: 'Mișcă cursorul — muntele răspunde.',
    storyLabel: '05 — Drumul',
    s1y: '2015 — 2019',
    s1t: 'Fundația',
    s1: 'Informatică la UT Cluj-Napoca — algoritmi, C++ și o lucrare de licență cu detecție de bandă în timp real, în OpenCV.',
    s2y: '2018 — 2022',
    s2t: 'Primele roluri de developer',
    s2: 'Full-stack la Takeoff Labs în Cluj (Rails, PostgreSQL), apoi front-end pentru FOUND CO, Londra.',
    s3y: '2024 — 2025',
    s3t: 'Produse reale',
    s3: 'Platformă de booking logistic la Smart Box Digital — React, Node.js, MongoDB. Apoi Miami și platforma de flotă Escalade.',
    s4y: '2025 — ACUM',
    s4t: 'Automatizări & lucru creativ',
    s4: 'Automatizări n8n și unelte interne la Far Foundation — plus site-uri cinematice, conduse de scroll, pentru clienți reali.',
    s5y: 'URMEAZĂ',
    s5t: 'Proiectul tău',
    s5: 'Remote, de oriunde.',
    contactTitle: 'HAI SĂ<br />VORBIM',
    cta: 'Hai să construim ceva',
    ctaShort: 'Hai să construim ceva',
    foot: 'Bistrița, România — lucrez oriunde în lume',
  },
};

const HTML_KEYS = new Set(['tagline', 'm2', 'contactTitle']);
let current: Lang = (localStorage.getItem('fv-lang') as Lang) || 'en';
const listeners: Array<(lang: Lang) => void> = [];

export function getLang(): Lang {
  return current;
}

export function t(key: string): string {
  return strings[current][key] ?? strings.en[key] ?? key;
}

export function applyStrings(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n!;
    const value = t(key);
    if (HTML_KEYS.has(key) || value.includes('<em>')) el.innerHTML = value;
    else el.textContent = value;
  });
  document.documentElement.lang = current;
}

export function onLangChange(fn: (lang: Lang) => void): void {
  listeners.push(fn);
}

export function initI18n(): void {
  applyStrings();
  const toggle = document.getElementById('lang-toggle')!;
  const opts = toggle.querySelectorAll<HTMLElement>('.lang-toggle__opt');
  const sync = () => opts.forEach((o) => o.classList.toggle('is-active', o.dataset.lang === current));
  sync();
  toggle.addEventListener('click', () => {
    current = current === 'en' ? 'ro' : 'en';
    localStorage.setItem('fv-lang', current);
    applyStrings();
    sync();
    listeners.forEach((fn) => fn(current));
  });
}
