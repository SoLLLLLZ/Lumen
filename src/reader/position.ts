import type { BookWord } from './words';

export const POSITION_KEY = 'lumen.reader.position';

type PositionStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Remembers the text offset of the first word on screen. Fails quietly. */
export function savePosition(storage: PositionStorage, offset: number): void {
  try {
    storage.setItem(POSITION_KEY, String(offset));
  } catch {
    // Storage can be blocked or full. Reading still works without it.
  }
}

/** Index of the saved word, or 0 when nothing valid was saved. */
export function loadWordIndex(
  storage: PositionStorage,
  words: BookWord[],
): number {
  try {
    const saved = storage.getItem(POSITION_KEY);
    if (saved === null) return 0;
    const index = words.findIndex((word) => word.offset === Number(saved));
    return Math.max(0, index);
  } catch {
    return 0;
  }
}
