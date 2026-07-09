import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* The VULCAN GLASS post stack, ported verbatim (PLAYBOOK §5 — "ordinea e lege"):
   RenderPass → UnrealBloom (0.35/0.25/0.85) → OutputPass (ACES+sRGB) →
   final pass: radial chromatic aberration + luma-weighted soft-light grain
   + vignette + dither, on an MSAA HalfFloat target. */

export type PostStack = {
  composer: EffectComposer;
  render: (timeSec: number, caBoost?: number) => void;
  setSize: (w: number, h: number) => void;
  setBloom: (on: boolean) => void;
  setPixelRatio: (dpr: number) => void;
};

export function makePostStack(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number
): PostStack {
  let dpr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
    samples: 2, // MSAA 2x — the 4x difference is invisible, the cost is not
    type: THREE.HalfFloatType,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.35, 0.25, 0.85);
  composer.addPass(bloom);

  composer.addPass(new OutputPass()); // tone mapping BEFORE grain, or grain breaks in shadows

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
  composer.addPass(finalPass);

  return {
    composer,
    render(timeSec: number, caBoost = 0) {
      finalPass.uniforms.uFrame.value = Math.floor(timeSec * 24); // reseeded at 24fps = filmic
      finalPass.uniforms.uCA.value = 0.004 + caBoost; // CA grows only with motion — igloo language
      composer.render();
    },
    setSize(w: number, h: number) {
      composer.setSize(w, h);
      finalPass.uniforms.uRes.value.set(w * dpr, h * dpr);
    },
    setBloom(on: boolean) {
      bloom.enabled = on;
    },
    setPixelRatio(next: number) {
      dpr = next;
      renderer.setPixelRatio(next);
      const size = renderer.getSize(new THREE.Vector2());
      composer.setPixelRatio(next); // re-runs composer.setSize at the stored logical size
      finalPass.uniforms.uRes.value.set(size.x * next, size.y * next);
    },
  };
}

/* FPS guard (PLAYBOOK §9): averages frame time over 60 frames; when it dips
   below ~42fps it steps effects down. Spikes >250ms (compile, hidden tab) are ignored. */
export function makeFpsGuard(onStepDown: (level: number) => void): (dtMs: number) => void {
  let acc = 0;
  let count = 0;
  let level = 0;
  return (dtMs: number) => {
    if (dtMs > 250 || level >= 2) return;
    acc += dtMs;
    if (++count < 60) return;
    const avg = acc / count;
    acc = 0;
    count = 0;
    if (avg > 1000 / 42) onStepDown(++level);
  };
}
