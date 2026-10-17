import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export type Delegate = 'GPU' | 'CPU';

export interface Landmark {
  x: number;
  y: number;
}

export interface TrackedHand {
  landmarks: Landmark[];
  confidence: number;
}

export interface HandTracker {
  delegate: Delegate;
  detect(video: HTMLVideoElement, timestampMs: number): TrackedHand[];
  close(): void;
}

export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;

const MODEL_BYTES = 7819105;

async function fetchModel(
  onProgress: (fraction: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}models/hand_landmarker.task`,
  );
  if (!response.ok || !response.body) {
    throw new Error(`Model download failed with status ${response.status}`);
  }
  const totalBytes =
    Number(response.headers.get('content-length')) || MODEL_BYTES;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedBytes += value.length;
    onProgress(Math.min(receivedBytes / totalBytes, 1));
  }
  const model = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    model.set(chunk, offset);
    offset += chunk.length;
  }
  return model;
}

export async function loadHandTracker(
  onProgress: (fraction: number) => void,
): Promise<HandTracker> {
  const model = await fetchModel(onProgress);
  const vision = await FilesetResolver.forVisionTasks(
    `${import.meta.env.BASE_URL}mediapipe/wasm`,
  );

  function createLandmarker(delegate: Delegate): Promise<HandLandmarker> {
    return HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer: model.slice(), delegate },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  }

  let delegate: Delegate = 'GPU';
  let landmarker: HandLandmarker;
  try {
    landmarker = await createLandmarker('GPU');
  } catch {
    // The debug view shows which backend is in use, so this fallback is visible.
    delegate = 'CPU';
    landmarker = await createLandmarker('CPU');
  }

  return {
    delegate,
    detect(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      return result.landmarks.map((landmarks, index) => ({
        landmarks,
        confidence: result.handedness[index]?.[0]?.score ?? 0,
      }));
    },
    close() {
      landmarker.close();
    },
  };
}
