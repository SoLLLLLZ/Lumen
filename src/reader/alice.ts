import type { Book } from './book';
import aliceData from './data/alice.json';
import { bookToWords } from './words';

export const aliceBook: Book = aliceData;
export const aliceWords = bookToWords(aliceBook);
