
import React, { useRef, useEffect } from 'react';
import { TrackingFrame, Landmark } from '../types/tracking';

interface SkeletonCanvasProps {
  trackingFrame: TrackingFrame;
  visible?: boolean;
}

const BONES: [number, number][] = [
  // Spine / torso
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],

  // Left arm
  [11, 13],
  [13, 15],

  // Right arm
  [12, 14],
  [14, 16],

  // Left leg
  [23, 25],
  [25, 27],

  // Right leg
  [24, 26],
  [26, 28],

  // Optional hands
  [15, 17],
  [15, 19],
  [15, 21],
  [16, 18],
  [16, 20],
  [16, 22],

  // Optional feet
  [27, 29],
  [27, 31],
  [28, 30],
  [28, 32],
];

const MAJOR_JOINTS = [
  11, 12,
  13, 14,
  15, 16,
  23, 24,
  25, 26,
  27, 28,
];

const BODY_JOINTS = [
  11, 12,
  13, 14,
  15, 16,
  23, 24,
  25, 26,
  27, 28,
  29, 30,
  31, 32,
];

const getPoint = (
  lmMap: Map<number, Landmark>,
  id: number,
  width: number,
  height: number
) => {
  const lm = lmMap.get(id);

  if (!lm || lm.visibility <= 0.45) {
    return null;
  }

  return {
    x: lm.x * width,
    y: lm.y * height,
  };
};

const drawBone = (
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  thickness: number
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < 2) return;

  const angle = Math.atan2(dy, dx);

  ctx.save();

  ctx.translate(start.x, start.y);
  ctx.rotate(angle);

  // Outer glow
  ctx.beginPath();
  ctx.roundRect(
    0,
    -thickness / 2 - 2,
    length,
    thickness + 4,
    thickness
  );

  ctx.fillStyle = 'rgba(34, 211, 238, 0.18)';
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 14;
  ctx.fill();

  // Main bone
  ctx.shadowBlur = 8;

  const gradient = ctx.createLinearGradient(
    0,
    -thickness / 2,
    0,
    thickness / 2
  );

  gradient.addColorStop(0, '#e0f2fe');
  gradient.addColorStop(0.45, '#67e8f9');
  gradient.addColorStop(1, '#0891b2');

  ctx.fillStyle = gradient;

  ctx.beginPath();
  ctx.roundRect(
    0,
    -thickness / 2,
    length,
    thickness,
    thickness / 2
  );
  ctx.fill();

  // Bone highlight
  ctx.beginPath();
  ctx.roundRect(
    4,
    -thickness * 0.18,
    Math.max(length - 8, 1),
    thickness * 0.25,
    thickness * 0.2
  );

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fill();

  ctx.restore();
};

const drawJoint = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  major = false
) => {
  ctx.save();

  // Outer glow
  ctx.beginPath();
  ctx.arc(x, y, radius + 5, 0, Math.PI * 2);

  ctx.fillStyle = major
    ? 'rgba(16,185,129,0.18)'
    : 'rgba(34,211,238,0.15)';

  ctx.shadowColor = major ? '#34d399' : '#22d3ee';
  ctx.shadowBlur = 16;
  ctx.fill();

  // Joint outer shell
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);

  const gradient = ctx.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.35,
    1,
    x,
    y,
    radius
  );

  gradient.addColorStop(
    0,
    major ? '#ecfdf5' : '#f0f9ff'
  );

  gradient.addColorStop(
    0.35,
    major ? '#34d399' : '#67e8f9'
  );

  gradient.addColorStop(
    1,
    major ? '#059669' : '#0284c7'
  );

  ctx.fillStyle = gradient;
  ctx.fill();

  // White rim
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();

  ctx.restore();
};

const drawSkull = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
) => {
  ctx.save();

  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 15;

  // Skull
  ctx.beginPath();

  ctx.ellipse(
    x,
    y,
    size * 0.55,
    size * 0.65,
    0,
    0,
    Math.PI * 2
  );

  const gradient = ctx.createRadialGradient(
    x - size * 0.15,
    y - size * 0.2,
    1,
    x,
    y,
    size
  );

  gradient.addColorStop(0, '#ecfeff');
  gradient.addColorStop(0.5, '#a5f3fc');
  gradient.addColorStop(1, '#0891b2');

  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#cffafe';
  ctx.stroke();

  // Eye sockets
  ctx.shadowBlur = 5;

  ctx.fillStyle = '#082f49';

  ctx.beginPath();
  ctx.ellipse(
    x - size * 0.22,
    y - size * 0.08,
    size * 0.12,
    size * 0.14,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(
    x + size * 0.22,
    y - size * 0.08,
    size * 0.12,
    size * 0.14,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Nose
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.02);
  ctx.lineTo(x - size * 0.08, y + size * 0.18);
  ctx.lineTo(x + size * 0.08, y + size * 0.18);
  ctx.closePath();
  ctx.fill();

  // Jaw
  ctx.beginPath();
  ctx.roundRect(
    x - size * 0.28,
    y + size * 0.32,
    size * 0.56,
    size * 0.22,
    size * 0.08
  );

  ctx.fillStyle = '#67e8f9';
  ctx.fill();

  ctx.restore();
};

const drawRibCage = (
  ctx: CanvasRenderingContext2D,
  leftShoulder: { x: number; y: number },
  rightShoulder: { x: number; y: number },
  leftHip: { x: number; y: number },
  rightHip: { x: number; y: number }
) => {
  const centerX =
    (leftShoulder.x +
      rightShoulder.x +
      leftHip.x +
      rightHip.x) /
    4;

  const topY =
    (leftShoulder.y + rightShoulder.y) / 2;

  const bottomY =
    (leftHip.y + rightHip.y) / 2;

  const width =
    Math.abs(rightShoulder.x - leftShoulder.x) * 0.82;

  const height =
    Math.abs(bottomY - topY) * 0.7;

  if (width < 10 || height < 10) return;

  ctx.save();

  ctx.strokeStyle = 'rgba(103,232,249,0.72)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 8;

  // Sternum
  ctx.beginPath();
  ctx.moveTo(centerX, topY + height * 0.05);
  ctx.lineTo(centerX, topY + height * 0.9);
  ctx.stroke();

  // Ribs
  for (let i = 0; i < 5; i++) {
    const y = topY + height * (0.18 + i * 0.14);
    const ribWidth = width * (0.38 + i * 0.055);

    ctx.beginPath();

    ctx.moveTo(centerX, y);

    ctx.bezierCurveTo(
      centerX - ribWidth * 0.35,
      y - height * 0.04,
      centerX - ribWidth * 0.85,
      y + height * 0.02,
      centerX - ribWidth,
      y + height * 0.08
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(centerX, y);

    ctx.bezierCurveTo(
      centerX + ribWidth * 0.35,
      y - height * 0.04,
      centerX + ribWidth * 0.85,
      y + height * 0.02,
      centerX + ribWidth,
      y + height * 0.08
    );

    ctx.stroke();
  }

  ctx.restore();
};

const drawPelvis = (
  ctx: CanvasRenderingContext2D,
  leftHip: { x: number; y: number },
  rightHip: { x: number; y: number }
) => {
  const centerX = (leftHip.x + rightHip.x) / 2;
  const centerY = (leftHip.y + rightHip.y) / 2;

  const width = Math.abs(rightHip.x - leftHip.x);

  ctx.save();

  ctx.strokeStyle = '#67e8f9';
  ctx.lineWidth = 3;

  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 10;

  ctx.beginPath();

  ctx.moveTo(leftHip.x, leftHip.y);

  ctx.quadraticCurveTo(
    centerX,
    centerY + width * 0.45,
    rightHip.x,
    rightHip.y
  );

  ctx.stroke();

  ctx.beginPath();

  ctx.arc(
    centerX,
    centerY + width * 0.18,
    width * 0.18,
    0,
    Math.PI * 2
  );

  ctx.stroke();

  ctx.restore();
};

export const SkeletonCanvas: React.FC<SkeletonCanvasProps> = ({
  trackingFrame,
  visible = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    if (
      !visible ||
      trackingFrame.tracking_state !== 'tracked' ||
      !trackingFrame.landmarks?.length
    ) {
      return;
    }

    const lmMap = new Map<number, Landmark>();

    trackingFrame.landmarks.forEach((lm) => {
      lmMap.set(lm.id, lm);
    });

    /*
     * ---------------------------------------------------------
     * DRAW HUMAN SKELETON
     * ---------------------------------------------------------
     */

    // Draw anatomical bones
    BONES.forEach(([startId, endId]) => {
      const start = getPoint(
        lmMap,
        startId,
        width,
        height
      );

      const end = getPoint(
        lmMap,
        endId,
        width,
        height
      );

      if (!start || !end) return;

      let thickness = 7;

      // Arms and legs
      if (
        [11, 12, 13, 14, 23, 24, 25, 26].some(
          (id) => id === startId || id === endId
        )
      ) {
        thickness = 8;
      }

      // Hands / feet
      if (
        [17, 18, 19, 20, 21, 22, 29, 30, 31, 32].some(
          (id) => id === startId || id === endId
        )
      ) {
        thickness = 4;
      }

      drawBone(ctx, start, end, thickness);
    });

    /*
     * ---------------------------------------------------------
     * RIB CAGE
     * ---------------------------------------------------------
     */

    const leftShoulder = getPoint(
      lmMap,
      11,
      width,
      height
    );

    const rightShoulder = getPoint(
      lmMap,
      12,
      width,
      height
    );

    const leftHip = getPoint(
      lmMap,
      23,
      width,
      height
    );

    const rightHip = getPoint(
      lmMap,
      24,
      width,
      height
    );

    if (
      leftShoulder &&
      rightShoulder &&
      leftHip &&
      rightHip
    ) {
      drawRibCage(
        ctx,
        leftShoulder,
        rightShoulder,
        leftHip,
        rightHip
      );

      drawPelvis(
        ctx,
        leftHip,
        rightHip
      );
    }

    /*
     * ---------------------------------------------------------
     * JOINTS
     * ---------------------------------------------------------
     */

    BODY_JOINTS.forEach((id) => {
      const point = getPoint(
        lmMap,
        id,
        width,
        height
      );

      if (!point) return;

      drawJoint(
        ctx,
        point.x,
        point.y,
        MAJOR_JOINTS.includes(id) ? 8 : 5,
        MAJOR_JOINTS.includes(id)
      );
    });

    /*
     * ---------------------------------------------------------
     * HEAD / SKULL
     * ---------------------------------------------------------
     *
     * MediaPipe Pose normally uses:
     * 0 = nose
     * 7 = left ear
     * 8 = right ear
     */

    const nose = getPoint(
      lmMap,
      0,
      width,
      height
    );

    const leftEar = getPoint(
      lmMap,
      7,
      width,
      height
    );

    const rightEar = getPoint(
      lmMap,
      8,
      width,
      height
    );

    if (nose) {
      let headSize = 26;

      if (leftEar && rightEar) {
        headSize =
          Math.abs(rightEar.x - leftEar.x) * 0.85;
      }

      drawSkull(
        ctx,
        nose.x,
        nose.y - headSize * 0.22,
        headSize
      );
    }

    /*
     * ---------------------------------------------------------
     * EXTRA SPINE
     * ---------------------------------------------------------
     */

    if (
      leftShoulder &&
      rightShoulder &&
      leftHip &&
      rightHip
    ) {
      const centerTop = {
        x:
          (leftShoulder.x +
            rightShoulder.x) /
          2,
        y:
          (leftShoulder.y +
            rightShoulder.y) /
          2,
      };

      const centerBottom = {
        x:
          (leftHip.x +
            rightHip.x) /
          2,
        y:
          (leftHip.y +
            rightHip.y) /
          2,
      };

      ctx.save();

      ctx.strokeStyle = 'rgba(236,254,255,0.9)';
      ctx.lineWidth = 3;

      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 10;

      ctx.beginPath();

      const vertebrae = 8;

      for (let i = 0; i < vertebrae; i++) {
        const t = i / (vertebrae - 1);

        const x =
          centerTop.x +
          (centerBottom.x - centerTop.x) * t;

        const y =
          centerTop.y +
          (centerBottom.y - centerTop.y) * t;

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          3.2,
          0,
          Math.PI * 2
        );

        ctx.fillStyle = '#cffafe';
        ctx.fill();
      }

      ctx.restore();
    }
  }, [trackingFrame, visible]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
      style={{
        transform: 'scaleX(-1)',
      }}
    />
  );
};
