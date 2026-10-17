import { cpSync, mkdirSync } from 'node:fs';

// The tracking runtime is served from this app, so nothing loads from a third party.
const source = 'node_modules/@mediapipe/tasks-vision/wasm';
const target = 'public/mediapipe/wasm';
const files = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

mkdirSync(target, { recursive: true });
for (const file of files) {
  cpSync(`${source}/${file}`, `${target}/${file}`);
}
console.log(`Copied ${files.length} tracking runtime files to ${target}`);
