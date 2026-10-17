import type { BookWord } from './words';

/** Words [start, end) of the book shown on one page. */
export interface Page {
  start: number;
  end: number;
}

/** Whether words [start, end) fit on one page. Must be true for smaller ranges too. */
export type Fits = (start: number, end: number) => boolean;

const FIRST_GUESS = 200;
const SEARCH_STEP = 8;

/**
 * Largest number of words from `start` (at most `max`) that fit, but at least
 * one so a page can never be empty. Gallops from `guess`, then bisects.
 */
function largestFit(
  start: number,
  max: number,
  guess: number,
  fits: Fits,
): number {
  let low = 0;
  let high = max + 1;
  let probe = Math.min(Math.max(guess, 1), max);
  let step = SEARCH_STEP;
  while (high - low > 1) {
    if (fits(start, start + probe)) {
      low = probe;
    } else {
      high = probe;
    }
    if (high - low <= 1) break;
    if (high === max + 1) {
      probe = Math.min(max, low + step);
      step *= 2;
    } else if (low === 0) {
      probe = Math.max(1, high - step);
      step *= 2;
    } else {
      probe = low + Math.floor((high - low) / 2);
    }
  }
  return Math.max(1, low);
}

/** Splits the book into pages. Each chapter starts on a new page. */
export function paginate(words: BookWord[], fits: Fits): Page[] {
  const chapterStarts: number[] = [];
  words.forEach((word, index) => {
    if (word.chapterStart) chapterStarts.push(index);
  });

  const pages: Page[] = [];
  let guess = FIRST_GUESS;
  chapterStarts.forEach((chapterStart, index) => {
    const chapterEnd = chapterStarts[index + 1] ?? words.length;
    let start = chapterStart;
    while (start < chapterEnd) {
      const size = largestFit(start, chapterEnd - start, guess, fits);
      pages.push({ start, end: start + size });
      start += size;
      guess = size;
    }
  });
  return pages;
}

/** Index of the page that shows the given word. */
export function pageContaining(pages: Page[], wordIndex: number): number {
  const index = pages.findIndex(
    (page) => wordIndex >= page.start && wordIndex < page.end,
  );
  return index === -1 ? 0 : index;
}
