import type { Book } from './book';

export interface BookWord {
  text: string;
  /** Character position in the whole book text. Never changes with layout. */
  offset: number;
  kind: 'heading' | 'body';
  /** First word of a paragraph or heading. */
  paragraphStart: boolean;
  /** First word of a chapter heading. */
  chapterStart: boolean;
}

/** Paragraphs are separated by a blank line, words by a single space. */
export function separatorBefore(word: BookWord): string {
  return word.paragraphStart ? '\n\n' : ' ';
}

/** Splits the book into words, each with its offset in the book text. */
export function bookToWords(book: Book): BookWord[] {
  const words: BookWord[] = [];
  let offset = 0;

  function addParagraph(
    text: string,
    kind: BookWord['kind'],
    chapterStart: boolean,
  ) {
    text.split(/\s+/).forEach((piece, index) => {
      const word: BookWord = {
        text: piece,
        offset: 0,
        kind,
        paragraphStart: index === 0,
        chapterStart: chapterStart && index === 0,
      };
      if (words.length > 0) offset += separatorBefore(word).length;
      word.offset = offset;
      offset += piece.length;
      words.push(word);
    });
  }

  for (const chapter of book.chapters) {
    addParagraph(`${chapter.number} ${chapter.title}`, 'heading', true);
    for (const paragraph of chapter.paragraphs) {
      addParagraph(paragraph, 'body', false);
    }
  }
  return words;
}

/** The text of words [start, end), with the right spacing between them. */
export function textOfRange(
  words: BookWord[],
  start: number,
  end: number,
): string {
  let text = '';
  for (let i = start; i < end; i++) {
    const word = words[i];
    if (!word) throw new Error(`No word at ${i}`);
    text += (i > start ? separatorBefore(word) : '') + word.text;
  }
  return text;
}

/** The whole book as one string, built straight from the book data. */
export function bookText(book: Book): string {
  return book.chapters
    .flatMap((chapter) => [
      `${chapter.number} ${chapter.title}`,
      ...chapter.paragraphs,
    ])
    .join('\n\n');
}
