import { expect, test, type Page } from '@playwright/test';

// Records every stream the app opens so tests can check the camera is released.
async function trackCameraStreams(page: Page) {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
    (window as unknown as { __streams: MediaStream[] }).__streams = streams;
  });
}

function liveTrackCount(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __streams: MediaStream[] }).__streams
        .flatMap((stream) => stream.getTracks())
        .filter((track) => track.readyState === 'live').length,
  );
}

async function startTracking(page: Page) {
  await page.goto('/');
  const startButton = page.getByRole('button', { name: 'Start camera' });
  await expect(startButton).toBeEnabled({ timeout: 30_000 });
  await startButton.click();
  await expect(page.getByRole('status')).toHaveText('Tracking.', {
    timeout: 20_000,
  });
}

test('model loads, tracking runs and the debug view reports live numbers', async ({
  page,
}) => {
  await trackCameraStreams(page);
  await startTracking(page);

  await expect(page.getByLabel('Debug view')).toBeVisible();
  await expect(async () => {
    const fps = parseFloat(
      (await page.getByTestId('fps').textContent()) ?? '0',
    );
    expect(fps).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
  await expect(page.getByTestId('hands')).toHaveText('0');
});

test('the hand overlay and debug view can be hidden', async ({ page }) => {
  await startTracking(page);

  await page.getByRole('button', { name: 'Hide hand overlay' }).click();
  await expect(
    page.getByRole('button', { name: 'Show hand overlay' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Hide debug view' }).click();
  await expect(page.getByLabel('Debug view')).toBeHidden();
});

test('turning the camera off releases it', async ({ page }) => {
  await trackCameraStreams(page);
  await startTracking(page);
  expect(await liveTrackCount(page)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(page.getByRole('status')).toHaveText('Camera is off.');
  expect(await liveTrackCount(page)).toBe(0);
});

test('hiding the tab releases the camera', async ({ page }) => {
  await trackCameraStreams(page);
  await startTracking(page);
  expect(await liveTrackCount(page)).toBeGreaterThan(0);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('status')).toContainText('Camera paused');
  expect(await liveTrackCount(page)).toBe(0);
});

test('blocked camera permission shows a clear message', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await page.goto('/');
  const startButton = page.getByRole('button', { name: 'Start camera' });
  await expect(startButton).toBeEnabled({ timeout: 30_000 });
  await startButton.click();
  await expect(page.getByRole('status')).toContainText(
    'Camera access was blocked',
  );
});
