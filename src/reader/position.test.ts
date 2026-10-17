import { describe, expect, it } from 'vitest';
import { aliceWords } from './alice';
import { loadWordIndex, POSITION_KEY, savePosition } from './position';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe('reading position', () => {
  it('restores the word that was saved, for any word', () => {
    for (const index of [0, 1, 500, 12345, aliceWords.length - 1]) {
      const storage = memoryStorage();
      savePosition(storage, aliceWords[index]?.offset ?? -1);
      expect(loadWordIndex(storage, aliceWords)).toBe(index);
    }
  });

  it('starts at the beginning when nothing is saved', () => {
    expect(loadWordIndex(memoryStorage(), aliceWords)).toBe(0);
  });

  it('starts at the beginning when the saved value is not a word offset', () => {
    for (const bad of ['banana', '-5', '999999999', '']) {
      const storage = memoryStorage({ [POSITION_KEY]: bad });
      expect(loadWordIndex(storage, aliceWords)).toBe(0);
    }
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => savePosition(broken, 10)).not.toThrow();
    expect(loadWordIndex(broken, aliceWords)).toBe(0);
  });
});
