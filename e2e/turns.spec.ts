import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

const CLIPS = join(
  import.meta.dirname,
  '..',
  'src',
  'fixtures',
  'clips',
  'synthetic',
);
const NEXT_CLIP = join(CLIPS, 'flick-00.json');
const PREVIOUS_CLIP = join(CLIPS, 'flick-01.json');

const pageNumber = async (page: Page) => {
  const text = (await page.getByTestId('page-indicator').textContent()) ?? '';
  return Number(/Page (\d+) of/.exec(text)?.[1]);
};

const firstWordOffset = (page: Page) =>
  page
    .locator('[data-testid="page"] .word')
    .first()
    .getAttribute('data-offset');

async function replay(page: Page, clipPath: string) {
  await page.getByLabel('Replay a clip file').setInputFiles(clipPath);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('page')).toContainText('CHAPTER I.');
});

test('a replayed next flick clip turns to the next page', async ({ page }) => {
  await replay(page, NEXT_CLIP);
  await expect(page.getByTestId('replay-message')).toContainText('2 events');
  await expect.poll(() => pageNumber(page)).toBe(2);
});

test('a replayed previous flick clip turns back', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await replay(page, PREVIOUS_CLIP);
  await expect.poll(() => pageNumber(page)).toBe(2);
});

test('a file that is not a clip is rejected and turns nothing', async ({
  page,
}) => {
  await replay(page, join(CLIPS, '..', '..', '..', '..', 'package.json'));
  await expect(page.getByTestId('replay-message')).toHaveText(
    'Could not read that clip file.',
  );
  expect(await pageNumber(page)).toBe(1);
});

test('reloading restores the reading position', async ({ page }) => {
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  const offset = await firstWordOffset(page);
  await page.reload();
  await expect(page.getByTestId('page')).toBeVisible();
  await expect.poll(() => firstWordOffset(page)).toBe(offset);
  expect(await pageNumber(page)).toBe(6);
});

test('a reader that starts with no size keeps the saved place', async ({
  page,
}) => {
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  const offset = await firstWordOffset(page);

  // Hide the reader for the first moments after load, then show it.
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = '.page-frame { display: none !important; }';
    const attach = () => document.head?.append(style);
    if (!document.head) {
      document.addEventListener('DOMContentLoaded', attach);
    } else {
      attach();
    }
    setTimeout(() => style.remove(), 800);
  });
  await page.reload();
  await expect.poll(() => firstWordOffset(page)).toBe(offset);
});

test('a first visit starts at the first page', async ({ page }) => {
  expect(await pageNumber(page)).toBe(1);
});

const activeAnimations = (page: Page) =>
  page.getByTestId('page').evaluate((element) =>
    element.getAnimations().map((animation) => ({
      duration: animation.effect?.getTiming().duration,
    })),
  );

test('turning a page plays a 400 ms animation', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  const animations = await activeAnimations(page);
  expect(animations).toEqual([{ duration: 400 }]);
});

test('resizing after a turn does not play the animation again', async ({
  page,
}) => {
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => activeAnimations(page)).toEqual([]);
  await page.setViewportSize({ width: 600, height: 700 });
  await expect(page.getByTestId('page-indicator')).not.toHaveText(/of 1\d\d$/);
  expect(await activeAnimations(page)).toEqual([]);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('turning a page does not animate but still turns', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    expect(await activeAnimations(page)).toEqual([]);
    expect(await pageNumber(page)).toBe(2);
  });
});
