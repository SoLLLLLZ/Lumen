# Lumen

A gesture-controlled reader. Hand gestures seen through a laptop webcam turn pages, pan, zoom and highlight text. All camera processing happens on the device.

## Development

Requires Node 24 or newer.

```bash
npm ci
npm run dev
```

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
