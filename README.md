# Lumen

A gesture-controlled reader. Hand gestures seen through a laptop webcam turn pages, pan, zoom and highlight text. All camera processing happens on the device.

## Development

Requires Node 24 or newer.

```bash
npm ci
npm run dev
```

## Measuring frame rate on a slower machine

The debug view shows live frame rate and tracking time. To approximate an older laptop on a fast one, open Chrome DevTools, go to the Performance panel, click the gear icon and set CPU to 6x slowdown. This slows the CPU only, not the GPU or camera, so it is a rough stand-in and not a replacement for testing on a real 2020-era laptop.

## Checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

The end-to-end tests use Chromium with a fake camera. Install the browser once with `npx playwright install chromium`.

## Preview

Every push to `main` deploys to GitHub Pages over HTTPS, which the browser requires for camera access.
