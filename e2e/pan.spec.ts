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

/** Replays a clip and returns how far the page moved. */
async function movedBy(page: Page, name: string) {
  const before = await frameBox(page);
  await replay(page, name);
  const after = await frameBox(page);
  return { x: after.x - before.x, y: after.y - before.y };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('page')).toContainText('CHAPTER I.');
});

test('a replayed pinch drag that starts on empty space pans the page with the hand', async ({
  page,
}) => {
  const moved = await movedBy(page, 'pan-00');
  expect(moved.x).toBeGreaterThan(200);
  expect(moved.x).toBeLessThan(450);
  expect(Math.abs(moved.y)).toBeLessThan(120);
});

test('a pinch that starts on empty space keeps panning over the text', async ({
  page,
}) => {
  const moved = await movedBy(page, 'pan-01');
  expect(moved.x).toBeGreaterThan(450);
  expect(moved.y).toBeGreaterThan(60);
});

test('a pinch that starts on the text does not pan, even after drifting to empty space', async ({
  page,
}) => {
  expect(await movedBy(page, 'pan-02')).toEqual({ x: 0, y: 0 });
});

test('a pinch while asleep pans nothing', async ({ page }) => {
  expect(await movedBy(page, 'pan-03')).toEqual({ x: 0, y: 0 });
});

test('Shift+arrow keys pan by a fixed step and do not turn the page', async ({
  page,
}) => {
  const before = await frameBox(page);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  const after = await frameBox(page);
  const viewport = page.viewportSize();
  expect(after.x - before.x).toBeCloseTo(0.1 * (viewport?.width ?? 0), 0);
  expect(after.y - before.y).toBeCloseTo(0.05 * (viewport?.height ?? 0), 0);
  await expect(page.getByTestId('page-indicator')).toContainText('Page 1 of');
});

test('dragging the mouse on the background pans the same way as the keys', async ({
  page,
}) => {
  const viewport = page.viewportSize();
  const width = viewport?.width ?? 0;
  const before = await frameBox(page);
  await page.mouse.move(10, 300);
  await page.mouse.down();
  await page.mouse.move(10 + 0.1 * width, 300, { steps: 5 });
  await page.mouse.up();
  const dragged = await frameBox(page);

  await page.reload();
  await expect(page.getByTestId('page')).toContainText('CHAPTER I.');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  const keyed = await frameBox(page);

  expect(dragged.x - before.x).toBeCloseTo(0.1 * width, 0);
  expect(keyed.x - before.x).toBeCloseTo(dragged.x - before.x, 0);
});

test('dragging from the middle of the text does not pan', async ({ page }) => {
  const before = await frameBox(page);
  const x = before.x + before.width / 2;
  const y = before.y + before.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 40, { steps: 5 });
  await page.mouse.up();
  expect(await frameBox(page)).toEqual(before);
});

test('the 64 px grab strip inside the page edge always pans', async ({
  page,
}) => {
  const before = await frameBox(page);
  const y = before.y + before.height / 2;
  await page.mouse.move(before.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(before.x + 40 + 100, y, { steps: 5 });
  await page.mouse.up();
  expect((await frameBox(page)).x - before.x).toBeCloseTo(100, 0);

  // Just past the strip is text.
  const moved = await frameBox(page);
  await page.mouse.move(moved.x + 90, y);
  await page.mouse.down();
  await page.mouse.move(moved.x + 190, y, { steps: 5 });
  await page.mouse.up();
  expect(await frameBox(page)).toEqual(moved);
});

test('clicking a control does not start a pan', async ({ page }) => {
  const before = await frameBox(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  expect(await frameBox(page)).toEqual(before);
});

test('the page can never be pushed fully off screen', async ({ page }) => {
  for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+ArrowRight');
  for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+ArrowDown');
  const viewport = page.viewportSize();
  const far = await frameBox(page);
  expect(far.x).toBeCloseTo((viewport?.width ?? 0) - 64, 0);
  expect(far.y).toBeCloseTo((viewport?.height ?? 0) - 64, 0);

  for (let i = 0; i < 80; i++) await page.keyboard.press('Shift+ArrowLeft');
  for (let i = 0; i < 80; i++) await page.keyboard.press('Shift+ArrowUp');
  const near = await frameBox(page);
  expect(near.x + near.width).toBeCloseTo(64, 0);
  expect(near.y + near.height).toBeCloseTo(64, 0);
});
