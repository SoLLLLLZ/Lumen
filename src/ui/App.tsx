import { useState } from 'react';

type CameraStatus = 'idle' | 'on' | 'denied';

export function App() {
  const [status, setStatus] = useState<CameraStatus>('idle');

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Phase 0 only checks that permission works, so release the camera right away.
      stream.getTracks().forEach((track) => track.stop());
      setStatus('on');
    } catch {
      setStatus('denied');
    }
  }

  return (
    <main>
      <h1>Lumen</h1>
      <p>
        Lumen reads hand gestures from your webcam. Video is processed on this
        device only. Nothing is stored or sent anywhere.
      </p>
      <button onClick={startCamera}>Start camera</button>
      <p role="status">
        {status === 'idle' && 'Camera is off.'}
        {status === 'on' && 'Camera permission granted.'}
        {status === 'denied' &&
          'Camera unavailable. The keyboard will be used instead.'}
      </p>
    </main>
  );
}
