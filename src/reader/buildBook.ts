import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGutenberg } from './parseGutenberg';

const root = join(import.meta.dirname, '..', '..');
const raw = readFileSync(join(root, 'book', 'alice-gutenberg.txt'), 'utf8');
const book = parseGutenberg(raw);
const output = join(import.meta.dirname, 'data', 'alice.json');
writeFileSync(output, JSON.stringify(book));
console.log(`Wrote ${book.chapters.length} chapters to ${output}`);
