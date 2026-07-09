import gsap from 'gsap';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { makePostStack, makeFpsGuard } from './post';

/* The desk, after hours (PLAYBOOK §15): real photoscanned CC0 props (Poly Haven),
   photographic HDRI + a warm desk lamp with soft shadows. Hover an object and it
   rises on a damped spring, wobbles, then settles — igloo-style. */

type Prop = {
  slug: string;
  // fractional position on the table top (x right, z toward camera), rotationY
  fx: number;
  fz: number;
  ry: number;
  hover: boolean;
  targetSize?: number; // largest dimension, meters — normalizes odd exports
};

const PROPS: Prop[] = [
  { slug: 'classic_laptop', fx: -0.22, fz: 0.02, ry: 0.26, hover: true, targetSize: 0.5 },
  { slug: 'desk_lamp_arm_01', fx: 0.6, fz: -0.42, ry: -2.55, hover: false, targetSize: 0.62 },
  { slug: 'potted_plant_04', fx: -0.68, fz: -0.38, ry: 0.6, hover: true, targetSize: 0.34 },
  { slug: 'book_encyclopedia_set_01', fx: 0.18, fz: -0.42, ry: 0.04, hover: true, targetSize: 0.5 },
  { slug: 'binder_notebook', fx: 0.38, fz: 0.3, ry: -0.35, hover: true, targetSize: 0.3 },
  { slug: 'alarm_clock_01', fx: -0.6, fz: 0.16, ry: -0.2, hover: true, targetSize: 0.16 },
  { slug: 'gamepad', fx: -0.05, fz: 0.44, ry: -0.6, hover: true, targetSize: 0.24 },
];

const LIFT = 0.13;
const SPRING = 65;
const DAMP = 8.5;

export function initDesk3d(): void {
  const canvas = document.getElementById('desk-canvas') as HTMLCanvasElement;
  const section = document.getElementById('desk')!;
  let booted = false;

  const io = new IntersectionObserver(
    (en) => {
      if (!en[0].isIntersecting || booted) return;
      booted = true;
      io.disconnect();
      boot().catch((err) => console.warn('[desk] init failed', err));
    },
    { rootMargin: '80% 0px' }
  );
  io.observe(section);

  async function boot(): Promise<void> {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // applied by OutputPass in the composer chain
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04080f);
    scene.fog = new THREE.Fog(0x04080f, 3.2, 7.5);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 30);
    const post = makePostStack(renderer, scene, camera, section.clientWidth, section.clientHeight);
    const fpsGuard = makeFpsGuard((level) => {
      if (level === 1) post.setBloom(false);
      else renderer.setPixelRatio(1);
    });

    // photographic HDRI environment, dimmed — the lamp owns the scene
    const pmrem = new THREE.PMREMGenerator(renderer);
    const hdr = await new RGBELoader().loadAsync('./hdri/studio_1k.hdr');
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();

    // warm desk-lamp key light (the pool of light) + cool laptop-side fill
    const lamp = new THREE.PointLight(0xffc188, 7.5, 4.5, 1.8);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.bias = -0.0025;
    scene.add(lamp);
    const screenGlow = new THREE.PointLight(0x9fd8ff, 0.4, 1.4, 2);
    scene.add(screenGlow);
    scene.add(new THREE.AmbientLight(0x16222e, 0.24));

    const loader = new GLTFLoader();
    const setShadows = (root: THREE.Object3D, envInt: number) => {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const m = mesh.material as THREE.MeshStandardMaterial;
          if (m && 'envMapIntensity' in m) m.envMapIntensity = envInt;
        }
      });
    };

    // --- table
    const tableGltf = await loader.loadAsync('./models/painted_wooden_table/painted_wooden_table_1k.gltf');
    const table = tableGltf.scene;
    setShadows(table, 0.18);
    const tb = new THREE.Box3().setFromObject(table);
    table.position.y = -tb.max.y; // tabletop at y = 0
    scene.add(table);
    const halfW = (tb.max.x - tb.min.x) / 2 - 0.12;
    const halfD = (tb.max.z - tb.min.z) / 2 - 0.08;

    // warm pool of light from the lamp head, slightly toward the desk center
    lamp.position.set(0.5 * halfW, 0.52, -0.25 * halfD);

    // --- props
    type LiveProp = {
      name: string;
      group: THREE.Group;
      proxy: THREE.Mesh;
      hover: boolean;
      y: number;
      vy: number;
      rz: number;
      releaseAt: number;
      hovered: boolean;
    };
    const live: LiveProp[] = [];
    const t0 = performance.now() / 1000;

    await Promise.all(
      PROPS.filter((p) => p.slug !== 'painted_wooden_table').map(async (p, i) => {
        const g = await loader.loadAsync(`./models/${p.slug}/${p.slug}_1k.gltf`);
        const obj = g.scene;
        setShadows(obj, 0.22);
        const group = new THREE.Group();
        const bb = new THREE.Box3().setFromObject(obj);
        if (p.targetSize) {
          const size = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z, bb.max.y - bb.min.y);
          obj.scale.setScalar(p.targetSize / size);
          bb.setFromObject(obj); // re-measure after normalization
        }
        obj.position.y = -bb.min.y; // sit on the surface
        obj.position.x = -(bb.min.x + bb.max.x) / 2;
        obj.position.z = -(bb.min.z + bb.max.z) / 2;
        group.add(obj);
        group.position.set(p.fx * halfW, 0, p.fz * halfD);
        group.rotation.y = p.ry;
        scene.add(group);

        // generous invisible hover proxy (§2)
        const bb2 = new THREE.Box3().setFromObject(group);
        const sz = bb2.getSize(new THREE.Vector3());
        const ctr = bb2.getCenter(new THREE.Vector3());
        const proxy = new THREE.Mesh(
          new THREE.BoxGeometry(sz.x * 1.25, sz.y * 1.3, sz.z * 1.25),
          new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
        );
        proxy.position.copy(ctr);
        proxy.name = p.slug;
        scene.add(proxy);

        live.push({
          name: p.slug,
          group,
          proxy,
          hover: p.hover,
          y: 0.9, // intro: drop in from above
          vy: 0,
          rz: 0,
          releaseAt: t0 + 0.25 + i * 0.16 + Math.random() * 0.2,
          hovered: false,
        });
      })
    );

    // laptop screen glow follows the laptop
    const laptop = live.find((l) => l.name === 'classic_laptop');
    if (laptop) {
      const c = new THREE.Box3().setFromObject(laptop.group).getCenter(new THREE.Vector3());
      screenGlow.position.set(c.x, 0.28, c.z + 0.25);
    }

    const resize = () => {
      const w = section.clientWidth;
      const h = section.clientHeight;
      renderer.setSize(w, h, false);
      post.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();

    // pointer with inertia
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const ndcTarget = new THREE.Vector2();
    let pointerActive = false;
    let pointerInside = false;
    window.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) {
        pointerInside = false; // left the stage — everything settles back down
        return;
      }
      pointerInside = true;
      ndcTarget.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (!pointerActive) ndc.copy(ndcTarget);
      pointerActive = true;
    });

    let visible = true;
    new IntersectionObserver((en) => (visible = en[0].isIntersecting)).observe(section);

    const dbg = { hover: '', ndcX: 0, ndcY: 0, inside: false };
    const proxies = live.filter((l) => l.hover).map((l) => l.proxy);
    const camBase = new THREE.Vector3(0.08, 0.6, 1.8);
    const lookAt = new THREE.Vector3(0, 0.15, -0.12);
    let last = performance.now() / 1000;
    let nextShiver = last + 9 + Math.random() * 6;

    gsap.ticker.add(() => {
      const t = performance.now() / 1000;
      const dt = Math.min(0.05, t - last);
      last = t;
      if (!visible) return;

      ndc.x += (ndcTarget.x - ndc.x) * 0.12;
      ndc.y += (ndcTarget.y - ndc.y) * 0.12;

      camera.position.set(camBase.x + ndc.x * 0.11, camBase.y + -ndc.y * 0.05, camBase.z);
      camera.lookAt(lookAt);

      // the lamp breathes on two incommensurate sines; a shiver stirs one object now and then (§8)
      lamp.intensity = 7.5 * (1 + Math.sin(t * 0.9) * 0.05 + Math.sin(t * 1.37) * 0.04);
      if (t > nextShiver) {
        nextShiver = t + 9 + Math.random() * 6;
        const candidates = live.filter((l) => l.hover);
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        if (pick) pick.vy += 0.35 + Math.random() * 0.25;
      }

      let hoveredName = '';
      if (pointerActive && pointerInside) {
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(proxies, false);
        if (hits.length) hoveredName = hits[0].object.name;
      }
      dbg.hover = hoveredName;
      dbg.ndcX = +ndc.x.toFixed(2);
      dbg.ndcY = +ndc.y.toFixed(2);
      dbg.inside = pointerInside;

      for (const p of live) {
        if (t < p.releaseAt) {
          p.group.position.y = p.y;
          continue;
        }
        p.hovered = p.hover && p.name === hoveredName;
        const target = p.hovered ? LIFT : 0;
        p.vy += (target - p.y) * SPRING * dt;
        p.vy *= Math.max(0, 1 - DAMP * dt);
        p.y += p.vy * dt;
        p.group.position.y = p.y;
        // wobble: a touch of tilt from the vertical velocity — objects sway, not fly
        p.rz += (p.vy * 0.22 - p.rz) * 0.1;
        p.group.rotation.z = p.rz;
        p.proxy.position.y += (p.y + (p.proxy.userData.baseY ?? (p.proxy.userData.baseY = p.proxy.position.y)) - p.proxy.position.y) * 1;
        p.proxy.position.y = (p.proxy.userData.baseY as number) + p.y;
      }
      post.render(t);
      fpsGuard(dt * 1000);
    });

    // QA hooks (§10)
    const qa = window as unknown as {
      __deskInfo: () => Record<string, number>;
      __deskScreenPos: (name: string) => { x: number; y: number } | null;
    };
    (window as unknown as { __deskRenderOnce: () => void }).__deskRenderOnce = () => {
      post.render(performance.now() / 1000);
      renderer.getContext().finish();
    };
    qa.__deskInfo = () =>
      ({ ...Object.fromEntries(live.map((l) => [l.name, +l.y.toFixed(4)])), _dbg: dbg }) as unknown as Record<string, number>;
    qa.__deskScreenPos = (name: string) => {
      const p = live.find((l) => l.name === name);
      if (!p) return null;
      const v = new THREE.Box3().setFromObject(p.group).getCenter(new THREE.Vector3()).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };

    section.classList.add('is-live');
  }
}
