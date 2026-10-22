/**
 * MIRAI — MeasurementOverlay
 *
 * Draws the body skeleton on the live camera and the measured lines
 * (shoulders, chest, torso, height) with their cm values, using the same
 * MediaPipe landmarks that the size scan uses.
 *
 * Coordinates match the mirrored, object-cover camera view used in MirrorView.
 */
import React, { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { TrackingFrame } from '../types/tracking';
import type { BodyMeasurements, ScanStatus } from '../hooks/useBodyMeasurements';

interface Props {
  frameRef: RefObject<TrackingFrame | null>;
  measurements: BodyMeasurements | null;
  status: ScanStatus;
}

const BONES: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [0, 11], [0, 12],
];
const VIS = 0.5;

interface Pt { x: number; y: number }

export const MeasurementOverlay: React.FC<Props> = ({ frameRef, measurements, status }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mRef = useRef(measurements);
  const sRef = useRef(status);
  mRef.current = measurements;
  sRef.current = status;

  useEffect(() => {
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const f = frameRef.current;
      if (!canvas) return;

      const cW = canvas.clientWidth;
      const cH = canvas.clientHeight;
      if (canvas.width !== cW || canvas.height !== cH) {
        canvas.width = cW;
        canvas.height = cH;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, cW, cH);

      if (!f || f.landmarks.length < 33) return;
      const lm = f.landmarks;

      // object-cover transform + mirror (same maths as the garment renderers)
      const vW = f.frame_width || 1280;
      const vH = f.frame_height || 720;
      const scale = Math.max(cW / vW, cH / vH);
      const offX = (cW - vW * scale) / 2;
      const offY = (cH - vH * scale) / 2;
      const P = (i: number): Pt => ({
        x: offX + (1 - lm[i].x) * vW * scale,
        y: offY + lm[i].y * vH * scale,
      });
      const ok = (i: number) => (lm[i]?.visibility ?? 0) >= VIS;
      const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

      // Skeleton
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
      for (const [a, b] of BONES) {
        if (!ok(a) || !ok(b)) continue;
        const pa = P(a), pb = P(b);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }
      for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
        if (!ok(i)) continue;
        const p = P(i);
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#22d3ee'; ctx.fill();
      }

      const m = mRef.current;
      const ready = sRef.current === 'ready' && m;

      const label = (text: string, at: Pt, color: string) => {
        ctx.font = '600 12px system-ui, sans-serif';
        const w = ctx.measureText(text).width + 12;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.beginPath();
        ctx.roundRect(at.x - w / 2, at.y - 11, w, 22, 6);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, at.x, at.y);
      };
      const line = (a: Pt, b: Pt, color: string, dash: number[] = []) => {
        ctx.save();
        ctx.setLineDash(dash);
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
      };

      // Shoulder line
      if (ok(11) && ok(12)) {
        const a = P(11), b = P(12);
        line(a, b, '#a855f7');
        label(ready ? `Shoulders ${m!.shoulderCm} cm` : 'Shoulders…', { x: (a.x + b.x) / 2, y: a.y - 26 }, '#d8b4fe');

        // Chest line (a bit below the shoulders, same width as the torso box)
        const drop = Math.hypot(a.x - b.x, a.y - b.y) * 0.4;
        const ca = { x: a.x, y: a.y + drop }, cb = { x: b.x, y: b.y + drop };
        line(ca, cb, '#34d399', [8, 6]);
        label(ready ? `Chest ~${m!.chestCm} cm` : 'Chest…', { x: (ca.x + cb.x) / 2, y: ca.y + 22 }, '#6ee7b7');
      }

      // Torso line (shoulder centre -> hip centre)
      if (ok(11) && ok(12) && ok(23) && ok(24)) {
        const s = mid(P(11), P(12)), h = mid(P(23), P(24));
        line(s, h, '#f59e0b');
        label(ready && m!.torsoCm !== null ? `Torso ${m!.torsoCm} cm` : 'Torso…', { x: (s.x + h.x) / 2 + 52, y: (s.y + h.y) / 2 }, '#fcd34d');
      }

      // Height line (nose -> ankles)
      if (ok(0) && ok(27) && ok(28)) {
        const n = P(0), a = mid(P(27), P(28));
        line({ x: n.x - 70, y: n.y }, { x: a.x - 70, y: a.y }, 'rgba(255,255,255,0.6)', [4, 6]);
        if (ready) label(`Height ${m!.heightCm} cm`, { x: n.x - 70, y: (n.y + a.y) / 2 }, '#ffffff');
      }

      // Big size tag next to the head
      if (ready && ok(0)) {
        const n = P(0);
        label(`SIZE ${m!.size}`, { x: n.x + 80, y: n.y }, '#34d399');
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [frameRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-[11]"
    />
  );
};

export default MeasurementOverlay;