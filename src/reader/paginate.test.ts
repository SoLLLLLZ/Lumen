import { describe, expect, it } from 'vitest';
import { aliceBook, aliceWords } from './alice';
import { pageContaining, paginate, type Fits, type Page } from './paginate';
import { bookText, textOfRange } from './words';

/** A page that holds at most `capacity` characters, counting spaces. */
function byCharacters(capacity: number): Fits {
  return (start, end) => {
    const text = textOfRange(aliceWords, start, end);
    return text.length <= capacity || end - start <= 1;
  };
}

const CAPACITIES = [150, 600, 1500, 4000];
const text = bookText(aliceBook);

function joinPages(pages: Page[]): string {
  return pages
    .map((page) => textOfRange(aliceWords, page.start, page.end))
    .join('\n\n');
}

describe('word offsets', () => {
  it('points at the same characters in the book text', () => {
    for (const word of aliceWords) {
      expect(text.slice(word.offset, word.offset + word.text.length)).toBe(
        word.text,
      );
    }
  });

  it('is the book text split into words, nothing added or dropped', () => {
    expect(aliceWords.map((word) => word.text)).toEqual(
      text.split(/\s+/).filter(Boolean),
    );
  });
});

describe('paginate', () => {
  for (const capacity of CAPACITIES) {
    describe(`with ${capacity} characters per page`, () => {
      const pages = paginate(aliceWords, byCharacters(capacity));

      it('covers every word exactly once, in order', () => {
        expect(pages[0]?.start).toBe(0);
        expect(pages.at(-1)?.end).toBe(aliceWords.length);
        pages.forEach((page, index) => {
          expect(page.end).toBeGreaterThan(page.start);
          if (index > 0) expect(page.start).toBe(pages[index - 1]?.end);
        });
      });

      it('rebuilds the original text exactly from its pages', () => {
        const rebuilt = pages
          .map((page) => aliceWords.slice(page.start, page.end))
          .flat()
          .map((word) => word.text)
          .join(' ');
        expect(rebuilt).toBe(text.split(/\s+/).join(' '));
      });

      it('fits every page, and could not fit one more word', () => {
        const fits = byCharacters(capacity);
        for (const page of pages) {
          expect(fits(page.start, page.end)).toBe(true);
        }
        const middle = pages[Math.floor(pages.length / 2)] as Page;
        const chapterEnds = aliceWords
          .map((word, i) => (word.chapterStart ? i : -1))
          .filter((i) => i > 0);
        if (!chapterEnds.includes(middle.end)) {
          expect(fits(middle.start, middle.end + 1)).toBe(false);
        }
      });

      it('gives the same pages every time', () => {
        expect(paginate(aliceWords, byCharacters(capacity))).toEqual(pages);
      });

      it('starts every chapter on a new page', () => {
        const starts = new Set(pages.map((page) => page.start));
        aliceWords.forEach((word, index) => {
          if (word.chapterStart) expect(starts.has(index)).toBe(true);
        });
      });
    });
  }

  it('joins the pages back into the book text when separators are kept', () => {
    const pages = paginate(aliceWords, byCharacters(1500));
    const wordsOnly = (value: string) => value.replace(/\s+/g, ' ');
    expect(wordsOnly(joinPages(pages))).toBe(wordsOnly(text));
  });

  it('puts one word on a page that cannot hold even that', () => {
    const pages = paginate(aliceWords, () => false);
    expect(pages).toHaveLength(aliceWords.length);
  });

  it('puts a whole chapter on one page when everything fits', () => {
    const pages = paginate(aliceWords, () => true);
    expect(pages).toHaveLength(aliceBook.chapters.length);
  });
});

describe('pageContaining', () => {
  const pages = paginate(aliceWords, byCharacters(600));

  it('finds the page that holds a word, for every word', () => {
    aliceWords.forEach((_, index) => {
      const page = pages[pageContaining(pages, index)] as Page;
      expect(index).toBeGreaterThanOrEqual(page.start);
      expect(index).toBeLessThan(page.end);
    });
  });

  it('keeps the same text on screen when the page size changes', () => {
    const wordIndex = 12345;
    const small = pages[pageContaining(pages, wordIndex)] as Page;
    const bigPages = paginate(aliceWords, byCharacters(2400));
    const big = bigPages[pageContaining(bigPages, small.start)] as Page;
    expect(small.start).toBeGreaterThanOrEqual(big.start);
    expect(small.start).toBeLessThan(big.end);
  });
});
