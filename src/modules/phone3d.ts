import gsap from 'gsap';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makePostStack, makeFpsGuard } from './post';

/* Interactive 3D phone (PLAYBOOK §12): a big Apple-style phone whose app icons
   dodge the cursor — corridor push, damped springs — but NEVER leave the screen. */

const COLS = 4;
const ROWS = 6;
const ICON = 0.62;
const SCREEN_W = 3.06;
const SCREEN_H = 6.44;
const K = 55;
const C = 7.5;
const R = 1.35;
const PUSH = 46;
const CAP = 0.58;

const ICON_STYLES: Array<[string, string, (c: CanvasRenderingContext2D) => void]> = [
  ['#34d16f', '#0e8f43', (c) => glyphBubble(c)],
  ['#3ba8ff', '#0b62d6', (c) => glyphCamera(c)],
  ['#ff9f43', '#e2641b', (c) => glyphNote(c)],
  ['#b18cff', '#6d3fd4', (c) => glyphPlay(c)],
  ['#ff5f6d', '#d61f3c', (c) => glyphHeart(c)],
  ['#57e6e0', '#12a8a1', (c) => glyphCloud(c)],
  ['#8b98a8', '#4a5461', (c) => glyphGear(c)],
  ['#ffd166', '#e2a01b', (c) => glyphSun(c)],
];

function glyphBubble(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.ellipse(64, 60, 30, 24, 0, 0, Math.PI * 2);
  c.moveTo(48, 80);
  c.lineTo(44, 96);
  c.lineTo(62, 84);
  c.fill();
}
function glyphCamera(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.arc(64, 64, 26, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  c.arc(64, 64, 14, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = 'source-over';
}
function glyphNote(c: CanvasRenderingContext2D) {
  c.fillRect(42, 38, 44, 6);
  c.fillRect(42, 56, 44, 6);
  c.fillRect(42, 74, 30, 6);
}
function glyphPlay(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.moveTo(50, 40);
  c.lineTo(88, 64);
  c.lineTo(50, 88);
  c.closePath();
  c.fill();
}
function glyphHeart(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.moveTo(64, 88);
  c.bezierCurveTo(30, 62, 44, 34, 64, 52);
  c.bezierCurveTo(84, 34, 98, 62, 64, 88);
  c.fill();
}
function glyphCloud(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.arc(50, 68, 14, 0, Math.PI * 2);
  c.arc(68, 60, 18, 0, Math.PI * 2);
  c.arc(84, 70, 12, 0, Math.PI * 2);
  c.rect(50, 66, 34, 16);
  c.fill();
}
function glyphGear(c: CanvasRenderingContext2D) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.save();
    c.translate(64, 64);
    c.rotate(a);
    c.fillRect(-5, -30, 10, 14);
    c.restore();
  }
  c.beginPath();
  c.arc(64, 64, 20, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  c.arc(64, 64, 9, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = 'source-over';
}
function glyphSun(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.arc(64, 64, 16, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.save();
    c.translate(64, 64);
    c.rotate(a);
    c.fillRect(-3, 24, 6, 12);
    c.restore();
  }
}

function iconTexture(i: number): THREE.CanvasTexture {
  const [c1, c2, glyph] = ICON_STYLES[i % ICON_STYLES.length];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  const r = 30;
  c.beginPath();
  c.roundRect(2, 2, 124, 124, r);
  const g = c.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  c.fillStyle = g;
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.92)';
  glyph(c);
  const t = new THREE.CanvasTexture(cv);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function initPhone3d(): void {
  const canvas = document.getElementById('phone-canvas') as HTMLCanvasElement;
  const section = document.getElementById('phone')!;
  let booted = false;

  const io = new IntersectionObserver(
    (en) => {
      if (!en[0].isIntersecting || booted) return;
      booted = true;
      io.disconnect();
      boot();
    },
    { rootMargin: '60% 0px' }
  );
  io.observe(section);

  function boot(): void {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // applied by OutputPass in the composer chain
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04080f);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
    camera.position.set(0, 0, 11.5);
    const post = makePostStack(renderer, scene, camera, section.clientWidth, section.clientHeight);
    const fpsGuard = makeFpsGuard((level) => {
      if (level === 1) post.setBloom(false);
      else renderer.setPixelRatio(1);
    });

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const key = new THREE.DirectionalLight(0xbfe3ff, 1.1);
    key.position.set(-4, 3, 6);
    const rim = new THREE.PointLight(0x8fe3ff, 14, 20, 2);
    rim.position.set(5.5, 2, -3);
    scene.add(key, rim, new THREE.AmbientLight(0x22303c, 0.7));

    // --- phone body: chunky titanium, visible bezel
    const phone = new THREE.Group();
    scene.add(phone);
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(3.46, 6.96, 0.46, 5, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x565d68, metalness: 1, roughness: 0.26, envMapIntensity: 1.4 })
    );
    phone.add(body);
    // glass face: a slightly smaller dark slab so the frame reads as a real bezel
    const face = new THREE.Mesh(
      new RoundedBoxGeometry(3.3, 6.8, 0.05, 3, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x05080d, metalness: 0.2, roughness: 0.35, envMapIntensity: 0.8 })
    );
    face.position.z = 0.225;
    phone.add(face);
    // side buttons
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x4a515b, metalness: 1, roughness: 0.3 });
    const btn1 = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.7, 0.16, 2, 0.03), btnMat);
    btn1.position.set(-1.76, 1.5, 0);
    const btn2 = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.42, 0.16, 2, 0.03), btnMat);
    btn2.position.set(-1.76, 0.6, 0);
    const btn3 = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.9, 0.16, 2, 0.03), btnMat);
    btn3.position.set(1.76, 1.2, 0);
    phone.add(btn1, btn2, btn3);

    // screen: near-black glass with a faint cold wallpaper glow
    const wall = document.createElement('canvas');
    wall.width = 256;
    wall.height = 512;
    const wc = wall.getContext('2d')!;
    const wg = wc.createRadialGradient(128, 150, 10, 128, 256, 420);
    wg.addColorStop(0, '#0d1a28');
    wg.addColorStop(0.55, '#060b13');
    wg.addColorStop(1, '#04070c');
    wc.fillStyle = wg;
    wc.fillRect(0, 0, 256, 512);
    const screenTex = new THREE.CanvasTexture(wall);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(SCREEN_W + 0.04, SCREEN_H + 0.12),
      new THREE.MeshBasicMaterial({ map: screenTex })
    );
    screen.position.z = 0.253;
    phone.add(screen);

    // dynamic island
    const island = new THREE.Mesh(
      new RoundedBoxGeometry(0.92, 0.24, 0.02, 3, 0.11),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    island.position.set(0, SCREEN_H / 2 - 0.26, 0.262);
    phone.add(island);

    // generous raycast proxy over the whole phone front (§2)
    const proxy = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 8.6),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    );
    proxy.position.z = 0.26;
    phone.add(proxy);

    // --- icons
    const nIcons = COLS * ROWS;
    const rest = new Float32Array(nIcons * 2);
    const off = new Float32Array(nIcons * 2);
    const vel = new Float32Array(nIcons * 2);
    const seed = new Float32Array(nIcons);
    const releaseAt = new Float32Array(nIcons);
    const icons: THREE.Mesh[] = [];

    const gapX = (SCREEN_W - COLS * ICON) / (COLS + 1);
    const topY = SCREEN_H / 2 - 0.75;
    const gapY = 0.34;
    const t0 = performance.now() / 1000;
    for (let i = 0; i < nIcons; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      rest[i * 2] = -SCREEN_W / 2 + gapX + ICON / 2 + col * (ICON + gapX);
      rest[i * 2 + 1] = topY - row * (ICON + gapY);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(ICON, ICON),
        new THREE.MeshBasicMaterial({ map: iconTexture(i), transparent: true })
      );
      mesh.position.set(rest[i * 2], rest[i * 2 + 1], 0.26);
      phone.add(mesh);
      icons.push(mesh);
      const a = Math.random() * Math.PI * 2;
      const d = 4 + Math.random() * 5;
      off[i * 2] = Math.cos(a) * d;
      off[i * 2 + 1] = Math.sin(a) * d;
      seed[i] = 0.7 + Math.random() * 0.6;
      releaseAt[i] = t0 + 0.2 + Math.random() * 1.2;
    }

    // bounds that keep every icon INSIDE the screen frame
    const bx = SCREEN_W / 2 - ICON / 2 - 0.05;
    const byTop = SCREEN_H / 2 - 0.62;
    const byBot = -SCREEN_H / 2 + 0.4;

    const resize = () => {
      const w = section.clientWidth;
      const h = section.clientHeight;
      renderer.setSize(w, h, false);
      post.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // keep the phone big: ~86% of viewport height
      const vFit = 6.9 / 0.82 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      camera.position.z = Math.max(vFit, 7);
    };
    window.addEventListener('resize', resize);
    resize();

    // --- pointer with inertia + speed (§2)
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const ndcTarget = new THREE.Vector2();
    let pointerActive = false;
    let pointerSpeed = 0;
    let lastPX = 0;
    let lastPY = 0;
    window.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
      if (pointerActive) pointerSpeed = Math.min(3, pointerSpeed + Math.hypot(nx - lastPX, ny - lastPY) * 14);
      lastPX = nx;
      lastPY = ny;
      ndcTarget.set(nx, ny);
      if (!pointerActive) ndc.copy(ndcTarget);
      pointerActive = true;
    });

    let visible = true;
    new IntersectionObserver((en) => (visible = en[0].isIntersecting)).observe(section);

    const local = new THREE.Vector3();
    const prevLocal = new THREE.Vector2();
    const moveDir = new THREE.Vector2(1, 0);
    let maxOffNow = 0;
    let outOfBounds = 0;
    let last = performance.now() / 1000;
    // ambient micro-events (§8): every 7–15s a shiver runs through one row of icons
    let nextShiver = performance.now() / 1000 + 7 + Math.random() * 8;

    gsap.ticker.add(() => {
      const t = performance.now() / 1000;
      const dt = Math.min(0.05, t - last);
      last = t;
      if (!visible) return;

      ndc.x += (ndcTarget.x - ndc.x) * 0.14;
      ndc.y += (ndcTarget.y - ndc.y) * 0.14;
      pointerSpeed *= Math.max(0, 1 - 5 * dt);

      // phone attitude: three-quarter + mouse parallax + idle float
      phone.rotation.y += (-0.24 + ndc.x * 0.1 - phone.rotation.y) * 0.05;
      phone.rotation.x += (0.03 + -ndc.y * 0.06 - phone.rotation.x) * 0.05;
      phone.position.y = Math.sin(t * 0.5) * 0.05;
      // two incommensurate sines on the rim light — the loop never shows (§8)
      rim.intensity = 14 * (1 + Math.sin(t * 0.9) * 0.08 + Math.sin(t * 1.37) * 0.06);
      // micro-event: a shiver through one random row
      if (t > nextShiver) {
        nextShiver = t + 7 + Math.random() * 8;
        const row = Math.floor(Math.random() * ROWS);
        for (let c2 = 0; c2 < COLS; c2++) {
          const i = row * COLS + c2;
          vel[i * 2] += (Math.random() - 0.5) * 1.6;
          vel[i * 2 + 1] += (Math.random() - 0.5) * 1.2;
        }
      }

      let hasHit = false;
      if (pointerActive) {
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(proxy, false);
        if (hits.length) {
          local.copy(hits[0].point);
          phone.worldToLocal(local);
          const mdx = local.x - prevLocal.x;
          const mdy = local.y - prevLocal.y;
          if (Math.hypot(mdx, mdy) > 0.002) moveDir.set(mdx, mdy).normalize();
          prevLocal.set(local.x, local.y);
          hasHit = true;
        }
      }
      const push = PUSH * (1 + Math.min(pointerSpeed, 2.5));
      const introDone = t > releaseAt[nIcons - 1];

      maxOffNow = 0;
      outOfBounds = 0;
      for (let i = 0; i < nIcons; i++) {
        const ix = i * 2;
        const m = icons[i];
        if (t < releaseAt[i]) {
          m.position.set(rest[ix] + off[ix], rest[ix + 1] + off[ix + 1], 0.26 + 0.4);
          continue;
        }
        let vx = vel[ix];
        let vy = vel[ix + 1];
        const px = rest[ix] + off[ix];
        const py = rest[ix + 1] + off[ix + 1];

        if (hasHit && introDone) {
          const dx = px - local.x;
          const dy = py - local.y;
          const d = Math.hypot(dx, dy);
          if (d < R && d > 0.0001) {
            const q = 1 - d / R;
            // corridor: push perpendicular to the cursor's travel direction (§2)
            const perpX = -moveDir.y;
            const perpY = moveDir.x;
            const side = dx * perpX + dy * perpY >= 0 ? 1 : -1;
            const f = push * q * q * seed[i];
            vx += (perpX * side * 0.85 + (dx / d) * 0.35) * f * dt;
            vy += (perpY * side * 0.85 + (dy / d) * 0.35) * f * dt;
          }
        }
        vx += -K * off[ix] * dt;
        vy += -K * off[ix + 1] * dt;
        const damp = Math.max(0, 1 - C * dt);
        vx *= damp;
        vy *= damp;
        off[ix] += vx * dt;
        off[ix + 1] += vy * dt;

        // cap + HARD clamp inside the screen frame (cerința: nu ies din telefon)
        if (introDone) {
          const o = Math.hypot(off[ix], off[ix + 1]);
          if (o > CAP) {
            off[ix] = (off[ix] / o) * CAP;
            off[ix + 1] = (off[ix + 1] / o) * CAP;
          }
          const cx = Math.max(-bx, Math.min(bx, rest[ix] + off[ix]));
          const cy = Math.max(byBot, Math.min(byTop, rest[ix + 1] + off[ix + 1]));
          if (cx !== rest[ix] + off[ix]) {
            off[ix] = cx - rest[ix];
            vx *= 0.4;
          }
          if (cy !== rest[ix + 1] + off[ix + 1]) {
            off[ix + 1] = cy - rest[ix + 1];
            vy *= 0.4;
          }
        }
        vel[ix] = vx;
        vel[ix + 1] = vy;

        const o2 = Math.hypot(off[ix], off[ix + 1]);
        if (o2 > maxOffNow) maxOffNow = o2;
        const fx = rest[ix] + off[ix];
        const fy = rest[ix + 1] + off[ix + 1];
        if (Math.abs(fx) > bx + 0.01 || fy > byTop + 0.01 || fy < byBot - 0.01) outOfBounds++;
        m.position.set(fx, fy, 0.26 + Math.min(0.14, o2 * 0.3));
      }
      post.render(t, Math.min(pointerSpeed, 2.5) * 0.006);
      fpsGuard(dt * 1000);
    });

    (window as unknown as { __phoneInfo: () => { maxOff: number; outOfBounds: number } }).__phoneInfo = () => ({
      maxOff: maxOffNow,
      outOfBounds,
    });
  }
}
