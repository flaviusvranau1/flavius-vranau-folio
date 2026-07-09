import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* The VULCAN GLASS post stack, ported verbatim (PLAYBOOK §5 — "ordinea e lege"):
   RenderPass → UnrealBloom (0.35/0.25/0.85) → OutputPass (ACES+sRGB) →
   final pass: radial chromatic aberration + luma-weighted soft-light grain
   + vignette + dither, on an MSAA HalfFloat target.

   Weak-GPU budget: bloom runs at HALF the composer resolution (its own mip
   chain then halves again — visually identical, big fill-rate win), and a
   GLOBAL adaptive-quality controller steps every registered stack down
   together: L1 bloom off → L2 pixelRatio 1.0 → L3 bypass the composer
   entirely (plain renderer.render straight to the canvas). */

export type PostStack = {
  composer: EffectComposer;
  render: (timeSec: number, caBoost?: number) => void;
  renderPlain: () => void;
  setSize: (w: number, h: number) => void;
  setBloom: (on: boolean) => void;
  setPixelRatio: (dpr: number) => void;
};

// ---------------- global adaptive quality ----------------

// The last session's level is restored so a weak GPU doesn't re-suffer the
// L0→L3 ramp (several seconds of jank) on every single page load.
let perfLevel = 0;
try {
  perfLevel = Math.max(0, Math.min(3, Number(sessionStorage.getItem('__perfLevel')) || 0));
} catch {
  /* storage may be unavailable — start at full quality */
}
const stacks = new Set<(level: number) => void>();

declare global {
  interface Window {
    __perfLevel: number;
  }
}
if (typeof window !== 'undefined') window.__perfLevel = perfLevel;

function setPerfLevel(next: number): void {
  const lv = Math.max(0, Math.min(3, next));
  if (lv === perfLevel) return;
  perfLevel = lv;
  window.__perfLevel = lv;
  try {
    sessionStorage.setItem('__perfLevel', String(lv));
  } catch {
    /* non-fatal */
  }
  for (const apply of stacks) apply(lv);
}

/* Frame-time feed for the controller. Step-down window: 30 frames OR 1.2s of
   accumulated frame time, whichever fills first — at 3fps a pure frame count
   would take 10 seconds to react, which is exactly when reacting matters most.
   Average below ~42fps steps DOWN one level. Recovery is slow and cautious:
   sustained >55fps steps back UP one level, and the required good time
   DOUBLES after every step-down (5s → 10s → 20s cap) so a borderline GPU
   cannot flap between levels mid-scroll. Long frames are CLAMPED to 250ms,
   not discarded — a total collapse (every frame slow, e.g. 120 WebP decodes
   landing at once) must still trip the ladder; averaging absorbs genuine
   one-off spikes on its own. Only the scene that actually rendered this frame
   should feed it — the stage coordinator guarantees one scene at a time. */
let acc = 0;
let count = 0;
let goodMs = 0;
let goodNeed = 5000;

export function notePerfFrame(dtMs: number): void {
  if (dtMs > 250) dtMs = 250;
  if (dtMs <= 1000 / 55) {
    goodMs += dtMs;
    if (goodMs > goodNeed && perfLevel > 0) {
      setPerfLevel(perfLevel - 1);
      goodMs = 0;
      acc = 0;
      count = 0;
    }
  } else {
    goodMs = 0;
  }
  acc += dtMs;
  count++;
  if (count < 30 && !(acc >= 1200 && count >= 6)) return;
  const avg = acc / count;
  acc = 0;
  count = 0;
  if (avg > 1000 / 42) {
    setPerfLevel(perfLevel + 1);
    goodNeed = Math.min(goodNeed * 2, 20000);
    goodMs = 0;
  }
}

/* Back-compat shim: scenes built against the old per-scene guard keep working.
   The per-scene callback is intentionally ignored — every stack made by
   makePostStack is already wired to the global controller, so levels apply
   everywhere at once (and can recover, which the old one-way guard never did). */
export function makeFpsGuard(_onStepDown: (level: number) => void): (dtMs: number) => void {
  return notePerfFrame;
}

// ---------------- post stack ----------------

export function makePostStack(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number
): PostStack {
  let dpr = renderer.getPixelRatio();
  const baseDpr = dpr; // restored when the controller recovers from L2
  const target = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
    samples: 2, // MSAA 2x — the 4x difference is invisible, the cost is not
    type: THREE.HalfFloatType,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr);

  const bloom = new UnrealBloomPass(new THREE.Vector2(width / 2, height / 2), 0.35, 0.25, 0.85);
  // Bloom at half resolution FOR GOOD: EffectComposer.setSize re-sizes every
  // pass to the full buffer, so halve inside the pass's own setSize instead.
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w: number, h: number) => bloomSetSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));

  const finalPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uFrame: { value: 0 },
      uCA: { value: 0.004 },
      uRes: { value: new THREE.Vector2(width * dpr, height * dpr) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uFrame;
      uniform float uCA;
      uniform vec2 uRes;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
      vec3 softLight(vec3 base, vec3 blend) {
        return mix(sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
                   2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
                   step(base, vec3(0.5)));
      }
      void main() {
        vec2 uv = vUv;
        vec2 c = uv - 0.5;
        float d = dot(c, c);
        float ca = uCA * d;
        vec3 col;
        col.r = texture2D(tDiffuse, uv + c * ca).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - c * ca).b;
        vec2 gp = floor(uv * uRes / 2.0);
        float g = hash(gp + uFrame);
        vec3 grained = softLight(col, vec3(g));
        float response = smoothstep(0.05, 0.5, luma(col));
        vec3 grainResult = mix(grained, col, pow(response, 2.0));
        col = mix(col, grainResult, 0.35);
        col += (hash(uv * uRes) - 0.5) / 255.0;
        float v = smoothstep(0.7, 0.2, d);
        col *= mix(0.82, 1.0, v);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass()); // tone mapping BEFORE grain, or grain breaks in shadows
  composer.addPass(finalPass);
  composer.setSize(width, height);

  const applyDpr = (next: number) => {
    dpr = next;
    renderer.setPixelRatio(next);
    const size = renderer.getSize(new THREE.Vector2());
    composer.setPixelRatio(next); // re-runs composer.setSize at the stored logical size
    finalPass.uniforms.uRes.value.set(size.x * next, size.y * next);
  };

  const applyLevel = (lv: number) => {
    bloom.enabled = lv < 1;
    const wantDpr = lv >= 2 ? Math.min(1, baseDpr) : baseDpr;
    if (dpr !== wantDpr) applyDpr(wantDpr);
  };
  stacks.add(applyLevel);
  applyLevel(perfLevel); // late-booting scenes adopt the current global level

  return {
    composer,
    render(timeSec: number, caBoost = 0) {
      if (perfLevel >= 3) {
        // L3: skip the whole composer — tone mapping + sRGB happen in the
        // direct-to-canvas path, so the image stays correct, just ungraded.
        renderer.render(scene, camera);
        return;
      }
      finalPass.uniforms.uFrame.value = Math.floor(timeSec * 24); // reseeded at 24fps = filmic
      finalPass.uniforms.uCA.value = 0.004 + caBoost; // CA grows only with motion — igloo language
      composer.render();
    },
    renderPlain() {
      renderer.render(scene, camera);
    },
    setSize(w: number, h: number) {
      composer.setSize(w, h);
      finalPass.uniforms.uRes.value.set(w * dpr, h * dpr);
    },
    setBloom(on: boolean) {
      bloom.enabled = on;
    },
    setPixelRatio(next: number) {
      applyDpr(next);
    },
  };
}
