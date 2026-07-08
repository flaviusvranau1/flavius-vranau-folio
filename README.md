# Flavius Vranău — Creative Full-Stack Developer

Cinematic one-page portfolio. The centerpiece is a **living portrait**: an AI-animated
camera orbit around a real photo, extracted to a 120-frame WebP sequence and
**scrubbed frame-by-frame with scroll**.

**Live:** https://flaviusvranau1.github.io/flavius-vranau-folio/

## Stack

- **Vite + TypeScript** (vanilla, no framework)
- **GSAP + ScrollTrigger + SplitText** — pins, scrubs, reveals
- **Lenis** — smooth scroll, driven from `gsap.ticker`
- **Canvas 2D** — hero & light-sweep frame sequences
- **OGL (WebGL)** — 2.5D depth-parallax portrait (image + AI depth map)
- Film grain + vignette overlays, custom cursor, magnetic buttons, EN/RO i18n

## Develop

```bash
npm install
npm run dev     # http://localhost:5199
npm run build   # production build in dist/
node qa/verify.mjs  # headless acceptance suite (needs Chrome + dev server)
```

QA hooks: `?slowload=<ms>` (throttle preloader), `?reduced` (force reduced-motion).

## Deploy

Pushes to `main` build and deploy automatically to GitHub Pages via
`.github/workflows/deploy.yml`.
