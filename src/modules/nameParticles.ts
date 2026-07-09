import gsap from 'gsap';
import * as THREE from 'three';

/* FLAVIUS VRANĂU written in dust (PLAYBOOK §13 + §7):
   text sampled from a canvas → ~7k particles with damped-spring physics,
   cursor repulsion scaled by pointer speed, brightness driven by velocity. */

const TEXT = 'FLAVIUS VRANĂU';
const SAMPLE_STEP = 3;
const K = 12; // spring stiffness (dust: soft)
const C = 4.5; // damping
const REPEL_RADIUS = 2.4;
const PUSH = 34;

export function initNameParticles(): Promise<void> {
  const canvas = document.getElementById('name-canvas') as HTMLCanvasElement;
  const section = document.getElementById('intro')!;

  return document.fonts.load('700 150px "Space Grotesk"').then(() => {
    // --- 1. sample the name into particle targets
    const W = 1400;
    const H = 240;
    const tex = document.createElement('canvas');
    tex.width = W;
    tex.height = H;
    const cx = tex.getContext('2d')!;
    cx.fillStyle = '#fff';
    cx.font = "700 150px 'Space Grotesk', sans-serif";
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(TEXT, W / 2, H / 2 + 8);
    const data = cx.getImageData(0, 0, W, H).data;

    const targets: number[] = [];
    for (let y = 0; y < H; y += SAMPLE_STEP) {
      for (let x = 0; x < W; x += SAMPLE_STEP) {
        if (data[(y * W + x) * 4 + 3] > 120) targets.push(x, y);
      }
    }
    const n = targets.length / 2;

    // world scale: text spans ~11 units
    const worldW = 11;
    const s = worldW / W;

    const rest = new Float32Array(n * 2);
    const off = new Float32Array(n * 2);
    const vel = new Float32Array(n * 2);
    const seed = new Float32Array(n);
    const phase = new Float32Array(n);
    const releaseAt = new Float32Array(n);
    const bright = new Float32Array(n);
    const sizes = new Float32Array(n);
    const colors = new Float32Array(n * 3);

    const palette = [
      [0xe8 / 255, 0xf1 / 255, 0xf8 / 255], // ink
      [0xaf / 255, 0xcb / 255, 0xdd / 255], // soft blue
      [0x8f / 255, 0xe3 / 255, 0xff / 255], // ice spark
      [0xff / 255, 0xb3 / 255, 0x6b / 255], // rare amber
    ];
    const now = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      rest[i * 2] = (targets[i * 2] - W / 2) * s;
      rest[i * 2 + 1] = (H / 2 - targets[i * 2 + 1]) * s;
      const a = Math.random() * Math.PI * 2;
      const d = 6 + Math.random() * 5; // §3: start scattered 6–11
      off[i * 2] = Math.cos(a) * d;
      off[i * 2 + 1] = Math.sin(a) * d;
      seed[i] = 0.7 + Math.random() * 0.6;
      phase[i] = Math.random() * Math.PI * 2;
      releaseAt[i] = now + 0.15 + Math.random() * 1.1;
      sizes[i] = 1.7 + Math.random() * 1.6;
      const r = Math.random();
      const c = r < 0.6 ? palette[0] : r < 0.92 ? palette[1] : r < 0.98 ? palette[2] : palette[3];
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
      bright[i] = 0.72;
    }

    // --- 2. three.js scene
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const aBright = new THREE.BufferAttribute(bright, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBright', aBright);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uDpr: { value: renderer.getPixelRatio() } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aBright;
        uniform float uDpr;
        varying vec3 vColor;
        varying float vBright;
        void main() {
          vColor = aColor;
          vBright = aBright;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uDpr * (9.0 / -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vBright;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.12, length(p));
          gl_FragColor = vec4(vColor * vBright, a * 0.9);
        }`,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    const resize = () => {
      const w = section.clientWidth;
      const h = section.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // fit text to ~86% of viewport width
      const fitW = worldW / 0.86;
      const dist = fitW / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
      camera.position.z = Math.max(dist, 7);
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();

    // --- 3. pointer with inertia (§2), gated on first move
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    const ndc = new THREE.Vector2(0, 0);
    const ndcTarget = new THREE.Vector2(0, 0);
    let pointerActive = false;
    let pointerSpeed = 0;
    let lastPX = 0;
    let lastPY = 0;
    window.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
      if (pointerActive) {
        pointerSpeed = Math.min(3, pointerSpeed + Math.hypot(nx - lastPX, ny - lastPY) * 14);
      }
      lastPX = nx;
      lastPY = ny;
      ndcTarget.set(nx, ny);
      if (!pointerActive) ndc.copy(ndcTarget);
      pointerActive = true;
    });

    // --- 4. physics + render loop (rides the shared gsap.ticker)
    let visible = true;
    new IntersectionObserver((en) => (visible = en[0].isIntersecting)).observe(section);

    let last = performance.now() / 1000;
    let maxOffNow = 0;
    gsap.ticker.add(() => {
      const t = performance.now() / 1000;
      let dt = Math.min(0.05, t - last);
      last = t;
      if (!visible) return;

      ndc.x += (ndcTarget.x - ndc.x) * 0.14;
      ndc.y += (ndcTarget.y - ndc.y) * 0.14;
      pointerSpeed *= Math.max(0, 1 - 5 * dt);

      let hasHit = false;
      if (pointerActive) {
        raycaster.setFromCamera(ndc, camera);
        hasHit = raycaster.ray.intersectPlane(plane, hit) !== null;
      }
      const push = PUSH * (1 + Math.min(pointerSpeed, 2.5));

      maxOffNow = 0;
      for (let i = 0; i < n; i++) {
        const ix = i * 2;
        if (t < releaseAt[i]) {
          positions[i * 3] = rest[ix] + off[ix];
          positions[i * 3 + 1] = rest[ix + 1] + off[ix + 1];
          continue;
        }
        let vx = vel[ix];
        let vy = vel[ix + 1];
        const px = rest[ix] + off[ix];
        const py = rest[ix + 1] + off[ix + 1];

        if (hasHit) {
          const dx = px - hit.x;
          const dy = py - hit.y;
          const d = Math.hypot(dx, dy);
          if (d < REPEL_RADIUS && d > 0.0001) {
            const q = 1 - d / REPEL_RADIUS;
            const f = push * q * q * seed[i];
            vx += (dx / d) * f * dt;
            vy += (dy / d) * f * dt;
          }
        }
        // permanent sinusoidal drift — nothing sits perfectly still (§7)
        vx += Math.sin(t * 0.6 + phase[i]) * 0.10 * dt;
        vy += Math.cos(t * 0.47 + phase[i] * 1.3) * 0.10 * dt;
        // spring home + damping
        vx += -K * off[ix] * dt;
        vy += -K * off[ix + 1] * dt;
        const damp = Math.max(0, 1 - C * dt);
        vx *= damp;
        vy *= damp;
        off[ix] += vx * dt;
        off[ix + 1] += vy * dt;
        vel[ix] = vx;
        vel[ix + 1] = vy;

        const sp = Math.hypot(vx, vy);
        bright[i] = Math.min(2.4, 0.72 + sp * 1.6);
        const o = Math.hypot(off[ix], off[ix + 1]);
        if (o > maxOffNow) maxOffNow = o;

        positions[i * 3] = rest[ix] + off[ix];
        positions[i * 3 + 1] = rest[ix + 1] + off[ix + 1];
      }
      geo.attributes.position.needsUpdate = true;
      aBright.needsUpdate = true;
      renderer.render(scene, camera);
    });

    // QA hooks (§10 — verify numerically, not visually)
    (window as unknown as { __nameInfo: () => { count: number; maxOff: number } }).__nameInfo = () => ({
      count: n,
      maxOff: maxOffNow,
    });
  });
}
