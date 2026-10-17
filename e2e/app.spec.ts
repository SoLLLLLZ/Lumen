import { expect, test } from '@playwright/test';

test('app loads and the camera permission flow works with a fake camera', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Lumen' })).toBeVisible();

  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Camera permission granted.',
  );
});
