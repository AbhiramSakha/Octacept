import { useEffect } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { API_BASE } from '../config/api';

const STREAM_WIDTH = 480; // px, small on purpose: ~15-25 KB per picture
const INTERVAL_MS = 500; // ~2 pictures per second
const JPEG_QUALITY = 0.6;

/**
 * Mirror side: while a phone is watching, uploads a small JPEG of what the mirror shows
 * (camera, mirrored like the screen + the garment / skeleton canvas on top).
 * Nothing is captured or sent when no phone is connected.
 *
 * Note: if the 3D garment renderer does not use preserveDrawingBuffer, the garment can be
 * missing in the picture (the camera and skeleton still appear). 2D mode always works.
 */
export function useMirrorStream(
  videoRef: RefObject<HTMLVideoElement>,
  arCanvasRef: RefObject<HTMLCanvasElement>,
  pairId: string | undefined,
  phoneConnected: MutableRefObject<boolean>
) {
  useEffect(() => {
    if (!pairId) return;
    const out = document.createElement('canvas');
    let busy = false;

    const tick = async () => {
      if (busy || !phoneConnected.current) return;
      const v = videoRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      busy = true;
      try {
        const ar = arCanvasRef.current;
        // same shape as the mirror screen (the AR canvas always matches the video element)
        const aspect = ar && ar.width > 0 ? ar.height / ar.width : v.videoHeight / v.videoWidth;
        const w = STREAM_WIDTH;
        const h = Math.round(w * aspect);
        out.width = w;
        out.height = h;
        const ctx = out.getContext('2d');
        if (!ctx) return;

        // camera, "object-cover" crop + mirrored (exactly like the screen)
        const scale = Math.max(w / v.videoWidth, h / v.videoHeight);
        const dw = v.videoWidth * scale;
        const dh = v.videoHeight * scale;
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
        ctx.restore();

        // garment / skeleton drawing on top
        if (ar && ar.width > 0 && ar.height > 0) {
          try {
            ctx.drawImage(ar, 0, 0, w, h);
          } catch {
            /* canvas not readable: send the camera only */
          }
        }

        const blob = await new Promise<Blob | null>((resolve) =>
          out.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
        );
        if (blob) {
          await fetch(`${API_BASE}/api/v1/dashboard/${pairId}/frame`, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: blob,
          });
        }
      } catch {
        /* skip this picture */
      } finally {
        busy = false;
      }
    };

    const id = setInterval(tick, INTERVAL_MS);
    return () => clearInterval(id);
  }, [videoRef, arCanvasRef, pairId, phoneConnected]);
}