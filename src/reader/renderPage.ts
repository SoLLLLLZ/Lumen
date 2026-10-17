import type { BookWord } from './words';

/** Draws words [start, end) into the element, one span per word. */
export function renderWords(
  container: HTMLElement,
  words: BookWord[],
  start: number,
  end: number,
): void {
  container.replaceChildren();
  let block: HTMLElement | null = null;
  for (let i = start; i < end; i++) {
    const word = words[i];
    if (!word) continue;
    if (!block || word.paragraphStart) {
      block = document.createElement(word.kind === 'heading' ? 'h2' : 'p');
      container.append(block);
    } else {
      block.append(' ');
    }
    const span = document.createElement('span');
    span.className = 'word';
    span.dataset.offset = String(word.offset);
    span.textContent = word.text;
    block.append(span);
  }
}

/** A fits function that lays the words out in a hidden page and checks overflow. */
export function measureWithDom(words: BookWord[], measureEl: HTMLElement) {
  return (start: number, end: number): boolean => {
    renderWords(measureEl, words, start, end);
    return measureEl.scrollHeight <= measureEl.clientHeight;
  };
}
