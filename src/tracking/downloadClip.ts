import type { Clip } from '../engine/clip';

export function downloadClip(clip: Clip): void {
  const blob = new Blob([JSON.stringify(clip)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${clip.name}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
