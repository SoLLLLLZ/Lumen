import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { aliceBook, aliceWords } from '../reader/alice';
import { pageContaining, paginate, type Page } from '../reader/paginate';
import { measureWithDom, renderWords } from '../reader/renderPage';

const RESIZE_DELAY_MS = 150;
const TEXT_FIELDS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

const FALLBACK_PAGE: Page[] = [{ start: 0, end: 1 }];

export function Reader() {
  const pageRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Page[]>(FALLBACK_PAGE);
  const [pageIndex, setPageIndex] = useState(0);
  // The first word on screen. It survives resizing, page numbers do not.
  const anchorRef = useRef(0);

  const repaginate = useCallback(() => {
    const measureEl = measureRef.current;
    // A hidden or collapsed page cannot be measured. Wait for a real size.
    if (!measureEl || measureEl.clientHeight === 0) return;
    const next = paginate(aliceWords, measureWithDom(aliceWords, measureEl));
    setPages(next);
    setPageIndex(pageContaining(next, anchorRef.current));
  }, []);

  useLayoutEffect(() => {
    repaginate();
    const container = measureRef.current?.parentElement;
    if (!container) return;
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(repaginate, RESIZE_DELAY_MS);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [repaginate]);

  const page = pages[pageIndex] ?? FALLBACK_PAGE[0];
  useLayoutEffect(() => {
    if (!pageRef.current || !page) return;
    renderWords(pageRef.current, aliceWords, page.start, page.end);
    anchorRef.current = page.start;
  }, [page]);

  const lastIndex = pages.length - 1;
  const turn = useCallback(
    (step: 1 | -1) => {
      setPageIndex((current) =>
        Math.min(lastIndex, Math.max(0, current + step)),
      );
    },
    [lastIndex],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && TEXT_FIELDS.has(target.tagName)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowRight') {
        turn(1);
      } else if (event.key === 'ArrowLeft') {
        turn(-1);
      } else if (event.key === ' ' && target?.tagName !== 'BUTTON') {
        event.preventDefault();
        turn(1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [turn]);

  return (
    <section aria-label="Reader" className="reader">
      <p className="reader-title">
        {aliceBook.title}, by {aliceBook.author}
      </p>
      <div className="page-frame">
        <div ref={pageRef} className="page" data-testid="page" />
        <div ref={measureRef} className="page measure" aria-hidden="true" />
      </div>
      <div className="reader-controls">
        <button
          type="button"
          onClick={() => turn(-1)}
          disabled={pageIndex === 0}
        >
          Previous page
        </button>
        <span aria-live="polite" data-testid="page-indicator">
          Page {pageIndex + 1} of {pages.length}
        </span>
        <button
          type="button"
          onClick={() => turn(1)}
          disabled={pageIndex === lastIndex}
        >
          Next page
        </button>
      </div>
    </section>
  );
}
