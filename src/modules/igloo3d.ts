import gsap from 'gsap';
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makePostStack } from './post';
import { registerStage, type StageMode } from './stage';

/* THE ICE DOME (igloo.inc hero interaction — PLAYBOOK §2/§3/§8):
   one InstancedMesh of matte ice bricks in a high-key slate fog. Bricks under
   the cursor rise radially along the dome normal on damped springs and tilt
   like hatches; the light inside leaks through the seams and flares where a
   brick lifts. Everything procedural — no textures, no shadow maps, no GLTF. */

const DOME_R = 2.0;
const THICK = 0.3; // brick radial thickness
const K = 55; // intro-assembly spring (§2 verbatim — used until a brick first seats)
const DAMP = 7.5; // intro-assembly damping
/* The rise itself is NOT force-push (that reads as pistons hitting a ceiling).
   igloo.inc's motion is a soft gaussian BUMP that travels under the cursor:
   every brick springs toward a target height on the bump, with an asymmetric
   spring — firm rise (~0.25s), softer under-damped release (~0.7s) that dips
   a hair below seated and re-settles. Organic, never clamped. */
const LIFT_MAX = 0.24; // bump peak ≈ 0.8 × brick thickness at rest speed
const SIGMA = 0.78; // gaussian half-width of the bump — soft flanks, no edge
const K_UP = 420; // rise: firm — ~90% height within ~0.25s
const C_UP = 24; // ζ≈0.59 — jelly overshoot, one visible bounce ("flexibil")
const K_DN = 25; // release: the SLOW half — elastic drift down, settle ~0.9s
const C_DN = 8; // ζ≈0.8: one gentle dip past seated, then re-settle
/* THE ENERGY UNDERNEATH (client note: bricks must feel LIFTED by a field, never
   parked at spring equilibrium — igloo.inc raised clusters shimmer and track):
   — per-brick smoothed target ⇒ the bump PROPAGATES outward from the hit
   — one-shot kick + underdamped rise ⇒ jelly overshoot on attack
   — two incommensurate sinusoids per brick + a global field breath ⇒ the
     raised cluster levitates, and the seam glow throbs on the same phase */
const SMOOTH_UP = 18; // target chase rate — scaled per brick and by proximity
const SMOOTH_DN = 28; // fast target collapse on release — soft spring takes over
const K_FLT = 110; // while held by the field, downward follow — medium-soft
const C_FLT = 11; // ζ≈0.52 — bouncy float-follow, never a hard park
const FLOAT_AMP = 0.14; // living float ≈14% of current lift
const KICK = 1.6; // velocity jolt when the energy first grabs a brick
const TILT_MAX = 0.24; // bricks lean AWAY from the cursor — petals parting
const DOOR_AZ = -0.62; // entrance azimuth — camera-left
const FOG = 0x989ea7;
const SNOW = 300;

// 5 latitude courses — counts keep bricks near-square along each ring
const COURSES = [
  { lat0: 2, lat1: 18, count: 18 },
  { lat0: 18, lat1: 34, count: 16 },
  { lat0: 34, lat1: 50, count: 14 },
  { lat0: 50, lat1: 66, count: 10 },
  { lat0: 66, lat1: 80, count: 7 },
];

const angDiff = (a: number, b: number): number => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/* 3 gradient lightformer panels (the vulcan-glass pattern) — a cool overcast sky */
function buildEnvScene(): THREE.Scene {
  const env = new THREE.Scene();
  const gc = document.createElement('canvas');
  gc.width = gc.height = 128;
  const gcx = gc.getContext('2d')!;
  const gg = gcx.createRadialGradient(64, 64, 6, 64, 64, 64);
  gg.addColorStop(0, '#fff');
  gg.addColorStop(0.55, '#555');
  gg.addColorStop(1, '#000');
  gcx.fillStyle = gg;
  gcx.fillRect(0, 0, 128, 128);
  const gradTex = new THREE.CanvasTexture(gc);
  const addFormer = (hex: number, intensity: number, w: number, h: number, x: number, y: number, z: number) => {
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: gradTex });
    mat.color = new THREE.Color(hex).multiplyScalar(intensity);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  addFormer(0xffffff, 3.6, 10, 4, 0, 8, 0); // wide white panel overhead
  addFormer(0xcfe0f0, 2.2, 2, 9, -8, 1, 3); // cool strip, camera-left
  addFormer(0xdfe8f2, 1.4, 8, 5, 3, 0, -9); // pale fill behind
  return env;
}

function radialTexture(stops: Array<[number, string]>): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function initIgloo3d(): void {
  const canvas = document.getElementById('igloo-canvas') as HTMLCanvasElement;
  const section = document.getElementById('igloo')!;
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25)); // weak-GPU budget
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // applied by OutputPass in the composer chain
    renderer.toneMappingExposure = 1.12; // high-key chapter — lift the haze

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FOG);
    scene.fog = new THREE.FogExp2(FOG, 0.055); // the dome floats in haze
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    // adaptive quality (bloom-off / DPR-down / composer bypass) lives in post.ts
    const post = makePostStack(renderer, scene, camera, section.clientWidth, section.clientHeight);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(buildEnvScene(), 0.04).texture;
    scene.environmentIntensity = 0.4;
    // the real winter sky (Poly Haven horn-koppe_snow) swaps in when it arrives
    new RGBELoader()
      .loadAsync('./textures/winter_1k.hdr')
      .then((hdr) => {
        scene.environment = pmrem.fromEquirectangular(hdr).texture;
        scene.environmentIntensity = 0.5;
        hdr.dispose();
      })
      .catch(() => undefined);

    // low winter sun with REAL soft shadows — the scene is 4 draw calls, the
    // shadow pass is nearly free, and brick-on-brick occlusion sells the realism
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // the shadow pass re-renders ONLY on frames where the dome actually moves
    // (lift/tilt/velocity beyond epsilon — intro and shivers included); a
    // sleeping dome costs zero shadow work. Light and shadow camera are static.
    renderer.shadowMap.autoUpdate = false;
    const hemi = new THREE.HemisphereLight(0xe9eff7, 0x767d88, 0.5);
    const dir = new THREE.DirectionalLight(0xfff2e2, 1.35);
    dir.position.set(-5, 4.5, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.bias = -0.0015;
    dir.shadow.normalBias = 0.025;
    dir.shadow.radius = 5;
    const sc = dir.shadow.camera;
    sc.left = -3.6;
    sc.right = 3.6;
    sc.top = 3.6;
    sc.bottom = -1;
    sc.near = 1;
    sc.far = 16;
    sc.updateProjectionMatrix();
    scene.add(hemi, dir);

    // ---------- brick layout ----------
    type Block = {
      pos: THREE.Vector3;
      n: THREE.Vector3;
      tilt: THREE.Vector3;
      quat: THREE.Quaternion;
      scale: THREE.Vector3;
      az: number;
    };
    const blocks: Block[] = [];

    COURSES.forEach((c, ci) => {
      const lat0 = THREE.MathUtils.degToRad(c.lat0);
      const lat1 = THREE.MathUtils.degToRad(c.lat1);
      const latMid = (lat0 + lat1) / 2;
      const h = DOME_R * (lat1 - lat0) * 0.95; // ~5% seam — thin glowing lines
      const ringR = DOME_R * Math.cos(latMid);
      const w = ((Math.PI * 2 * ringR) / c.count) * 0.96;
      const doorHalf = ci === 0 ? 0.27 : ci === 1 ? 0.16 : 0;
      for (let k = 0; k < c.count; k++) {
        const az = ((k + (ci % 2) * 0.5) / c.count) * Math.PI * 2 + rnd(-0.02, 0.02);
        if (doorHalf > 0 && angDiff(az, DOOR_AZ) < doorHalf) continue; // the doorway
        const lat = latMid + rnd(-0.012, 0.012);
        const n = new THREE.Vector3(Math.cos(lat) * Math.sin(az), Math.sin(lat), Math.cos(lat) * Math.cos(az));
        const east = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
        const north = new THREE.Vector3().crossVectors(n, east);
        const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, n));
        quat.multiply(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(-0.02, 0.02), rnd(-0.02, 0.02), rnd(-0.03, 0.03)))
        );
        blocks.push({
          pos: n.clone().multiplyScalar(DOME_R),
          n,
          tilt: east,
          quat,
          scale: new THREE.Vector3(w * rnd(0.96, 1.05), h * rnd(0.96, 1.05), THICK * rnd(0.94, 1.06)),
          az,
        });
      }
    });

    // cap block closes the crown
    {
      const n = new THREE.Vector3(0, 1, 0);
      const east = new THREE.Vector3(1, 0, 0);
      const north = new THREE.Vector3(0, 0, -1);
      const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, n));
      blocks.push({
        pos: new THREE.Vector3(0, DOME_R * 0.985, 0),
        n,
        tilt: east,
        quat,
        scale: new THREE.Vector3(0.8, 0.8, THICK),
        az: 0,
      });
    }

    // 2-course arched entrance tunnel, camera-left
    const D = new THREE.Vector3(Math.sin(DOOR_AZ), 0, Math.cos(DOOR_AZ));
    {
      const U = new THREE.Vector3(0, 1, 0);
      const S = new THREE.Vector3().crossVectors(D, U);
      const R_ARCH = 0.66;
      const AXIS_Y = 0.0;
      // two ALIGNED arches — they read as a tunnel, not rubble
      const rings = [
        { dist: 2.08, betas: [-1.3, -0.65, 0, 0.65, 1.3] },
        { dist: 2.52, betas: [-1.3, -0.65, 0, 0.65, 1.3] },
      ];
      for (const ring of rings) {
        for (const beta of ring.betas) {
          const nb = U.clone().multiplyScalar(Math.cos(beta)).addScaledVector(S, Math.sin(beta));
          const tb = U.clone().multiplyScalar(-Math.sin(beta)).addScaledVector(S, Math.cos(beta));
          const pos = D.clone().multiplyScalar(ring.dist).addScaledVector(nb, R_ARCH);
          pos.y += AXIS_Y;
          const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tb, D, nb));
          blocks.push({
            pos,
            n: nb,
            tilt: tb,
            quat,
            scale: new THREE.Vector3(0.46 * rnd(0.97, 1.03), 0.5 * rnd(0.97, 1.03), 0.28 * rnd(0.96, 1.04)),
            az: DOOR_AZ,
          });
        }
      }
    }

    // ---------- flatten to typed arrays (zero per-frame allocations) ----------
    const n = blocks.length;
    const base = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const tiltAx = new Float32Array(n * 3);
    const quats = new Float32Array(n * 4);
    const scales = new Float32Array(n * 3);
    const azArr = new Float32Array(n);
    const off = new Float32Array(n);
    const vel = new Float32Array(n);
    const rot = new Float32Array(n);
    const rotVel = new Float32Array(n);
    const seed = new Float32Array(n);
    const cap = new Float32Array(n);
    const release = new Float32Array(n);
    const settled = new Uint8Array(n);
    const baseCol = new Float32Array(n * 3);
    // the energy underneath — per-brick personality (all allocated once, §9)
    const tgt = new Float32Array(n); // smoothed bump target — the wave that propagates
    const rateSeed = new Float32Array(n); // target chase rate seed 0.7–1.3
    const fA = new Float32Array(n); // float frequency A (rad/s)
    const fB = new Float32Array(n); // float frequency B — incommensurate with A
    const phA = new Float32Array(n); // random phases — neighbours never sync
    const phB = new Float32Array(n);
    const active = new Uint8Array(n); // levitation latch — fires the grab-kick once

    const cBase = new THREE.Color(0xaab2bd);
    const cLift = new THREE.Color(0xd8e2f2).multiplyScalar(2.6); // instanceColor > 1 → bloom flares it
    for (let i = 0; i < n; i++) {
      const b = blocks[i];
      b.pos.toArray(base, i * 3);
      b.n.toArray(nrm, i * 3);
      b.tilt.toArray(tiltAx, i * 3);
      b.quat.toArray(quats, i * 4);
      b.scale.toArray(scales, i * 3);
      azArr[i] = b.az;
      off[i] = rnd(1.4, 2.8); // intro (§3): scattered outward along the normal, frozen
      release[i] = 0.15 + Math.random() * 1.1;
      seed[i] = 0.85 + Math.random() * 0.3;
      rateSeed[i] = 0.85 + Math.random() * 0.45; // §2 per-piece seed — organic, not mechanical
      fA[i] = rnd(1.8, 2.6); // energetic float band (PLAYBOOK §8 pattern, scaled up)
      fB[i] = fA[i] * 1.47 + rnd(0.1, 0.4); // never a rational ratio — no visible loop
      phA[i] = rnd(0, Math.PI * 2);
      phB[i] = rnd(0, Math.PI * 2);
      cap[i] = b.scale.z * 0.9; // |off| capped at ~0.9× brick thickness
      const j = rnd(0.95, 1.05);
      baseCol[i * 3] = cBase.r * j;
      baseCol[i * 3 + 1] = cBase.g * j;
      baseCol[i * 3 + 2] = cBase.b * j;
    }

    // photographic packed-snow surface (Poly Haven snow_02 @1k) — loads async, swaps in
    const texLoader = new THREE.TextureLoader();
    const snowDiff = texLoader.load('./textures/snow_diff.jpg');
    snowDiff.colorSpace = THREE.SRGBColorSpace;
    const snowNor = texLoader.load('./textures/snow_nor.jpg');
    const snowRough = texLoader.load('./textures/snow_rough.jpg');
    for (const tx of [snowDiff, snowNor, snowRough]) tx.wrapS = tx.wrapT = THREE.RepeatWrapping;

    // snow caps: faces pointing up catch fresh powder (view-space up passed per frame)
    const upView = { value: new THREE.Vector3(0, 1, 0) };
    const brickMat = new THREE.MeshStandardMaterial({
      color: 0xe9edf2,
      map: snowDiff,
      normalMap: snowNor,
      roughnessMap: snowRough,
      roughness: 1,
      metalness: 0,
      normalScale: new THREE.Vector2(0.85, 0.85),
    });
    brickMat.onBeforeCompile = (sh) => {
      sh.uniforms.uUpView = upView;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uUpView;')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          float snowCap = smoothstep(0.3, 0.72, dot(normal, uUpView));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.985, 1.0), snowCap * 0.5);
          roughnessFactor = mix(roughnessFactor, 0.55, snowCap * 0.45);`
        );
    };

    // three hand-cut geometry variants — neighbouring bricks never share dents
    const variants: THREE.BufferGeometry[] = [];
    for (let v = 0; v < 3; v++) {
      const g = new RoundedBoxGeometry(1, 1, 1, 3, 0.1);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const sv = 13.7 * (v + 1);
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k);
        const y = pos.getY(k);
        const z = pos.getZ(k);
        const w = Math.sin(x * 6.4 + sv) * Math.sin(y * 5.1 + sv * 1.7) * Math.sin(z * 7.3 + sv * 2.3);
        const q = 1 + w * 0.055;
        pos.setXYZ(k, x * q, y * q, z * q);
      }
      g.computeVertexNormals();
      variants.push(g);
    }
    const meshIdxOf = new Uint8Array(n);
    const instIdxOf = new Uint16Array(n);
    const perMeshCount = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const v = i % 3;
      meshIdxOf[i] = v;
      instIdxOf[i] = perMeshCount[v]++;
    }
    const meshes: THREE.InstancedMesh[] = [];
    const colArrs: Float32Array[] = [];
    for (let v = 0; v < 3; v++) {
      const im = new THREE.InstancedMesh(variants[v], brickMat, perMeshCount[v]);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const ca = new Float32Array(perMeshCount[v] * 3);
      im.instanceColor = new THREE.InstancedBufferAttribute(ca, 3);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = true;
      im.receiveShadow = true;
      scene.add(im);
      meshes.push(im);
      colArrs.push(ca);
    }
    for (let i = 0; i < n; i++) {
      const c3 = instIdxOf[i] * 3;
      const ca = colArrs[meshIdxOf[i]];
      ca[c3] = baseCol[i * 3];
      ca[c3 + 1] = baseCol[i * 3 + 1];
      ca[c3 + 2] = baseCol[i * 3 + 2];
    }

    // emissive inner shell — the light inside, visible only through the seams
    const shellBase = new THREE.Color(0xcfe0f5).multiplyScalar(1.7);
    const shellMat = new THREE.MeshBasicMaterial({ color: shellBase.clone(), toneMapped: false });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(DOME_R - 0.18, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
    shell.position.y = -0.08; // sunken — no light sliver under the base course
    scene.add(shell);

    // ground — real snow, catching the sun's shadows; fog dissolves it into the sky
    const gDiff = snowDiff.clone();
    const gNor = snowNor.clone();
    const gRough = snowRough.clone();
    for (const tx of [gDiff, gNor, gRough]) {
      tx.repeat.set(18, 18);
      tx.needsUpdate = true;
    }
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48),
      new THREE.MeshStandardMaterial({
        color: 0xbfc6cf, // lift the albedo — fresh snowfield, not thawed dirt
        map: gDiff,
        normalMap: gNor,
        roughnessMap: gRough,
        roughness: 1,
        metalness: 0,
        normalScale: new THREE.Vector2(0.6, 0.6),
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // fake contact shadow under the dome
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(6.8, 6.8),
      new THREE.MeshBasicMaterial({
        map: radialTexture([
          [0, 'rgba(22,27,36,0.34)'],
          [0.62, 'rgba(22,27,36,0.2)'],
          [1, 'rgba(22,27,36,0)'],
        ]),
        transparent: true,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.011;
    scene.add(shadow);

    // warm pool of light spilling from the entrance onto the snow
    const poolMat = new THREE.MeshBasicMaterial({
      map: radialTexture([
        [0, 'rgba(255,236,200,0.8)'],
        [0.4, 'rgba(255,236,200,0.32)'],
        [1, 'rgba(255,236,200,0)'],
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), poolMat);
    pool.quaternion
      .setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
      .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), DOOR_AZ));
    pool.scale.set(1.8, 2.9, 1);
    pool.position.copy(D).multiplyScalar(2.9);
    pool.position.y = 0.013;
    scene.add(pool);

    // ---------- drifting snow (dot-texture sprites, nameParticles pattern) ----------
    const dotTexture = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(235,244,252,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const snowPos = new Float32Array(SNOW * 3);
    const snowSeed = new Float32Array(SNOW * 2); // phase, fall speed
    for (let i = 0; i < SNOW; i++) {
      snowPos[i * 3] = rnd(-7, 7);
      snowPos[i * 3 + 1] = rnd(0, 5.5);
      snowPos[i * 3 + 2] = rnd(-4, 7);
      snowSeed[i * 2] = rnd(0, Math.PI * 2);
      snowSeed[i * 2 + 1] = rnd(0.22, 0.55);
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3).setUsage(THREE.DynamicDrawUsage));
    const snow = new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({
        size: 0.05,
        map: dotTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    snow.frustumCulled = false;
    scene.add(snow);

    // diamond dust — tiny glints twinkling on the snow and the dome (bloom makes them jewels)
    const SPARK = 420;
    const sparkPos = new Float32Array(SPARK * 3);
    const sparkCol = new Float32Array(SPARK * 3);
    const sparkPhase = new Float32Array(SPARK * 2); // phase, rate
    for (let i = 0; i < SPARK; i++) {
      if (i % 3 === 0) {
        // on the dome surface
        const az = rnd(0, Math.PI * 2);
        const lat = rnd(0.12, 1.35);
        const r = DOME_R + 0.02;
        sparkPos[i * 3] = Math.cos(az) * Math.cos(lat) * r;
        sparkPos[i * 3 + 1] = Math.sin(lat) * r * 0.98;
        sparkPos[i * 3 + 2] = Math.sin(az) * Math.cos(lat) * r;
      } else {
        // scattered on the snow field
        const a = rnd(0, Math.PI * 2);
        const rr = 2.3 + Math.sqrt(Math.random()) * 6.5;
        sparkPos[i * 3] = Math.cos(a) * rr;
        sparkPos[i * 3 + 1] = 0.015;
        sparkPos[i * 3 + 2] = Math.sin(a) * rr;
      }
      sparkPhase[i * 2] = rnd(0, Math.PI * 2);
      sparkPhase[i * 2 + 1] = rnd(0.5, 2.2);
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkColAttr = new THREE.BufferAttribute(sparkCol, 3).setUsage(THREE.DynamicDrawUsage);
    sparkGeo.setAttribute('color', sparkColAttr);
    const sparks = new THREE.Points(
      sparkGeo,
      new THREE.PointsMaterial({
        size: 0.03,
        map: dotTexture,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
    );
    sparks.frustumCulled = false;
    scene.add(sparks);

    // ---------- camera ----------
    const camBase = new THREE.Vector3(0.1, 2.9, 7.9); // elevated three-quarter, looking slightly down
    const lookAt = new THREE.Vector3(0, 0.6, 0);
    let parX = 0;
    let parY = 0;

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

    // ---------- pointer with inertia + speed (§2) ----------
    const raycaster = new THREE.Raycaster();
    // generous invisible proxy dome — analytic sphere, so the raycast allocates nothing
    const proxySphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), DOME_R + 0.35);
    const hit = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    const ndcTarget = new THREE.Vector2();
    let pointerActive = false;
    let pointerInside = false;
    let pointerSpeed = 0;
    let lastPX = 0;
    let lastPY = 0;

    // stage coordinator: 'full' = dominant (post stack), 'plain' = handoff
    // neighbour (bare render), 'off' = parked. One composer site-wide.
    let mode: StageMode = 'off';
    let visible = false;
    registerStage(section, (m) => {
      mode = m;
      visible = m !== 'off';
    });

    window.addEventListener('pointermove', (e) => {
      if (!visible) return; // skip the layout read while the section is off screen
      const r = canvas.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) {
        pointerInside = false; // left the stage — everything settles back down
        return;
      }
      pointerInside = true;
      if (pointerActive) {
        pointerSpeed = Math.min(3, pointerSpeed + Math.hypot(e.clientX - lastPX, e.clientY - lastPY) * 0.02);
      }
      lastPX = e.clientX;
      lastPY = e.clientY;
      ndcTarget.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (!pointerActive) ndc.copy(ndcTarget);
      pointerActive = true;
    });

    // ---------- tick ----------
    const _p = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _qt = new THREE.Quaternion();
    const _ax = new THREE.Vector3();
    const _s = new THREE.Vector3();
    const _m = new THREE.Matrix4();
    const _upq = new THREE.Quaternion();

    let introStart = -1; // set on the first VISIBLE frame — assembly plays on entry (§3)
    let nextShiver = Infinity;
    let maxLiftNow = 0;
    let hoveredNow = 0;
    let last = performance.now() / 1000;

    gsap.ticker.add(() => {
      const t = performance.now() / 1000;
      const dt = Math.min(0.05, t - last);
      last = t;
      if (!visible) return;
      if (introStart < 0) {
        introStart = t;
        nextShiver = t + 7 + Math.random() * 8;
      }

      ndc.x += (ndcTarget.x - ndc.x) * 0.14;
      ndc.y += (ndcTarget.y - ndc.y) * 0.14;
      pointerSpeed *= Math.max(0, 1 - 5 * dt);

      // subtle mouse parallax (lerp 0.05)
      parX += (ndc.x * 0.34 - parX) * 0.05;
      parY += (-ndc.y * 0.2 - parY) * 0.05;
      camera.position.set(camBase.x + parX, camBase.y + parY, camBase.z);
      camera.lookAt(lookAt);

      // seam glow breathes on two incommensurable sinusoids (§8)
      const breathe = 1 + Math.sin(t * 0.9) * 0.06 + Math.sin(t * 1.37) * 0.06;
      shellMat.color.copy(shellBase).multiplyScalar(breathe);
      poolMat.opacity = 0.78 + Math.sin(t * 1.37) * 0.08;

      // micro-shiver through a random arc of blocks every 7–15s (§8)
      if (t > nextShiver) {
        nextShiver = t + 7 + Math.random() * 8;
        const azC = Math.random() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
          if (angDiff(azArr[i], azC) < 0.55) vel[i] += 0.06 + Math.random() * 0.04;
        }
      }

      // inertial pointer raycast onto the proxy dome
      let hasHit = false;
      if (pointerActive && pointerInside) {
        raycaster.setFromCamera(ndc, camera);
        hasHit = raycaster.ray.intersectSphere(proxySphere, hit) !== null;
      }
      // a fast sweep raises the bump a little higher — never harder, just taller;
      // the whole field also BREATHES on two incommensurate sinusoids — the
      // energy holding the cluster is itself unsteady (§8)
      const fieldPulse = 1 + Math.sin(t * 1.9) * 0.06 + Math.sin(t * 2.77) * 0.05;
      const liftBoost = LIFT_MAX * (1 + Math.min(pointerSpeed, 1.5) * 0.25) * fieldPulse;
      const invSigma2 = 1 / (SIGMA * SIGMA);
      const dampIntro = Math.max(0, 1 - DAMP * dt);
      const dampUp = Math.max(0, 1 - C_UP * dt);
      const dampDn = Math.max(0, 1 - C_DN * dt);
      const dampFlt = Math.max(0, 1 - C_FLT * dt);
      const rotDamp = Math.max(0, 1 - 8 * dt);

      maxLiftNow = 0;
      hoveredNow = 0;
      let maxVelNow = 0;
      let maxRotNow = 0;
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        let pulse = 0; // this brick's float phase — shared by height and glow
        if (t - introStart >= release[i]) {
          // the traveling bump: gaussian height field centred on the (inertial) hit
          let g = 0;
          let awayX = 0;
          let awayY = 0;
          let awayZ = 0;
          if (hasHit && settled[i]) {
            const dx = base[i3] - hit.x;
            const dy = base[i3 + 1] - hit.y;
            const dz = base[i3 + 2] - hit.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            g = Math.exp(-d2 * invSigma2);
            if (g > 0.02) {
              awayX = dx;
              awayY = dy;
              awayZ = dz;
            } else g = 0;
          }

          if (!settled[i]) {
            // intro assembly keeps the §2 spring — scattered bricks swirl home
            vel[i] += -K * off[i] * dt;
            vel[i] *= dampIntro;
            off[i] += vel[i] * dt;
            if (Math.abs(off[i]) < cap[i]) settled[i] = 1;
          } else {
            // the energy PROPAGATES: each brick chases the bump through its own
            // smoothed target — the centre brick answers first, the flanks join
            // tens of ms later (chase rate ∝ proximity, seeded per brick)
            const raw = g * liftBoost * seed[i];
            const chase = raw > tgt[i] ? SMOOTH_UP * rateSeed[i] * (0.35 + 0.65 * g) : SMOOTH_DN;
            tgt[i] += (raw - tgt[i]) * Math.min(1, chase * dt);

            const lev = tgt[i] > 0.02; // held by the field — never parked
            let target = tgt[i];
            if (lev) {
              if (!active[i]) {
                active[i] = 1;
                // one-shot jolt — the energy GRABS it (floored so a bump that
                // ARRIVES at a brick still pops it, not only a direct hit)
                vel[i] += KICK * (0.25 + 0.75 * g) * seed[i];
              }
              // living float: two incommensurate sinusoids, amplitude ∝ lift —
              // the raised cluster shimmers like it's held by an unstable field
              pulse = Math.sin(t * fA[i] + phA[i]) * 0.625 + Math.sin(t * fB[i] + phB[i]) * 0.375;
              target += tgt[i] * FLOAT_AMP * pulse;
            } else active[i] = 0;

            // three-regime spring: firm push UP (underdamped — jelly overshoot),
            // medium-soft float-follow while the field still holds the brick,
            // and the SLOW elastic release (incl. the dip past seated) the
            // instant the bump leaves it — never yanked down by a dying target
            const held = lev && g > 0.02;
            const firm = held && target > off[i];
            vel[i] += (target - off[i]) * (firm ? K_UP : held ? K_FLT : K_DN) * dt;
            vel[i] *= firm ? dampUp : held ? dampFlt : dampDn;
            off[i] += vel[i] * dt;
            // soft floor: a released brick may dip a hair below seated, then re-settle
            if (off[i] < -0.12 * THICK) {
              off[i] = -0.12 * THICK;
              vel[i] *= -0.35;
            }
          }

          // tilt: lean AWAY from the cursor, strongest on the bump's flanks
          // (the brick right under the cursor rises flat — petals part around it)
          let tTarget = 0;
          if (g > 0) {
            // project "away" onto the tangent plane and take the rotation axis
            const nx = nrm[i3];
            const ny = nrm[i3 + 1];
            const nz = nrm[i3 + 2];
            const dot = awayX * nx + awayY * ny + awayZ * nz;
            let tx = awayX - nx * dot;
            let ty = awayY - ny * dot;
            let tz = awayZ - nz * dot;
            const tl = Math.hypot(tx, ty, tz);
            if (tl > 0.001) {
              tx /= tl;
              ty /= tl;
              tz /= tl;
              // axis = n × away — smoothed so the lean flows as the cursor orbits
              const axT = ny * tz - nz * ty;
              const ayT = nz * tx - nx * tz;
              const azT = nx * ty - ny * tx;
              const s = Math.min(1, 10 * dt);
              tiltAx[i3] += (axT - tiltAx[i3]) * s;
              tiltAx[i3 + 1] += (ayT - tiltAx[i3 + 1]) * s;
              tiltAx[i3 + 2] += (azT - tiltAx[i3 + 2]) * s;
              const al = Math.hypot(tiltAx[i3], tiltAx[i3 + 1], tiltAx[i3 + 2]);
              if (al > 0.001) {
                tiltAx[i3] /= al;
                tiltAx[i3 + 1] /= al;
                tiltAx[i3 + 2] /= al;
              }
              // peaks mid-flank; a slow random-phase wobble keeps the lean alive
              tTarget =
                TILT_MAX * 4 * g * (1 - g) * seed[i] * (1 + 0.25 * Math.sin(t * fA[i] * 0.53 + phB[i]));
            }
          }
          rotVel[i] += (tTarget - rot[i]) * 70 * dt;
          rotVel[i] *= rotDamp;
          rot[i] += rotVel[i] * dt;
        }

        const lift = Math.abs(off[i]);
        if (lift > maxLiftNow) maxLiftNow = lift;
        if (settled[i] && off[i] > cap[i] * 0.15) hoveredNow++;
        const av = Math.abs(vel[i]);
        if (av > maxVelNow) maxVelNow = av;
        const ar = Math.abs(rot[i]);
        if (ar > maxRotNow) maxRotNow = ar;

        _p.set(base[i3] + nrm[i3] * off[i], base[i3 + 1] + nrm[i3 + 1] * off[i], base[i3 + 2] + nrm[i3 + 2] * off[i]);
        _q.fromArray(quats, i * 4);
        if (rot[i] !== 0) {
          _qt.setFromAxisAngle(_ax.set(tiltAx[i3], tiltAx[i3 + 1], tiltAx[i3 + 2]), rot[i]);
          _q.premultiply(_qt);
        }
        _s.set(scales[i3], scales[i3 + 1], scales[i3 + 2]);
        _m.compose(_p, _q, _s);
        meshes[meshIdxOf[i]].setMatrixAt(instIdxOf[i], _m);

        // more interior light escapes as the brick lifts; while levitating the
        // flare BREATHES on the same float phase — a live core, not a lamp
        let lr = Math.min(1, Math.max(0, off[i] / cap[i]));
        if (pulse !== 0) {
          lr *= 1 + pulse * 0.35;
          if (lr > 1) lr = 1;
          else if (lr < 0) lr = 0;
        }
        const ca = colArrs[meshIdxOf[i]];
        const c3 = instIdxOf[i] * 3;
        ca[c3] = baseCol[i3] + (cLift.r - baseCol[i3]) * lr;
        ca[c3 + 1] = baseCol[i3 + 1] + (cLift.g - baseCol[i3 + 1]) * lr;
        ca[c3 + 2] = baseCol[i3 + 2] + (cLift.b - baseCol[i3 + 2]) * lr;
      }
      for (const im of meshes) {
        im.instanceMatrix.needsUpdate = true;
        im.instanceColor!.needsUpdate = true;
      }
      // shadow gate: re-render the shadow pass only while the dome is awake
      // (any lift, tilt or velocity beyond epsilon — covers intro, hover, shiver)
      if (maxLiftNow > 0.003 || maxVelNow > 0.02 || maxRotNow > 0.003) renderer.shadowMap.needsUpdate = true;

      // snow caps follow the camera's real up; diamond dust twinkles
      upView.value.set(0, 1, 0).applyQuaternion(_upq.copy(camera.quaternion).invert());
      for (let i = 0; i < SPARK; i++) {
        const tw = Math.max(0, Math.sin(t * sparkPhase[i * 2 + 1] + sparkPhase[i * 2]));
        const b = 0.08 + Math.pow(tw, 14) * 2.2;
        sparkCol[i * 3] = b;
        sparkCol[i * 3 + 1] = b;
        sparkCol[i * 3 + 2] = b * 1.06;
      }
      sparkColAttr.needsUpdate = true;

      // snow drifts down, wraps around
      for (let i = 0; i < SNOW; i++) {
        const i3 = i * 3;
        snowPos[i3 + 1] -= snowSeed[i * 2 + 1] * dt;
        snowPos[i3] += Math.sin(t * 0.6 + snowSeed[i * 2]) * 0.12 * dt;
        if (snowPos[i3 + 1] < 0) snowPos[i3 + 1] += 5.5;
      }
      snowGeo.attributes.position.needsUpdate = true;

      if (mode === 'full') post.render(t, Math.min(pointerSpeed, 2.5) * 0.006);
      else post.renderPlain();
    });

    // ---------- QA hooks (§10) ----------
    (window as unknown as { __iglooInfo: () => { blocks: number; maxLift: number; hovered: number } }).__iglooInfo =
      () => ({ blocks: n, maxLift: maxLiftNow, hovered: hoveredNow });
    (window as unknown as { __iglooScreenPos: () => { x: number; y: number } }).__iglooScreenPos = () => {
      const v = _p.set(0, DOME_R, 0).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    (window as unknown as { __iglooRenderOnce: () => void }).__iglooRenderOnce = () => {
      post.render(performance.now() / 1000);
      renderer.getContext().finish();
    };

    section.classList.add('is-live');
  }
}
