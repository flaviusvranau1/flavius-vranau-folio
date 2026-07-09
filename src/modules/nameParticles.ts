import gsap from 'gsap';
import * as THREE from 'three';
import { makePostStack, makeFpsGuard } from './post';

/* FLAVIUS VRANĂU — the dust-logo effect ported 1:1 from VULCAN GLASS
   (github.com/flaviusvranau1/vulcan-glass, buildDustLogo + dust update loop):
   soft glowing sprites, cursor blows the letters apart, springs rewrite them,
   moving dust lights up (igloo signature). Same constants, same feel. */

const TEXT = 'FLAVIUS VRANĂU';
const LOGO_W = 3.4; // scene-unit width — vulcan-glass scale so constants transfer verbatim

export function initNameParticles(): Promise<void> {
  const canvas = document.getElementById('name-canvas') as HTMLCanvasElement;
  const section = document.getElementById('intro')!;

  return document.fonts.load("700 150px 'Space Grotesk'").then(() => {
    // --- sample the name (playbook §13: wide canvas, diacritics work fine)
    const W = 1400;
    const H = 240;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const cx = cv.getContext('2d')!;
    cx.fillStyle = '#fff';
    cx.font = "700 150px 'Space Grotesk', sans-serif";
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(TEXT, W / 2, H / 2 + 8);
    const img = cx.getImageData(0, 0, W, H).data;

    const step = 3;
    const homes: number[] = [];
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        if (img[(y * W + x) * 4 + 3] > 120) homes.push(x, y);
      }
    }
    const n = homes.length / 2;
    const S = LOGO_W / W;

    const dustHome = new Float32Array(n * 3);
    const dustPos = new Float32Array(n * 3);
    const dustVel = new Float32Array(n * 3);
    const dustSeed = new Float32Array(n * 2); // phase + per-particle sensitivity
    const colors = new Float32Array(n * 3);
    const releaseAt = new Float32Array(n);

    const cIce = new THREE.Color(0xbfe8ff);
    const cWhite = new THREE.Color(0xf2f8ff);
    const cAmber = new THREE.Color(0xffb36b);
    const t0 = performance.now() / 1000;

    for (let i = 0; i < n; i++) {
      const hx = (homes[i * 2] - W / 2) * S;
      const hy = (H / 2 - homes[i * 2 + 1]) * S;
      const hz = (Math.random() - 0.5) * 0.12; // slight depth = dust, not a poster
      dustHome[i * 3] = hx;
      dustHome[i * 3 + 1] = hy;
      dustHome[i * 3 + 2] = hz;
      // intro: start scattered, springs assemble the name
      const a = Math.random() * Math.PI * 2;
      const d = 1.6 + Math.random() * 2.2;
      dustPos[i * 3] = hx + Math.cos(a) * d;
      dustPos[i * 3 + 1] = hy + Math.sin(a) * d;
      dustPos[i * 3 + 2] = hz + (Math.random() - 0.5) * 1.4;
      releaseAt[i] = t0 + 0.1 + Math.random() * 0.9;
      dustSeed[i * 2] = Math.random() * Math.PI * 2;
      dustSeed[i * 2 + 1] = 0.6 + Math.random() * 0.9;
      const r = Math.random();
      const c = r < 0.06 ? cAmber : r < 0.5 ? cIce : cWhite;
      const glow = 0.9 + Math.random() * 0.8; // a few sparks pass the "bloom" feel
      colors[i * 3] = c.r * glow;
      colors[i * 3 + 1] = c.g * glow;
      colors[i * 3 + 2] = c.b * glow;
    }
    const dustBaseCol = colors.slice();

    // --- scene
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // applied by OutputPass in the composer chain
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04080f);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 40);
    const post = makePostStack(renderer, scene, camera, section.clientWidth, section.clientHeight);
    const fpsGuard = makeFpsGuard((level) => {
      if (level === 1) post.setBloom(false);
      else renderer.setPixelRatio(1);
    });

    const dotTexture = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(200,235,255,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
    const dustColAttr = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
    dustGeo.setAttribute('color', dustColAttr);
    const dustPoints = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        size: 0.026,
        map: dotTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    dustPoints.frustumCulled = false;
    scene.add(dustPoints);

    const resize = () => {
      const w = section.clientWidth;
      const h = section.clientHeight;
      renderer.setSize(w, h, false);
      post.setSize(w, h);
      camera.aspect = w / h;
      const fitW = LOGO_W / 0.84; // name spans ~84% of the viewport width
      const dist = fitW / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
      camera.position.z = Math.max(dist, 2.2);
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();

    // --- pointer: raw ndc raycast onto the text plane, force scaled by cursor speed
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    const mouse = new THREE.Vector2();
    let pointerSeen = false;
    let pointerSpeed = 0;
    let lastPX = 0;
    let lastPY = 0;
    // Handler stays allocation- and layout-free; the NDC mapping happens once
    // per rendered frame in the ticker (not per pointer event).
    window.addEventListener('pointermove', (e) => {
      if (pointerSeen) {
        pointerSpeed = Math.min(pointerSpeed + Math.hypot(e.clientX - lastPX, e.clientY - lastPY) * 0.02, 3);
      }
      lastPX = e.clientX;
      lastPY = e.clientY;
      pointerSeen = true;
    });

    // Render only while the section is meaningfully on screen (>=15%), so two
    // composers never burn GPU simultaneously during section handoffs.
    let visible = true;
    new IntersectionObserver(
      (en) => {
        const e = en[en.length - 1];
        visible = e.isIntersecting && e.intersectionRatio >= 0.14;
      },
      { threshold: [0, 0.15, 0.3] }
    ).observe(section);

    let last = performance.now() / 1000;
    let maxOffNow = 0;

    gsap.ticker.add(() => {
      const t = performance.now() / 1000;
      const dt = Math.min(0.05, t - last);
      last = t;
      if (!visible) return;

      pointerSpeed *= Math.max(0, 1 - 5 * dt);
      const velBoost = 1 + Math.min(pointerSpeed, 2.5);

      let hitOk = false;
      if (pointerSeen) {
        const r = canvas.getBoundingClientRect();
        mouse.set(((lastPX - r.left) / r.width) * 2 - 1, -((lastPY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(mouse, camera);
        hitOk = raycaster.ray.intersectPlane(plane, hit) !== null;
      }
      const R = 1.15;
      const push = 6 * velBoost; // a fast sweep blows the dust harder
      const damp = Math.max(0, 1 - 4.5 * dt);

      maxOffNow = 0;
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        if (t < releaseAt[i]) continue; // intro: still frozen in the scatter
        const px = dustPos[ix];
        const py = dustPos[ix + 1];
        const pz = dustPos[ix + 2];
        let fx = 0;
        let fy = 0;
        let fz = 0;
        if (hitOk) {
          const dx = px - hit.x;
          const dy = py - hit.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 0.001;
            const q = 1 - d / R;
            const s = (push * q * q * dustSeed[i * 2 + 1]) / d;
            fx = dx * s;
            fy = dy * s;
            fz = (dustSeed[i * 2] - Math.PI) * 0.1 * push * q * q; // scatter into depth
          }
        }
        // permanent drift — dust never sits perfectly still
        const ph = dustSeed[i * 2];
        fx += Math.sin(t * 0.8 + ph) * 0.3;
        fy += Math.cos(t * 0.63 + ph * 1.7) * 0.3;
        // the soft spring that rewrites the letters
        fx += (dustHome[ix] - px) * 12;
        fy += (dustHome[ix + 1] - py) * 12;
        fz += (dustHome[ix + 2] - pz) * 12;
        dustVel[ix] = (dustVel[ix] + fx * dt) * damp;
        dustVel[ix + 1] = (dustVel[ix + 1] + fy * dt) * damp;
        dustVel[ix + 2] = (dustVel[ix + 2] + fz * dt) * damp;
        dustPos[ix] += dustVel[ix] * dt;
        dustPos[ix + 1] += dustVel[ix + 1] * dt;
        dustPos[ix + 2] += dustVel[ix + 2] * dt;
        // igloo signature: moving dust lights up, settled dust smolders
        const sp = Math.abs(dustVel[ix]) + Math.abs(dustVel[ix + 1]) + Math.abs(dustVel[ix + 2]);
        const br = Math.min(0.72 + sp * 1.6, 2.4);
        dustColAttr.array[ix] = dustBaseCol[ix] * br;
        dustColAttr.array[ix + 1] = dustBaseCol[ix + 1] * br;
        dustColAttr.array[ix + 2] = dustBaseCol[ix + 2] * br;

        const ox = px - dustHome[ix];
        const oy = py - dustHome[ix + 1];
        const o = Math.hypot(ox, oy);
        if (o > maxOffNow) maxOffNow = o;
      }
      dustGeo.attributes.position.needsUpdate = true;
      dustColAttr.needsUpdate = true;
      // CA breathes only with cursor motion — the igloo language
      post.render(t, Math.min(pointerSpeed, 2.5) * 0.008);
      fpsGuard(dt * 1000);
    });

    // QA hooks (§10)
    (window as unknown as { __nameInfo: () => { count: number; maxOff: number } }).__nameInfo = () => ({
      count: n,
      maxOff: maxOffNow,
    });
    (window as unknown as { __nameRenderOnce: () => void }).__nameRenderOnce = () => {
      post.render(performance.now() / 1000);
      renderer.getContext().finish();
    };
  });
}
