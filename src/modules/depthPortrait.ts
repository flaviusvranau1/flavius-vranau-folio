import gsap from 'gsap';
import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl';

const VERT = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImg;
uniform sampler2D uDepth;
uniform vec2 uFlow;
uniform vec2 uCover;
uniform float uReveal;
void main() {
  vec2 uv = 0.5 + (vUv - 0.5) * uCover;
  float d = texture2D(uDepth, uv).r;
  vec2 off = uFlow * (d - 0.5);
  vec3 c = texture2D(uImg, uv + off).rgb;
  c *= mix(0.22, 1.0, uReveal);
  float vig = smoothstep(1.25, 0.45, length(vUv - 0.5));
  c *= mix(0.82, 1.0, vig);
  gl_FragColor = vec4(c, 1.0);
}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

let booted = false;
let inited = false;

/** 2.5D depth-parallax portrait: mouse + idle drift + scroll reveal. WebGL init is deferred
 *  until near viewport, and runs at most once (matchMedia contexts may re-invoke this). */
export function initDepthPortrait(): void {
  if (inited) return;
  inited = true;
  const stage = document.getElementById('depth-stage')!;
  const canvas = document.getElementById('depth-canvas') as HTMLCanvasElement;

  const io = new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting || booted) return;
      booted = true;
      io.disconnect();
      boot().catch((err) => console.warn('[depth] WebGL init failed, keeping static fallback', err));
    },
    { rootMargin: '80% 0px' }
  );
  io.observe(stage);

  async function boot(): Promise<void> {
    const [img, depth] = await Promise.all([
      loadImage('./portrait-depth-src.jpg'),
      loadImage('./portrait-depth-map.jpg'),
    ]);

    const renderer = new Renderer({ canvas, dpr: Math.min(window.devicePixelRatio || 1, 2), alpha: false });
    const gl = renderer.gl;

    const texImg = new Texture(gl, { image: img, generateMipmaps: false });
    const texDepth = new Texture(gl, { image: depth, generateMipmaps: false });

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uImg: { value: texImg },
        uDepth: { value: texDepth },
        uFlow: { value: [0, 0] },
        uCover: { value: [1, 1] },
        uReveal: { value: 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      renderer.setSize(w, h);
      const ca = w / h;
      const ia = img.naturalWidth / img.naturalHeight;
      program.uniforms.uCover.value = ca > ia ? [1, ia / ca] : [ca / ia, 1];
    };
    window.addEventListener('resize', resize);
    resize();

    // Mouse influence (lerped) + slow idle auto-drift so it breathes
    const target = { x: 0, y: 0 };
    const flow = { x: 0, y: 0 };
    stage.addEventListener('mousemove', (e) => {
      const r = stage.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 0.05;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 0.04;
    });
    stage.addEventListener('mouseleave', () => {
      target.x = 0;
      target.y = 0;
    });

    let inView = true;
    new IntersectionObserver((en) => (inView = en[0].isIntersecting)).observe(stage);

    gsap.ticker.add((time) => {
      if (!inView) return;
      const idleX = Math.sin(time * 0.5) * 0.007;
      const idleY = Math.cos(time * 0.34) * 0.006;
      flow.x += (target.x + idleX - flow.x) * 0.05;
      flow.y += (target.y + idleY - flow.y) * 0.05;
      program.uniforms.uFlow.value = [flow.x, flow.y];
      renderer.render({ scene: mesh });
    });

    // Scroll resolves the portrait out of darkness
    gsap.to(program.uniforms.uReveal, {
      value: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: stage,
        start: 'top 90%',
        end: 'top 35%',
        scrub: 0.6,
      },
    });

    stage.classList.add('is-live');
  }
}
