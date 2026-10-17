import type { Book, Chapter } from './book';

const START_MARKER = /^\*\*\* START OF .*\*\*\*$/m;
const END_MARKER = /^\*\*\* END OF .*\*\*\*$/m;
const CHAPTER_HEADING = /^CHAPTER [IVXLC]+\.$/gm;

function headerField(text: string, field: string): string {
  const match = new RegExp(`^${field}:\\s*(.+)$`, 'm').exec(text);
  if (!match?.[1]) throw new Error(`Missing ${field} in book header`);
  return match[1].trim();
}

function toParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.replace(/_/g, '').replace(/\s+/g, ' ').trim())
    .filter((block) => block !== '' && block !== '[Illustration]');
}

/** Turns a Project Gutenberg plain-text file into chapters of paragraphs. */
export function parseGutenberg(raw: string): Book {
  const text = raw.replace(/\r\n/g, '\n');
  const start = START_MARKER.exec(text);
  const end = END_MARKER.exec(text);
  if (!start || !end) throw new Error('Book start or end marker not found');

  const body = text.slice(start.index + start[0].length, end.index);
  const headings = [...body.matchAll(CHAPTER_HEADING)];
  if (headings.length === 0) throw new Error('No chapters found');

  const chapters: Chapter[] = headings.map((heading, index) => {
    const from = heading.index + heading[0].length;
    const to = headings[index + 1]?.index ?? body.length;
    const [title, ...paragraphs] = toParagraphs(body.slice(from, to));
    if (!title) throw new Error(`Chapter ${heading[0]} has no title`);
    return { number: heading[0], title, paragraphs };
  });

  return {
    title: headerField(text, 'Title'),
    author: headerField(text, 'Author'),
    chapters,
  };
}
