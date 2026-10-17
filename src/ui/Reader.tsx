import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { EventBus } from '../engine/eventBus';
import { aliceBook, aliceWords } from '../reader/alice';
import { loadWordIndex, savePosition } from '../reader/position';
import { pageContaining, paginate, type Page } from '../reader/paginate';
import {
  DEFAULT_VIEW,
  PanSession,
  clampPan,
  isEmptySpace,
  zoomAbout,
  type Point,
  type Rect,
  type View,
} from '../reader/view';
import { measureWithDom, renderWords } from '../reader/renderPage';

export const PAGE_TURN_MS = 400;
const RESIZE_DELAY_MS = 150;
const SLIDE_PX = 40;
const TEXT_FIELDS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

const FALLBACK_PAGE: Page[] = [{ start: 0, end: 1 }];

function viewportRect(): Rect {
  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Reader({ bus }: { bus: EventBus }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>(DEFAULT_VIEW);
  const panSession = useRef(new PanSession());
  const [pages, setPages] = useState<Page[]>(FALLBACK_PAGE);
  const [pageIndex, setPageIndex] = useState(0);
  // The first word on screen. It survives resizing, page numbers do not.
  const anchorRef = useRef(loadWordIndex(localStorage, aliceWords));
  const turnRef = useRef<1 | -1 | 0>(0);

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
    const element = pageRef.current;
    if (!element || !page) return;
    renderWords(element, aliceWords, page.start, page.end);
    // The placeholder page before the first pagination must not replace the saved place.
    if (pages === FALLBACK_PAGE) return;
    anchorRef.current = page.start;
    savePosition(localStorage, aliceWords[page.start]?.offset ?? 0);
    if (turnRef.current !== 0 && !prefersReducedMotion()) {
      const from = turnRef.current * SLIDE_PX;
      element.animate(
        [
          { opacity: 0, transform: `translateX(${from}px)` },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        { duration: PAGE_TURN_MS, easing: 'ease-out' },
      );
    }
    turnRef.current = 0;
  }, [page, pages]);

  const lastIndex = pages.length - 1;
  const turn = useCallback(
    (step: 1 | -1) => {
      turnRef.current = step;
      setPageIndex((current) =>
        Math.min(lastIndex, Math.max(0, current + step)),
      );
    },
    [lastIndex],
  );

  const startPinch = useCallback((point: Point) => {
    const frame = frameRef.current;
    const text = pageRef.current;
    if (!frame || !text) return;
    const textRect = text.getBoundingClientRect();
    const style = getComputedStyle(text);
    // Padding is drawn at the current zoom.
    const zoom = text.offsetWidth > 0 ? textRect.width / text.offsetWidth : 1;
    const pad = (value: string) => (parseFloat(value) || 0) * zoom;
    const empty = isEmptySpace(point, {
      page: frame.getBoundingClientRect(),
      text: {
        left: textRect.left + pad(style.paddingLeft),
        top: textRect.top + pad(style.paddingTop),
        right: textRect.right - pad(style.paddingRight),
        bottom: textRect.bottom - pad(style.paddingBottom),
      },
      viewport: viewportRect(),
    });
    panSession.current.start(empty);
    document.body.classList.toggle('panning', empty);
  }, []);

  /** Where the page's top left corner sits with no pan applied. */
  const pageOrigin = useCallback((frame: HTMLElement): Point => {
    const shown = frame.getBoundingClientRect();
    return {
      x: shown.left - viewRef.current.x,
      y: shown.top - viewRef.current.y,
    };
  }, []);

  const showView = useCallback(
    (wanted: View) => {
      const frame = frameRef.current;
      if (!frame) return;
      const origin = pageOrigin(frame);
      const base: Rect = {
        left: origin.x,
        top: origin.y,
        right: origin.x + frame.offsetWidth * wanted.scale,
        bottom: origin.y + frame.offsetHeight * wanted.scale,
      };
      const moved = clampPan(wanted, base, viewportRect());
      const next = { ...moved, scale: wanted.scale };
      viewRef.current = next;
      frame.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
      const isDefault =
        next.x === 0 && next.y === 0 && next.scale === DEFAULT_VIEW.scale;
      document.documentElement.classList.toggle('view-moved', !isDefault);
    },
    [pageOrigin],
  );

  const panBy = useCallback(
    (delta: Point) => {
      const move = panSession.current.move(delta);
      if (!move) return;
      const current = viewRef.current;
      showView({ ...current, x: current.x + move.x, y: current.y + move.y });
    },
    [showView],
  );

  const zoomBy = useCallback(
    (factor: number, center: Point) => {
      const frame = frameRef.current;
      if (!frame) return;
      showView(zoomAbout(viewRef.current, factor, center, pageOrigin(frame)));
    },
    [pageOrigin, showView],
  );

  useEffect(
    () =>
      bus.subscribe((event) => {
        if (event.type === 'next') turn(1);
        if (event.type === 'previous') turn(-1);
        if (event.type === 'pinch-start') {
          startPinch({
            x: event.x * window.innerWidth,
            y: event.y * window.innerHeight,
          });
        }
        if (event.type === 'pan') {
          panBy({
            x: event.dx * window.innerWidth,
            y: event.dy * window.innerHeight,
          });
        }
        if (event.type === 'pinch-end') {
          panSession.current.end();
          document.body.classList.remove('panning');
        }
        if (event.type === 'zoom') {
          zoomBy(event.factor, {
            x: event.x * window.innerWidth,
            y: event.y * window.innerHeight,
          });
        }
        if (event.type === 'reset-view') showView(DEFAULT_VIEW);
      }),
    [bus, turn, startPinch, panBy, zoomBy, showView],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && TEXT_FIELDS.has(target.tagName)) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
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
      <div ref={frameRef} className="page-frame">
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
