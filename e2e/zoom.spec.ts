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

const frame = (page: Page) => page.locator('.page-frame');

async function frameBox(page: Page) {
  const box = await frame(page).boundingBox();
  if (!box) throw new Error('Page frame is not visible');
  return box;
}

async function replay(page: Page, name: string) {
  await page
    .getByLabel('Replay a clip file')
    .setInputFiles(join(CLIPS, `${name}.json`));
  await expect(page.getByTestId('replay-message')).toContainText('Replayed');
}

async function press(page: Page, key: string, times: number) {
  for (let i = 0; i < times; i++) await page.keyboard.press(key);
}

/** The frame width relative to its width before the test acted. */
async function zoomOf(page: Page, startWidth: number) {
  return (await frameBox(page)).width / startWidth;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('page')).toContainText('CHAPTER I.');
});

test('a replayed V that opens wider zooms in', async ({ page }) => {
  const start = (await frameBox(page)).width;
  await replay(page, 'zoom-00');
  const zoom = await zoomOf(page, start);
  expect(zoom).toBeGreaterThan(1.15);
  expect(zoom).toBeLessThan(1.5);
});

test('a replayed V that closes zooms out', async ({ page }) => {
  // Start zoomed in so the 0.75x floor does not hide the result.
  await press(page, '+', 2);
  const start = (await frameBox(page)).width;
  await replay(page, 'zoom-01');
  const zoom = await zoomOf(page, start);
  expect(zoom).toBeGreaterThan(0.68);
  expect(zoom).toBeLessThan(0.85);
});

test('a V while asleep zooms nothing', async ({ page }) => {
  const before = await frameBox(page);
  await replay(page, 'zoom-02');
  expect(await frameBox(page)).toEqual(before);
});

test('+ and - zoom by a fixed step', async ({ page }) => {
  const start = (await frameBox(page)).width;
  await page.keyboard.press('+');
  expect(await zoomOf(page, start)).toBeCloseTo(1.25, 2);
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  expect(await zoomOf(page, start)).toBeCloseTo(0.8, 2);
});

test('zoom stops at 3x and at 0.75x', async ({ page }) => {
  const start = (await frameBox(page)).width;
  await press(page, '+', 20);
  expect(await zoomOf(page, start)).toBeCloseTo(3, 2);
  await press(page, '-', 40);
  expect(await zoomOf(page, start)).toBeCloseTo(0.75, 2);
});

test('Ctrl+wheel zooms like the keys, about the cursor', async ({ page }) => {
  const before = await frameBox(page);
  const cursor = { x: before.x + 100, y: before.y + 80 };
  await page.mouse.move(cursor.x, cursor.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -50);
  await page.keyboard.up('Control');
  const after = await frameBox(page);
  expect(after.width / before.width).toBeCloseTo(Math.exp(0.5), 2);
  // The page point under the cursor stays under the cursor.
  const ratio = after.width / before.width;
  expect(
    Math.abs(after.x - (cursor.x - (cursor.x - before.x) * ratio)),
  ).toBeLessThan(1);
  expect(
    Math.abs(after.y - (cursor.y - (cursor.y - before.y) * ratio)),
  ).toBeLessThan(1);
});

test('zooming does not change the page or repaginate', async ({ page }) => {
  const indicator = page.getByTestId('page-indicator');
  const text = await indicator.textContent();
  await press(page, '+', 6);
  await expect(indicator).toHaveText(text ?? '');
  await press(page, '-', 12);
  await expect(indicator).toHaveText(text ?? '');
});

test('all four corners of the page can be brought on screen at 3x', async ({
  page,
}) => {
  await press(page, '+', 20);
  const { innerWidth: w, innerHeight: h } = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));

  await press(page, 'Shift+ArrowRight', 80);
  await press(page, 'Shift+ArrowDown', 80);
  let box = await frameBox(page);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);

  await press(page, 'Shift+ArrowLeft', 160);
  box = await frameBox(page);
  expect(box.x + box.width).toBeLessThanOrEqual(w + 1);
  expect(box.y).toBeGreaterThanOrEqual(-1);

  await press(page, 'Shift+ArrowUp', 160);
  box = await frameBox(page);
  expect(box.x + box.width).toBeLessThanOrEqual(w + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(h + 1);

  await press(page, 'Shift+ArrowRight', 160);
  box = await frameBox(page);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height).toBeLessThanOrEqual(h + 1);
});

test('a mouse drag on the background still pans at 3x', async ({ page }) => {
  await press(page, '+', 20);
  const before = await frameBox(page);
  await page.mouse.move(5, 300);
  await page.mouse.down();
  await page.mouse.move(45, 340, { steps: 5 });
  await page.mouse.up();
  const after = await frameBox(page);
  expect(after.x - before.x).toBeCloseTo(40, 0);
  expect(after.y - before.y).toBeCloseTo(40, 0);
});

test('0 puts the view back exactly', async ({ page }) => {
  const before = await frameBox(page);
  await press(page, '+', 4);
  await press(page, 'Shift+ArrowLeft', 5);
  await page.keyboard.press('0');
  expect(await frameBox(page)).toEqual(before);
});

test('a replayed double pinch resets the view', async ({ page }) => {
  const before = await frameBox(page);
  await press(page, '+', 4);
  await press(page, 'Shift+ArrowLeft', 5);
  await replay(page, 'double-pinch-00');
  expect(await frameBox(page)).toEqual(before);
});

test('a zoomed or panned page never makes the browser scroll', async ({
  page,
}) => {
  await press(page, '+', 20);
  await press(page, 'Shift+ArrowRight', 20);
  const overflow = await page.evaluate(
    () => getComputedStyle(document.documentElement).overflow,
  );
  expect(overflow).toBe('hidden');
  await page.keyboard.press('0');
  const after = await page.evaluate(
    () => getComputedStyle(document.documentElement).overflow,
  );
  expect(after).not.toBe('hidden');
});
