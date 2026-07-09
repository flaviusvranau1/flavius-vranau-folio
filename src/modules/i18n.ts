type Lang = 'en' | 'ro';

const strings: Record<Lang, Record<string, string>> = {
  en: {
    status: 'Available for work',
    introEyebrow: 'Creative Full-Stack Developer',
    tagline: 'I build web experiences that move.',
    scroll: 'Scroll',
    phoneLabel: '01 — Playground',
    phoneHint: 'Hover the apps — they make way',
    iglooLabel: '02 — The dome',
    iglooHint: 'Hover the bricks — they rise',
    heroLabel: '03 — Off duty',
    heroLine: 'Same patience, higher altitude — the Carpathians.',
    manifestoLabel: '04 — Who I am',
    m1: '5+ years turning ideas into things people actually use.',
    m2: 'Clean code. Real motion. <em>Shipped.</em>',
    m3: 'Front end to back end — design to deploy.',
    m4: 'The details are the product.',
    craftLabel: '05 — What I do',
    craftTitle: 'CRAFT',
    c1: 'Front-end',
    c2: 'Motion',
    c3: 'Back-end',
    c4: 'Data',
    c5: 'Approach',
    c5stack: 'Ship fast · AI-assisted · n8n automation',
    workLabel: '06 — Selected work',
    workTitle: 'WORK',
    w0: 'Interactive 3D glass tire — igloo-style WebGL, live in your browser. Click to play.',
    w1: 'Cross-platform companion app — one back end, web and both app stores.',
    w2: 'Chauffeur booking platform — fleet, drivers, live ride status. ~80% shipped.',
    w3name: 'FREELANCE WEB',
    w3: 'Cinematic presentation sites for real businesses — reusable, client-ready templates.',
    momentTitle: 'LIGHT DOES THE TALKING',
    momentSub: '7 years of public speaking — rooms of 500 to 800 people',
    depthLabel: '08 — In depth',
    depthCaption: 'Move the cursor — the portrait answers.',
    storyLabel: '09 — The path',
    s1t: 'Computer Science, Cluj',
    s1: 'Technical University of Cluj-Napoca — algorithms, C++, and a lane-detection thesis in OpenCV.',
    s2t: 'First dev roles',
    s2: 'Takeoff Labs, Cluj — Ruby on Rails, PostgreSQL, React. Then FOUND CO, London — front-end for a design-led agency.',
    s3t: 'Full-stack products',
    s3: 'Smart Box Digital — logistics booking platform in React, Node.js and MongoDB, with real-time tracking APIs.',
    s4t: 'Automation & creative work',
    s4: 'Far Foundation — n8n automations and internal tools. Nights and weekends: cinematic sites like this one.',
    s5t: 'Next',
    s5: 'Your project. Remote, worldwide.',
    contactTitle: 'GET IN<br />TOUCH',
    cta: "Let's build something",
    ctaShort: "Let's build something",
    foot: 'Based in Bistrița, Romania — working worldwide',
  },
  ro: {
    status: 'Disponibil pentru proiecte',
    introEyebrow: 'Creative Full-Stack Developer',
    tagline: 'Construiesc experiențe web care prind viață.',
    scroll: 'Derulează',
    phoneLabel: '01 — Loc de joacă',
    phoneHint: 'Treci peste aplicații — îți fac loc',
    iglooLabel: '02 — Domul de gheață',
    iglooHint: 'Treci peste cărămizi — se ridică',
    heroLabel: '03 — În timpul liber',
    heroLine: 'Aceeași răbdare, altitudine mai mare — Carpații.',
    manifestoLabel: '04 — Cine sunt',
    m1: '5+ ani în care transform idei în lucruri pe care oamenii chiar le folosesc.',
    m2: 'Cod curat. Mișcare reală. <em>Livrat.</em>',
    m3: 'De la front end la back end — de la design la deploy.',
    m4: 'Detaliile sunt produsul.',
    craftLabel: '05 — Ce fac',
    craftTitle: 'CRAFT',
    c1: 'Front-end',
    c2: 'Motion',
    c3: 'Back-end',
    c4: 'Date',
    c5: 'Abordare',
    c5stack: 'Livrez rapid · Asistat de AI · Automatizări n8n',
    workLabel: '06 — Proiecte alese',
    workTitle: 'PROIECTE',
    w0: 'Anvelopă de sticlă 3D interactivă — WebGL stil igloo, live în browser. Apasă și joacă-te.',
    w1: 'Aplicație companion cross-platform — un singur back end, web și ambele app store-uri.',
    w2: 'Platformă de transport cu șofer — flotă, șoferi, status live. ~80% livrat.',
    w3name: 'WEB FREELANCE',
    w3: 'Site-uri cinematice de prezentare pentru afaceri reale — șabloane reutilizabile.',
    momentTitle: 'LUMINA VORBEȘTE PENTRU MINE',
    momentSub: '7 ani de vorbit în public — săli de 500–800 de oameni',
    depthLabel: '08 — În profunzime',
    depthCaption: 'Mișcă cursorul — portretul răspunde.',
    storyLabel: '09 — Drumul',
    s1t: 'Informatică, Cluj',
    s1: 'Universitatea Tehnică din Cluj-Napoca — algoritmi, C++ și o lucrare de licență cu detecție de bandă în OpenCV.',
    s2t: 'Primele roluri de developer',
    s2: 'Takeoff Labs, Cluj — Ruby on Rails, PostgreSQL, React. Apoi FOUND CO, Londra — front-end pentru o agenție de design.',
    s3t: 'Produse full-stack',
    s3: 'Smart Box Digital — platformă de booking pentru logistică în React, Node.js și MongoDB, cu API-uri de tracking în timp real.',
    s4t: 'Automatizări & muncă creativă',
    s4: 'Far Foundation — automatizări n8n și unelte interne. Serile și weekendurile: site-uri cinematice ca acesta.',
    s5t: 'Urmează',
    s5: 'Proiectul tău. Remote, de oriunde.',
    contactTitle: 'HAI SĂ<br />VORBIM',
    cta: 'Hai să construim ceva',
    ctaShort: 'Hai să construim ceva',
    foot: 'Din Bistrița, România — lucrez oriunde',
  },
};

const HTML_KEYS = new Set(['m2', 'contactTitle']);
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
