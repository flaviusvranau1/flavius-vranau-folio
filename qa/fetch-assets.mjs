/* Downloads Poly Haven (CC0) desk-prop GLTFs @1k + a dim studio HDRI into public/. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MODELS = [
  'painted_wooden_table',
  'classic_laptop',
  'desk_lamp_arm_01',
  'potted_plant_04',
  'binder_notebook',
  'decorative_book_set_01',
  'alarm_clock_01',
  'gamepad',
];

async function dl(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return fs.statSync(dest).size;
}

let total = 0;
for (const slug of MODELS) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${slug}`)).json();
  const entry = files.gltf?.['1k']?.gltf;
  if (!entry) {
    console.log(`SKIP ${slug} — no 1k gltf`);
    continue;
  }
  const dir = path.join(ROOT, 'models', slug);
  total += await dl(entry.url, path.join(dir, path.basename(entry.url)));
  for (const [rel, meta] of Object.entries(entry.include ?? {})) {
    total += await dl(meta.url, path.join(dir, rel));
  }
  console.log(`OK ${slug}`);
}

// Dim warm photo-studio HDRI (1k HDR is plenty for env lighting)
const h = await (await fetch('https://api.polyhaven.com/files/brown_photostudio_02')).json();
const hdr = h.hdri?.['1k']?.hdr;
total += await dl(hdr.url, path.join(ROOT, 'hdri', 'studio_1k.hdr'));
console.log('OK hdri');
console.log(`total ${(total / 1024 / 1024).toFixed(1)} MB`);
