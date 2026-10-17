import { expect, test, type Page } from '@playwright/test';

const firstWordOffset = (page: Page) =>
  page
    .locator('[data-testid="page"] .word')
    .first()
    .getAttribute('data-offset');

const pageNumber = async (page: Page) => {
  const text = (await page.getByTestId('page-indicator').textContent()) ?? '';
  return Number(/Page (\d+) of/.exec(text)?.[1]);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('page')).toContainText('CHAPTER I.');
});

test('the first page shows the start of chapter one', async ({ page }) => {
  await expect(page.getByTestId('page')).toContainText('Down the Rabbit-Hole');
  await expect(page.getByTestId('page-indicator')).toContainText('Page 1 of');
  await expect(
    page.getByRole('button', { name: 'Previous page' }),
  ).toBeDisabled();
});

test('arrow keys and space turn pages', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  expect(await pageNumber(page)).toBe(2);
  await page.keyboard.press('Space');
  expect(await pageNumber(page)).toBe(3);
  await page.keyboard.press('ArrowLeft');
  expect(await pageNumber(page)).toBe(2);
});

test('the buttons turn pages and stop at the ends', async ({ page }) => {
  await page.getByRole('button', { name: 'Next page' }).click();
  expect(await pageNumber(page)).toBe(2);
  await page.getByRole('button', { name: 'Previous page' }).click();
  expect(await pageNumber(page)).toBe(1);
  await page.keyboard.press('ArrowLeft');
  expect(await pageNumber(page)).toBe(1);
});

test('pressing space on a focused button does not also turn the page', async ({
  page,
}) => {
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Previous page' }).focus();
  await page.keyboard.press('Space');
  expect(await pageNumber(page)).toBe(2);
});

test('shortcuts with modifier keys do not turn pages', async ({ page }) => {
  await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('Shift+Alt+ArrowRight');
  expect(await pageNumber(page)).toBe(1);
});

test('the same window size always gives the same page count', async ({
  page,
}) => {
  const before = await page.getByTestId('page-indicator').textContent();
  await page.reload();
  await expect(page.getByTestId('page')).toContainText('CHAPTER I.');
  await expect(page.getByTestId('page-indicator')).toHaveText(before ?? '');
});

test('resizing keeps the reader on the same text', async ({ page }) => {
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  const offset = await firstWordOffset(page);
  const indicator = page.getByTestId('page-indicator');
  let previousIndicator = (await indicator.textContent()) ?? '';

  for (const size of [
    { width: 600, height: 700 },
    { width: 1300, height: 900 },
  ]) {
    await page.setViewportSize(size);
    // Wait for the new layout to be paginated before checking the text.
    await expect(indicator).not.toHaveText(previousIndicator);
    previousIndicator = (await indicator.textContent()) ?? '';
    await expect(
      page.locator(`[data-testid="page"] [data-offset="${offset}"]`),
    ).toHaveCount(1);
  }
});

test('pages never overflow and no word is cut off', async ({ page }) => {
  for (let i = 0; i < 6; i++) {
    const fits = await page
      .getByTestId('page')
      .evaluate((el) => el.scrollHeight <= el.clientHeight);
    expect(fits).toBe(true);
    await page.keyboard.press('ArrowRight');
  }
});
