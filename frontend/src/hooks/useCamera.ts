/**
 * useCamera — manages webcam access and frame capture for MIRAI.
 *
 * Fixes for "camera not opening":
 *   1. React StrictMode ran startCamera() twice in dev → two getUserMedia() calls fought over the
 *      same webcam (NotReadableError on Windows). Starts are now serialised; stale ones dropped.
 *   2. Stream is kept in state and attached to <video> by an effect, so it works even when the
 *      <video> mounts AFTER startCamera() resolves.
 *   3. Fallback chain: saved/selected deviceId → facingMode:'user' → size hints → video:true.
 *      External / USB / retail cameras now work.
 *   4. Device list + switchCamera(deviceId); last used camera is remembered.
 *   5. Specific errors + errorDetail text.
 *   6. Tracks are stopped on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraError =
  | 'permission_denied'
  | 'not_found'
  | 'not_readable'
  | 'overconstrained'
  | 'insecure'
  | 'unknown';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement>;

  canvasRef: React.RefObject<HTMLCanvasElement>;
  stream: MediaStream | null;
  isReady: boolean;
  error: CameraError | null;
  errorDetail: string | null;
  devices: CameraDevice[];
  activeDeviceId: string | null;
  startCamera: (deviceId?: string) => Promise<void>;
  switchCamera: (deviceId: string) => Promise<void>;
  stopCamera: () => void;
  captureFrame: (targetVideo?: HTMLVideoElement | null) => string | null;
}

const LAST_DEVICE_KEY = 'mirai.cameraDeviceId';

function readSavedDevice(): string | null {
  try {
    return window.localStorage.getItem(LAST_DEVICE_KEY);
  } catch {
    return null;
  }
}
function saveDevice(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(LAST_DEVICE_KEY, id);
  } catch {
    /* ignore */
  }
}
function clearSavedDevice(): void {
  try {
    window.localStorage.removeItem(LAST_DEVICE_KEY);

  } catch {
    /* ignore */
  }
}

async function listVideoDevices(): Promise<CameraDevice[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  } catch {
    return [];
  }
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const genRef = useRef(0); // bumped on every start/stop → lets stale async work bail out
  const inflightRef = useRef<Promise<void> | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());

    streamRef.current = null;
    setStream(null);
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      const myGen = ++genRef.current;
      setError(null);
      setErrorDetail(null);
      setIsReady(false);

      const prev = inflightRef.current;
      const run = (async () => {
        // Serialise: wait for any earlier start so two requests never fight over one webcam.
        if (prev) {
          try {
            await prev;
          } catch {
            /* ignore */
          }
        }
        if (myGen !== genRef.current) return; // superseded by a newer start/stop

        stopStream();

        if (!navigator.mediaDevices?.getUserMedia) {
          setError('insecure');
          setErrorDetail(
            `Browser blocks camera on this address (${window.location.origin}). ` +
              'Open the app via http://localhost:5173 (or use https).'

          );
          return;
        }

        const wanted = deviceId ?? readSavedDevice();
        const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
        const attempts: MediaStreamConstraints[] = [];
        if (wanted) attempts.push({ video: { deviceId: { exact: wanted }, ...size }, audio: false });
        attempts.push({ video: { ...size, facingMode: 'user' }, audio: false });
        attempts.push({ video: { ...size }, audio: false });
        attempts.push({ video: true, audio: false });

        let lastErr: { name?: string; message?: string } | null = null;
        for (const constraints of attempts) {
          try {
            const s = await navigator.mediaDevices.getUserMedia(constraints);
            if (myGen !== genRef.current) {
              s.getTracks().forEach((t) => t.stop());
              return;
            }
            streamRef.current = s;
            const track = s.getVideoTracks()[0];
            if (track) {
              track.onended = () => {
                if (streamRef.current === s) {
                  setIsReady(false);
                  setStream(null);
                  setError('not_found');
                  setErrorDetail('Camera was disconnected.');
                }
              };
              const id = track.getSettings().deviceId ?? null;

              setActiveDeviceId(id);
              saveDevice(id);
              console.log('[MIRAI][CAM] started:', track.label, track.getSettings());
            }
            setStream(s);
            setDevices(await listVideoDevices()); // labels are only available after permission
            return;
          } catch (e) {
            lastErr = e as { name?: string; message?: string };
            console.warn('[MIRAI][CAM] attempt failed:', lastErr.name, lastErr.message);
            if (lastErr.name === 'NotAllowedError' || lastErr.name === 'SecurityError') break;
            if (wanted && constraints === attempts[0]) clearSavedDevice();
          }
        }

        if (myGen !== genRef.current) return;
        const name = lastErr?.name;
        setErrorDetail(lastErr ? `${name ?? 'Error'}: ${lastErr.message ?? ''}`.trim() : null);
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
          setError('permission_denied');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError('not_found');
        } else if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
          setError('not_readable');
        } else if (name === 'OverconstrainedError') {
          setError('overconstrained');
        } else {
          setError('unknown');
        }
      })();

      inflightRef.current = run;

      await run;
    },
    [stopStream]
  );

  const switchCamera = useCallback(
    async (deviceId: string) => {
      await startCamera(deviceId);
    },
    [startCamera]
  );

  const stopCamera = useCallback(() => {
    genRef.current++;
    stopStream();
    setIsReady(false);
  }, [stopStream]);

  // Attach the stream to whichever <video> is mounted right now (it can re-mount).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    if (v.srcObject !== stream) {
      v.srcObject = stream;
      v.play()
        .then(() => setIsReady(true))
        .catch((err: { name?: string }) => {
          if (err?.name !== 'AbortError') console.warn('[MIRAI][CAM] video.play() failed:', err);
        });
    }
  });


  // Keep the device list fresh when a USB camera is plugged / unplugged.
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const refresh = async () => setDevices(await listVideoDevices());
    md.addEventListener('devicechange', refresh);
    return () => md.removeEventListener('devicechange', refresh);
  }, []);

  // Release the camera on unmount (also makes StrictMode / hot reload safe).
  useEffect(() => {
    return () => {
      genRef.current++;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  /** Capture a single frame → base-64 JPEG (no data-URI prefix), or null if camera not ready. */
  const captureFrame = useCallback(
    (targetVideo?: HTMLVideoElement | null): string | null => {
      const video = targetVideo || videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !isReady) return null;

      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;


      // Mirror the frame horizontally (selfie/mirror convention)
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -w, 0, w, h);
      ctx.restore();

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      return dataUrl.split(',')[1] ?? null;
    },
    [isReady]
  );

  return {
    videoRef,
    canvasRef,
    stream,
    isReady,
    error,
    errorDetail,
    devices,
    activeDeviceId,
    startCamera,
    switchCamera,
    stopCamera,
    captureFrame,
  };
}