import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildClipLibrary } from './clipLibrary';

const dir = join(import.meta.dirname, 'clips', 'synthetic');
mkdirSync(dir, { recursive: true });
for (const file of readdirSync(dir)) {
  if (file.endsWith('.json')) rmSync(join(dir, file));
}
const clips = buildClipLibrary();
for (const clip of clips) {
  writeFileSync(join(dir, `${clip.name}.json`), JSON.stringify(clip));
}
console.log(`Wrote ${clips.length} clips to ${dir}`);
