import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bookText } from './words';
import aliceJson from './data/alice.json';
import { parseGutenberg } from './parseGutenberg';

const raw = readFileSync(
  join(import.meta.dirname, '..', '..', 'book', 'alice-gutenberg.txt'),
  'utf8',
);
const book = parseGutenberg(raw);

describe('parseGutenberg', () => {
  it('finds the title, author and all twelve chapters in order', () => {
    expect(book.title).toBe("Alice's Adventures in Wonderland");
    expect(book.author).toBe('Lewis Carroll');
    expect(book.chapters).toHaveLength(12);
    expect(book.chapters[0]?.number).toBe('CHAPTER I.');
    expect(book.chapters[0]?.title).toBe('Down the Rabbit-Hole');
    expect(book.chapters[11]?.number).toBe('CHAPTER XII.');
  });

  it('strips the Gutenberg header, footer and licence', () => {
    const text = bookText(book);
    expect(text).not.toMatch(/gutenberg/i);
    expect(text).not.toContain('***');
    expect(text).not.toContain('Contents');
    expect(
      text.startsWith('CHAPTER I. Down the Rabbit-Hole\n\nAlice was'),
    ).toBe(true);
    expect(text.endsWith('happy summer days.\n\nTHE END')).toBe(true);
  });

  it('removes markup but keeps every word of the story', () => {
    const body = raw
      .replace(/\r\n/g, '\n')
      .split(/^\*\*\* (?:START|END) OF .*\*\*\*$/m)[1] as string;
    // Skip the contents list: the story starts at the first real heading line.
    const story = body.slice(body.search(/^CHAPTER I\.$/m));
    const words = (text: string) =>
      text
        .replace(/_/g, '')
        .replace(/\[Illustration\]/g, '')
        .split(/\s+/)
        .filter(Boolean);
    expect(words(bookText(book))).toEqual(words(story));
  });

  it('has no empty paragraphs and no stray markup', () => {
    for (const chapter of book.chapters) {
      expect(chapter.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of chapter.paragraphs) {
        expect(paragraph).not.toBe('');
        expect(paragraph).not.toContain('_');
        expect(paragraph).not.toContain('[Illustration]');
        expect(paragraph).not.toMatch(/\s{2}|\n/);
      }
    }
  });

  it('matches the committed JSON, so the app always ships the current parse', () => {
    expect(aliceJson).toEqual(book);
  });

  it('rejects text without Gutenberg markers', () => {
    expect(() => parseGutenberg('just some text')).toThrow('marker');
  });
});
