/**
 * MIRAI — GarmentRenderer2D
 *
 * Real-Time Photographic Unified Triangulated Mesh Warping Garment Renderer.
 *
 * UPDATE (dress not visible fix):
 *   1. enableGarmentMesh now defaults to TRUE. It was false and nothing ever enabled it,
 *      so the garment was never drawn (MirrorView/useLiveAR already decide when the
 *      self-hosted engine is active via isARActive).
 *   2. Per-product textures: loadProduct() now builds a texture for the selected product.
 *        - If GarmentRegistry has a referenceImageUrl for the product, that image is used.
 *          (Custom images MUST use the same 1024x1024 layout as the master shirt, because
 *           the mesh UV map is fixed.)
 *        - Otherwise the master linen shirt is RECOLORED with the product's main color.
 *   3. Fixed affine-transform bug in drawTexturedTriangle (d2.x was used instead of d2.y
 *      in the `d` and `f` terms), which skewed/warped the mesh.
 *   4. Texture load failures now throw, so useLiveAR reports garment: 'error' in the console.
 *
 * Architecture:
 *   - 32 triangles across torso + both sleeves form ONE continuous deformable mesh
 *     over a 1024x1024 RGBA master asset (/garments/camp_collar_linen_shirt.png).
 *   - Sleeves follow live arm vectors; torso deforms with body yaw (Z coordinates).
 *   - Cylindrical shading, collar shadow, throat cutout and forearm occlusion.
 */

import type { IGarmentRenderer } from './garmentRenderer';
import type { TrackingFrame } from '../types/tracking';
import type { Product } from '../types/api';
import { getGarmentReference } from '../services/GarmentRegistry';

// EMA smoothing factor: 0.35 gives responsive tracking without jitter
const EMA_ALPHA = 0.35;
const VISIBILITY_THRESHOLD = 0.3;
const FADE_DURATION_MS = 600;

const MASTER_URL = '/garments/camp_collar_linen_shirt.png';

// Standard MediaPipe Pose bone connections
const POSE_CONNECTIONS: [number, number][] = [
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Left arm
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  // Right arm
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
  // Left leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Right leg
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
  // Face & neck
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [0, 11], [0, 12],
];

interface Point {
  x: number;
  y: number;
}

interface ScreenPoint extends Point {
  visibility: number;
  z?: number;
}

// ── Texture helpers ──────────────────────────────────────────────────────────

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${url}`));
    img.src = url;
  });
}

function parseHex(hex: string | undefined | null): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Recolors the master shirt to `hex` while keeping its fabric detail & transparency.
 */
function tintTexture(master: HTMLImageElement, hex: string | undefined | null): HTMLCanvasElement | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;

  const w = master.naturalWidth || 1024;
  const h = master.naturalHeight || 1024;

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = c.getContext('2d');
  if (!t) return null;

  // 1. Base fabric
  t.drawImage(master, 0, 0, w, h);

  // 2. Apply hue/saturation of the product color, keep fabric luminance
  t.globalCompositeOperation = 'color';
  t.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  t.fillRect(0, 0, w, h);

  // 3. Restore the original shirt silhouette (alpha)
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(master, 0, 0, w, h);

  // 4. Lightness correction so dark / white garments look right
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  t.globalCompositeOperation = 'source-atop';
  if (lum < 0.5) {
    t.fillStyle = `rgba(0, 0, 0, ${Math.min(0.85, (0.5 - lum) * 1.7)})`;
    t.fillRect(0, 0, w, h);
  } else if (lum > 0.8) {
    t.fillStyle = `rgba(255, 255, 255, ${Math.min(0.7, (lum - 0.8) * 3)})`;
    t.fillRect(0, 0, w, h);
  }

  t.globalCompositeOperation = 'source-over';
  return c;
}

/**
 * Maps a source triangle (s0, s1, s2) on the texture to destination triangle (d0, d1, d2) on canvas.
 * Applies affine transformation matrix with 0.6px seam expansion to prevent anti-aliasing gaps.
 */
function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  s0: Point, s1: Point, s2: Point,
  d0: Point, d1: Point, d2: Point
): void {
  const delta = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(delta) < 0.001) return;

  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / delta;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / delta;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / delta;
  // FIX: last term uses d2.y (was d2.x)
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / delta;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / delta;
  // FIX: last term uses d2.y (was d2.x)
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / delta;

  // Compute centroid for slight seam-bleed padding (0.6px)
  const cx = (d0.x + d1.x + d2.x) / 3;
  const cy = (d0.y + d1.y + d2.y) / 3;

  const pad = 0.6;
  const p0x = d0.x + (d0.x - cx > 0 ? pad : -pad);
  const p0y = d0.y + (d0.y - cy > 0 ? pad : -pad);
  const p1x = d1.x + (d1.x - cx > 0 ? pad : -pad);
  const p1y = d1.y + (d1.y - cy > 0 ? pad : -pad);
  const p2x = d2.x + (d2.x - cx > 0 ? pad : -pad);
  const p2y = d2.y + (d2.y - cy > 0 ? pad : -pad);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0x, p0y);
  ctx.lineTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * 29 Canonical UV Vertices for the Master Linen Shirt Texture (1024x1024 RGBA)
 * Bounded by actual transparency analysis of camp_collar_linen_shirt.png
 */
const MESH_UV_VERTICES: Record<string, Point> = {
  // Collar & Neck
  neckL:            { x: 380, y: 100 },
  neckR:            { x: 644, y: 100 },
  collarTip:        { x: 512, y: 310 },
  neckBack:         { x: 512, y: 80 },

  // Shoulders & Yoke
  shoulderL:        { x: 185, y: 230 },
  shoulderR:        { x: 839, y: 230 },
  yokeL:            { x: 280, y: 130 },
  yokeR:            { x: 744, y: 130 },

  // Left Sleeve
  sleeveMidL:       { x: 100, y: 320 },
  sleeveCuffOuterL: { x: 58,  y: 400 },
  sleeveCuffInnerL: { x: 190, y: 520 },

  // Right Sleeve
  sleeveMidR:       { x: 924, y: 320 },
  sleeveCuffOuterR: { x: 966, y: 400 },
  sleeveCuffInnerR: { x: 834, y: 520 },

  // Torso & Chest (shared seam vertices with sleeves)
  armpitL:          { x: 244, y: 490 },
  armpitR:          { x: 780, y: 490 },
  chestMid:         { x: 512, y: 490 },
  chestL:           { x: 378, y: 490 },
  chestR:           { x: 646, y: 490 },

  // Waist & Midriff
  waistL:           { x: 244, y: 720 },
  waistML:          { x: 378, y: 720 },
  waistMid:         { x: 512, y: 720 },
  waistMR:          { x: 646, y: 720 },
  waistR:           { x: 780, y: 720 },

  // Bottom Hem
  hemL:             { x: 240, y: 960 },
  hemML:            { x: 376, y: 960 },
  hemMid:           { x: 512, y: 960 },
  hemMR:            { x: 648, y: 960 },
  hemR:             { x: 784, y: 960 },
};

/**
 * 32 Interconnected Triangles forming the Unified Fabric Mesh.
 */
const MESH_TRIANGLES: [string, string, string][] = [
  // Left Sleeve
  ['shoulderL', 'sleeveMidL', 'armpitL'],
  ['sleeveMidL', 'sleeveCuffOuterL', 'sleeveCuffInnerL'],
  ['sleeveMidL', 'sleeveCuffInnerL', 'armpitL'],

  // Right Sleeve
  ['shoulderR', 'armpitR', 'sleeveMidR'],
  ['sleeveMidR', 'sleeveCuffInnerR', 'sleeveCuffOuterR'],
  ['sleeveMidR', 'armpitR', 'sleeveCuffInnerR'],

  // Shoulders & Yoke
  ['neckL', 'yokeL', 'shoulderL'],
  ['neckL', 'shoulderL', 'armpitL'],
  ['neckR', 'shoulderR', 'yokeR'],
  ['neckR', 'armpitR', 'shoulderR'],

  // Collar & Upper Chest
  ['neckL', 'collarTip', 'chestL'],
  ['neckL', 'chestL', 'armpitL'],
  ['neckR', 'chestR', 'collarTip'],
  ['neckR', 'armpitR', 'chestR'],
  ['collarTip', 'chestMid', 'chestL'],
  ['collarTip', 'chestR', 'chestMid'],

  // Mid Chest to Waist
  ['armpitL', 'chestL', 'waistML'],
  ['armpitL', 'waistML', 'waistL'],
  ['chestL', 'chestMid', 'waistMid'],
  ['chestL', 'waistMid', 'waistML'],
  ['chestMid', 'chestR', 'waistMR'],
  ['chestMid', 'waistMR', 'waistMid'],
  ['chestR', 'armpitR', 'waistR'],
  ['chestR', 'waistR', 'waistMR'],

  // Waist to Bottom Hem
  ['waistL', 'waistML', 'hemML'],
  ['waistL', 'hemML', 'hemL'],
  ['waistML', 'waistMid', 'hemMid'],
  ['waistML', 'hemMid', 'hemML'],
  ['waistMid', 'waistMR', 'hemMR'],
  ['waistMid', 'hemMR', 'hemMid'],
  ['waistMR', 'waistR', 'hemR'],
  ['waistMR', 'hemR', 'hemMR'],
];

export class GarmentRenderer2D implements IGarmentRenderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private currentProduct: Product | null = null;
  private showSkeleton: boolean = true;

  // FIX: enabled by default. MirrorView/useLiveAR decide when the KVGE engine is active.
  private enableGarmentMesh: boolean = true;

  setEnableGarmentMesh(enable: boolean): void {
    this.enableGarmentMesh = enable;
  }

  // Master photographic linen texture (1024x1024) + the texture for the selected product
  private masterPromise: Promise<HTMLImageElement | null>;
  private garmentTexture: CanvasImageSource | null = null;
  private loadToken = 0;

  // Offscreen buffer for compositing and segmentation masking
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;

  /** EMA-smoothed landmark positions */
  private smoothed = new Map<number, { x: number; y: number; z: number }>();
  private lastTrackedAt = 0;
  private opacity = 0;

  constructor() {
    this.masterPromise = loadImage(MASTER_URL).catch((e) => {
      console.error(
        `[MIRAI] Could not load master garment texture. Make sure the file exists at frontend/public${MASTER_URL}`,
        e
      );
      return null;
    });
  }

  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('GarmentRenderer2D: could not get 2D context');
    this.ctx = ctx;

    // Create offscreen buffer
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = canvas.width || 1280;
    this.offscreenCanvas.height = canvas.height || 720;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
  }

  setShowSkeleton(show: boolean): void {
    this.showSkeleton = show;
  }

  /**
   * Builds the texture for the selected product.
   *  1. Registry image (if provided) — must share the master's 1024x1024 layout.
   *  2. Otherwise: master shirt recolored with the product's main color.
   */
  async loadProduct(product: Product): Promise<void> {
    const token = ++this.loadToken;
    this.currentProduct = product;
    this.opacity = 0;

    const master = await this.masterPromise;
    if (token !== this.loadToken) return; // a newer product was selected

    const refUrl = getGarmentReference(product.id)?.referenceImageUrl || '';
    let texture: CanvasImageSource | null = null;

    if (refUrl && refUrl !== MASTER_URL) {
      try {
        texture = await loadImage(refUrl);
      } catch (err) {
        console.warn('[MIRAI] Product garment image failed, using recolored master shirt:', refUrl, err);
      }
    } else if (refUrl === MASTER_URL && master) {
      texture = master; // the real linen shirt, natural color
    }

    if (!texture && master) {
      const hex = (product as { colors?: { hex?: string }[] }).colors?.[0]?.hex;
      texture = tintTexture(master, hex) ?? master;
    }

    if (token !== this.loadToken) return;

    if (!texture) {
      this.garmentTexture = null;
      throw new Error(
        `No garment texture available for ${product.id}. Check that frontend/public${MASTER_URL} exists.`
      );
    }

    this.garmentTexture = texture;
  }

  unloadGarment(): void {
    this.loadToken++;
    this.currentProduct = null;
    this.garmentTexture = null;
    this.clear();
  }

  clear(): void {
    if (this.canvas && this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (this.offscreenCanvas && this.offscreenCtx) {
      this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
    }
    this.opacity = 0;
    this.smoothed.clear();
    this.lastTrackedAt = 0;
  }

  dispose(): void {
    this.clear();
    this.currentProduct = null;
    this.garmentTexture = null;
  }

  renderFrame(
    tracking: TrackingFrame,
    selectedGarment?: Product,
    videoElement?: HTMLVideoElement,
    maskCanvas?: HTMLCanvasElement | OffscreenCanvas
  ): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Sync offscreen buffer dimensions
    if (
      this.offscreenCanvas &&
      (this.offscreenCanvas.width !== this.canvas.width ||
        this.offscreenCanvas.height !== this.canvas.height)
    ) {
      this.offscreenCanvas.width = this.canvas.width;
      this.offscreenCanvas.height = this.canvas.height;
    }

    const isTracked =
      tracking.tracking_state === 'tracked' && tracking.landmarks.length > 0;

    // ── Update Opacity ──────────────────────────────────────────────────
    if (isTracked) {
      this.lastTrackedAt = Date.now();
      this.opacity = Math.min(1, this.opacity + 0.14);
    } else {
      const elapsed = Date.now() - this.lastTrackedAt;
      const fade = 1 - Math.min(1, elapsed / FADE_DURATION_MS);
      this.opacity = fade;
    }

    if (this.opacity < 0.01 && !this.showSkeleton) return;

    // ── Apply EMA Smoothing ─────────────────────────────────────────────
    if (tracking.landmarks.length > 0) {
      this.applyEMA(tracking.landmarks);
    }

    // ── Convert to Screen Space (Mirrored for Smart Mirror) ─────────────
    const { scale: coverScale, offsetX, offsetY } = this.getCoverTransform(tracking);
    const toScreen = (id: number): ScreenPoint | null => {
      const lm = this.smoothed.get(id);
      const rawLm = tracking.landmarks.find((l) => l.id === id);
      if (!lm) return null;
      const vis = rawLm?.visibility ?? 0;
      // Mirror flip: screen_x = offsetX + (1 - normalized_x) * videoW * coverScale
      return {
        x: offsetX + (1 - lm.x) * tracking.frame_width * coverScale,
        y: offsetY + lm.y * tracking.frame_height * coverScale,
        z: lm.z,
        visibility: vis,
      };
    };

    // ── Render Garment Mesh (under the skeleton) ─────────────────────────
    const garment = selectedGarment ?? this.currentProduct;
    if (this.enableGarmentMesh && garment && this.opacity >= 0.01 && this.garmentTexture) {
      this.renderUnifiedContinuousGarment(toScreen, tracking, videoElement, maskCanvas);
    }

    // ── Draw Skeleton (if enabled) ───────────────────────────────────────
    if (this.showSkeleton && isTracked) {
      this.drawSkeleton(toScreen);
    }
  }

  // ── Unified Continuous Mesh Warping Pipeline ─────────────────────────

  private renderUnifiedContinuousGarment(
    toScreen: (id: number) => ScreenPoint | null,
    tracking: TrackingFrame,
    videoElement?: HTMLVideoElement,
    _maskCanvas?: HTMLCanvasElement | OffscreenCanvas
  ): void {
    const texture = this.garmentTexture;
    if (!texture || !this.offscreenCtx || !this.offscreenCanvas) return;

    // 1. Core Pose Landmarks
    // Landmark 11 (wearer's left shoulder) -> Screen Left (viewer's left)
    // Landmark 12 (wearer's right shoulder) -> Screen Right (viewer's right)
    const sL = toScreen(11);
    const sR = toScreen(12);
    if (!sL || !sR || sL.visibility < VISIBILITY_THRESHOLD || sR.visibility < VISIBILITY_THRESHOLD) {
      return;
    }

    const eL = toScreen(13); // Left Elbow
    const eR = toScreen(14); // Right Elbow
    const wL = toScreen(15); // Left Wrist
    const wR = toScreen(16); // Right Wrist
    const hL = toScreen(23); // Left Hip
    const hR = toScreen(24); // Right Hip
    const nose = toScreen(0);
    const mouthL = toScreen(9);
    const mouthR = toScreen(10);

    // 2. Metrics & Coordinate Basis
    const sDx = sR.x - sL.x;
    const sDy = sR.y - sL.y;
    const shoulderSpan = Math.sqrt(sDx * sDx + sDy * sDy);
    if (shoulderSpan < 25) return;

    // Unit vectors: across shoulders and down spine
    const uAcross: Point = { x: sDx / shoulderSpan, y: sDy / shoulderSpan };
    const uDown: Point = { x: -uAcross.y, y: uAcross.x };
    const sMid: Point = { x: (sL.x + sR.x) / 2, y: (sL.y + sR.y) / 2 };

    // 3. 3D Body Yaw & Cylindrical Perspective
    const zL = sL.z ?? 0;
    const zR = sR.z ?? 0;
    const yaw = Math.max(-0.6, Math.min(0.6, (zR - zL) * 2.2));
    const centerShift: Point = {
      x: uAcross.x * (yaw * shoulderSpan * 0.1),
      y: uAcross.y * (yaw * shoulderSpan * 0.1),
    };

    // 4. Anatomical Chin Line & Collar Clamping
    let chinY = sMid.y - shoulderSpan * 0.28;
    if (mouthL && mouthR && mouthL.visibility > 0.35 && mouthR.visibility > 0.35) {
      chinY = Math.max(mouthL.y, mouthR.y) + (mouthL.y - (nose?.y ?? mouthL.y)) * 0.28;
    } else if (nose && nose.visibility > 0.35) {
      chinY = nose.y + shoulderSpan * 0.26;
    }

    // Collar V-notch (sternal notch / clavicle - strictly below chin!)
    const clavicleY = Math.max(sMid.y + shoulderSpan * 0.16, chinY + 16);
    const d_collarTip: Point = {
      x: sMid.x + uDown.x * (clavicleY - sMid.y) + centerShift.x,
      y: clavicleY + centerShift.y,
    };

    // Neck base notches (sides of throat)
    const neckSpan = shoulderSpan * 0.2;
    const neckBaseY = Math.max(chinY + 8, sMid.y - shoulderSpan * 0.05);
    const d_neckL: Point = {
      x: sMid.x - uAcross.x * neckSpan,
      y: neckBaseY,
    };
    const d_neckR: Point = {
      x: sMid.x + uAcross.x * neckSpan,
      y: neckBaseY,
    };
    const d_neckBack: Point = {
      x: sMid.x - uDown.x * (shoulderSpan * 0.08),
      y: sMid.y - uDown.y * (shoulderSpan * 0.08),
    };

    // 5. Tailored Shoulders & Yoke Ridge
    const padOut = shoulderSpan * 0.1;
    const padUp = shoulderSpan * 0.03;
    const d_shoulderL: Point = {
      x: sL.x - uAcross.x * padOut - uDown.x * padUp,
      y: sL.y - uAcross.y * padOut - uDown.y * padUp,
    };
    const d_shoulderR: Point = {
      x: sR.x + uAcross.x * padOut - uDown.x * padUp,
      y: sR.y + uAcross.y * padOut - uDown.y * padUp,
    };
    const d_yokeL: Point = {
      x: (d_neckL.x + d_shoulderL.x) * 0.5 - uDown.x * (shoulderSpan * 0.04),
      y: (d_neckL.y + d_shoulderL.y) * 0.5 - uDown.y * (shoulderSpan * 0.04),
    };
    const d_yokeR: Point = {
      x: (d_neckR.x + d_shoulderR.x) * 0.5 - uDown.x * (shoulderSpan * 0.04),
      y: (d_neckR.y + d_shoulderR.y) * 0.5 - uDown.y * (shoulderSpan * 0.04),
    };

    // 6. Armpits & Chest Mid
    const armpitDepth = shoulderSpan * 0.4;
    const d_armpitL: Point = {
      x: sL.x - uAcross.x * (shoulderSpan * 0.02) + uDown.x * armpitDepth,
      y: sL.y - uAcross.y * (shoulderSpan * 0.02) + uDown.y * armpitDepth,
    };
    const d_armpitR: Point = {
      x: sR.x + uAcross.x * (shoulderSpan * 0.02) + uDown.x * armpitDepth,
      y: sR.y + uAcross.y * (shoulderSpan * 0.02) + uDown.y * armpitDepth,
    };
    const d_chestMid: Point = {
      x: (d_armpitL.x + d_armpitR.x) * 0.5 + centerShift.x,
      y: (d_armpitL.y + d_armpitR.y) * 0.5 + centerShift.y,
    };
    const d_chestL: Point = {
      x: (d_armpitL.x + d_chestMid.x) * 0.5,
      y: (d_armpitL.y + d_chestMid.y) * 0.5,
    };
    const d_chestR: Point = {
      x: (d_armpitR.x + d_chestMid.x) * 0.5,
      y: (d_armpitR.y + d_chestMid.y) * 0.5,
    };

    // 7. Articulated Left Sleeve
    let targetElbowL: Point;
    if (eL && eL.visibility > VISIBILITY_THRESHOLD) {
      targetElbowL = { x: eL.x, y: eL.y };
    } else {
      targetElbowL = {
        x: d_shoulderL.x - uAcross.x * (shoulderSpan * 0.2) + uDown.x * (shoulderSpan * 0.78),
        y: d_shoulderL.y - uAcross.y * (shoulderSpan * 0.2) + uDown.y * (shoulderSpan * 0.78),
      };
    }
    const vArmL: Point = { x: targetElbowL.x - d_shoulderL.x, y: targetElbowL.y - d_shoulderL.y };
    const lenArmL = Math.max(30, Math.sqrt(vArmL.x * vArmL.x + vArmL.y * vArmL.y));
    const uArmL: Point = { x: vArmL.x / lenArmL, y: vArmL.y / lenArmL };
    const uPerpL: Point = { x: -uArmL.y, y: uArmL.x };

    // Short sleeve ends at 62% along upper arm
    const pCuffMidL: Point = {
      x: d_shoulderL.x + vArmL.x * 0.62,
      y: d_shoulderL.y + vArmL.y * 0.62,
    };
    const cuffHalfWidth = shoulderSpan * 0.16;
    const d_sleeveCuffOuterL: Point = {
      x: pCuffMidL.x - uPerpL.x * cuffHalfWidth,
      y: pCuffMidL.y - uPerpL.y * cuffHalfWidth,
    };
    const d_sleeveCuffInnerL: Point = {
      x: pCuffMidL.x + uPerpL.x * cuffHalfWidth,
      y: pCuffMidL.y + uPerpL.y * cuffHalfWidth,
    };
    const d_sleeveMidL: Point = {
      x: d_shoulderL.x + vArmL.x * 0.3 - uPerpL.x * (shoulderSpan * 0.18),
      y: d_shoulderL.y + vArmL.y * 0.3 - uPerpL.y * (shoulderSpan * 0.18),
    };

    // 8. Articulated Right Sleeve
    let targetElbowR: Point;
    if (eR && eR.visibility > VISIBILITY_THRESHOLD) {
      targetElbowR = { x: eR.x, y: eR.y };
    } else {
      targetElbowR = {
        x: d_shoulderR.x + uAcross.x * (shoulderSpan * 0.2) + uDown.x * (shoulderSpan * 0.78),
        y: d_shoulderR.y + uAcross.y * (shoulderSpan * 0.2) + uDown.y * (shoulderSpan * 0.78),
      };
    }
    const vArmR: Point = { x: targetElbowR.x - d_shoulderR.x, y: targetElbowR.y - d_shoulderR.y };
    const lenArmR = Math.max(30, Math.sqrt(vArmR.x * vArmR.x + vArmR.y * vArmR.y));
    const uArmR: Point = { x: vArmR.x / lenArmR, y: vArmR.y / lenArmR };
    const uPerpR: Point = { x: -uArmR.y, y: uArmR.x };

    const pCuffMidR: Point = {
      x: d_shoulderR.x + vArmR.x * 0.62,
      y: d_shoulderR.y + vArmR.y * 0.62,
    };
    const d_sleeveCuffOuterR: Point = {
      x: pCuffMidR.x + uPerpR.x * cuffHalfWidth,
      y: pCuffMidR.y + uPerpR.y * cuffHalfWidth,
    };
    const d_sleeveCuffInnerR: Point = {
      x: pCuffMidR.x - uPerpR.x * cuffHalfWidth,
      y: pCuffMidR.y - uPerpR.y * cuffHalfWidth,
    };
    const d_sleeveMidR: Point = {
      x: d_shoulderR.x + vArmR.x * 0.3 + uPerpR.x * (shoulderSpan * 0.18),
      y: d_shoulderR.y + vArmR.y * 0.3 + uPerpR.y * (shoulderSpan * 0.18),
    };

    // 9. Waist & Hem (With Seated User Fallback)
    const hipsTracked = hL && hR && hL.visibility > 0.35 && hR.visibility > 0.35;
    let torsoLen = shoulderSpan * 1.38;
    if (hipsTracked && hL && hR) {
      const hipMidY = (hL.y + hR.y) * 0.5;
      torsoLen = Math.max(shoulderSpan * 1.25, hipMidY - sMid.y + shoulderSpan * 0.12);
    }

    const hemCenter: Point = {
      x: sMid.x + uDown.x * torsoLen,
      y: sMid.y + uDown.y * torsoLen,
    };
    const hemSpan = shoulderSpan * 0.88;
    const d_hemL: Point = {
      x: hemCenter.x - uAcross.x * (hemSpan * 0.5) + uDown.x * (shoulderSpan * 0.03),
      y: hemCenter.y - uAcross.y * (hemSpan * 0.5) + uDown.y * (shoulderSpan * 0.03),
    };
    const d_hemR: Point = {
      x: hemCenter.x + uAcross.x * (hemSpan * 0.5) + uDown.x * (shoulderSpan * 0.03),
      y: hemCenter.y + uAcross.y * (hemSpan * 0.5) + uDown.y * (shoulderSpan * 0.03),
    };
    const d_hemMid: Point = {
      x: hemCenter.x + centerShift.x,
      y: hemCenter.y + centerShift.y,
    };
    const d_hemML: Point = {
      x: (d_hemL.x + d_hemMid.x) * 0.5,
      y: (d_hemL.y + d_hemMid.y) * 0.5,
    };
    const d_hemMR: Point = {
      x: (d_hemR.x + d_hemMid.x) * 0.5,
      y: (d_hemR.y + d_hemMid.y) * 0.5,
    };

    // Waist midpoint between armpits and hem
    const waistCenter: Point = {
      x: (sMid.x + hemCenter.x) * 0.5,
      y: (sMid.y + hemCenter.y) * 0.5,
    };
    const waistSpan = shoulderSpan * 0.82; // Natural waist taper
    const d_waistL: Point = {
      x: waistCenter.x - uAcross.x * (waistSpan * 0.5),
      y: waistCenter.y - uAcross.y * (waistSpan * 0.5),
    };
    const d_waistR: Point = {
      x: waistCenter.x + uAcross.x * (waistSpan * 0.5),
      y: waistCenter.y + uAcross.y * (waistSpan * 0.5),
    };
    const d_waistMid: Point = {
      x: waistCenter.x + centerShift.x,
      y: waistCenter.y + centerShift.y,
    };
    const d_waistML: Point = {
      x: (d_waistL.x + d_waistMid.x) * 0.5,
      y: (d_waistL.y + d_waistMid.y) * 0.5,
    };
    const d_waistMR: Point = {
      x: (d_waistR.x + d_waistMid.x) * 0.5,
      y: (d_waistR.y + d_waistMid.y) * 0.5,
    };

    // Dictionary of all destination vertices mapped by ID
    const destMap: Record<string, Point> = {
      neckL: d_neckL,
      neckR: d_neckR,
      collarTip: d_collarTip,
      neckBack: d_neckBack,
      shoulderL: d_shoulderL,
      shoulderR: d_shoulderR,
      yokeL: d_yokeL,
      yokeR: d_yokeR,
      sleeveMidL: d_sleeveMidL,
      sleeveCuffOuterL: d_sleeveCuffOuterL,
      sleeveCuffInnerL: d_sleeveCuffInnerL,
      sleeveMidR: d_sleeveMidR,
      sleeveCuffOuterR: d_sleeveCuffOuterR,
      sleeveCuffInnerR: d_sleeveCuffInnerR,
      armpitL: d_armpitL,
      armpitR: d_armpitR,
      chestMid: d_chestMid,
      chestL: d_chestL,
      chestR: d_chestR,
      waistL: d_waistL,
      waistML: d_waistML,
      waistMid: d_waistMid,
      waistMR: d_waistMR,
      waistR: d_waistR,
      hemL: d_hemL,
      hemML: d_hemML,
      hemMid: d_hemMid,
      hemMR: d_hemMR,
      hemR: d_hemR,
    };

    // ── 10. RENDER TO OFFSCREEN BUFFER ──────────────────────────────────
    const oCtx = this.offscreenCtx;
    oCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

    // Draw all connected triangles across the single garment texture
    for (const [v0, v1, v2] of MESH_TRIANGLES) {
      const s0 = MESH_UV_VERTICES[v0];
      const s1 = MESH_UV_VERTICES[v1];
      const s2 = MESH_UV_VERTICES[v2];
      const d0 = destMap[v0];
      const d1 = destMap[v1];
      const d2 = destMap[v2];
      if (!s0 || !s1 || !s2 || !d0 || !d1 || !d2) continue;

      drawTexturedTriangle(oCtx, texture, s0, s1, s2, d0, d1, d2);
    }

    // ── 11. CYLINDRICAL FABRIC SHADING PASS ──────────────────────────────
    this.applyCylindricalShading(oCtx, destMap);

    // ── 12. DRAW TO MAIN CANVAS WITH OPACITY ─────────────────────────────
    this.ctx.save();
    this.ctx.globalAlpha = this.opacity;
    this.ctx.drawImage(this.offscreenCanvas, 0, 0);

    // ── 13. REAL NECK & THROAT OCCLUSION (Camp Collar V-Cutout) ──────────
    if (videoElement) {
      this.renderThroatCutoutOcclusion(this.ctx, videoElement, tracking, d_neckL, d_neckR, d_collarTip, chinY);
      this.renderForearmOcclusion(this.ctx, videoElement, tracking, eL, wL, eR, wR, shoulderSpan, destMap);
    }

    this.ctx.restore();
  }

  // ── 3D Cylindrical Shading ───────────────────────────────────────────

  private applyCylindricalShading(
    ctx: CanvasRenderingContext2D,
    pts: Record<string, Point>
  ): void {
    ctx.save();

    // Keep shading inside the garment silhouette only
    ctx.globalCompositeOperation = 'source-atop';

    // 1. Left Flank Shadow
    const gradL = ctx.createLinearGradient(pts.armpitL.x, pts.armpitL.y, pts.chestL.x, pts.chestL.y);
    gradL.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
    gradL.addColorStop(0.5, 'rgba(0, 0, 0, 0.08)');
    gradL.addColorStop(1, 'rgba(0, 0, 0, 0.00)');

    ctx.fillStyle = gradL;
    ctx.beginPath();
    ctx.moveTo(pts.shoulderL.x, pts.shoulderL.y);
    ctx.lineTo(pts.armpitL.x, pts.armpitL.y);
    ctx.lineTo(pts.waistL.x, pts.waistL.y);
    ctx.lineTo(pts.hemL.x, pts.hemL.y);
    ctx.lineTo(pts.hemML.x, pts.hemML.y);
    ctx.lineTo(pts.waistML.x, pts.waistML.y);
    ctx.lineTo(pts.chestL.x, pts.chestL.y);
    ctx.closePath();
    ctx.fill();

    // 2. Right Flank Shadow
    const gradR = ctx.createLinearGradient(pts.armpitR.x, pts.armpitR.y, pts.chestR.x, pts.chestR.y);
    gradR.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
    gradR.addColorStop(0.5, 'rgba(0, 0, 0, 0.08)');
    gradR.addColorStop(1, 'rgba(0, 0, 0, 0.00)');

    ctx.fillStyle = gradR;
    ctx.beginPath();
    ctx.moveTo(pts.shoulderR.x, pts.shoulderR.y);
    ctx.lineTo(pts.armpitR.x, pts.armpitR.y);
    ctx.lineTo(pts.waistR.x, pts.waistR.y);
    ctx.lineTo(pts.hemR.x, pts.hemR.y);
    ctx.lineTo(pts.hemMR.x, pts.hemMR.y);
    ctx.lineTo(pts.waistMR.x, pts.waistMR.y);
    ctx.lineTo(pts.chestR.x, pts.chestR.y);
    ctx.closePath();
    ctx.fill();

    // 3. Collar Lapel Drop Shadow
    const gradCollar = ctx.createLinearGradient(
      pts.collarTip.x, pts.collarTip.y - 30,
      pts.collarTip.x, pts.collarTip.y + 25
    );
    gradCollar.addColorStop(0, 'rgba(0, 0, 0, 0.32)');
    gradCollar.addColorStop(1, 'rgba(0, 0, 0, 0.00)');

    ctx.fillStyle = gradCollar;
    ctx.beginPath();
    ctx.moveTo(pts.neckL.x, pts.neckL.y);
    ctx.lineTo(pts.collarTip.x, pts.collarTip.y + 15);
    ctx.lineTo(pts.neckR.x, pts.neckR.y);
    ctx.lineTo(pts.chestR.x, pts.chestR.y);
    ctx.lineTo(pts.chestMid.x, pts.chestMid.y);
    ctx.lineTo(pts.chestL.x, pts.chestL.y);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ── Layer Occlusions ─────────────────────────────────────────────────

  /**
   * Restores the customer's real throat, chin, and chest in the open collar V-opening.
   */
  private renderThroatCutoutOcclusion(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    tracking: TrackingFrame,
    neckL: Point,
    neckR: Point,
    collarTip: Point,
    chinY: number
  ): void {
    ctx.save();
    ctx.beginPath();
    // V-neck notch polygon
    ctx.moveTo(neckL.x, chinY);
    ctx.lineTo(neckR.x, chinY);
    ctx.lineTo(neckR.x, neckR.y);
    ctx.lineTo(collarTip.x, collarTip.y - 4);
    ctx.lineTo(neckL.x, neckL.y);
    ctx.closePath();
    ctx.clip();

    this.drawMirroredVideo(ctx, video, tracking);
    ctx.restore();
  }

  /**
   * Dynamic Forearm & Hand Occlusion.
   * If the customer crosses their arms in front of the torso, the real camera feed
   * of the forearm and hand is drawn in front of the virtual garment.
   */
  private renderForearmOcclusion(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    tracking: TrackingFrame,
    eL: ScreenPoint | null,
    wL: ScreenPoint | null,
    eR: ScreenPoint | null,
    wR: ScreenPoint | null,
    shoulderSpan: number,
    destMap: Record<string, Point>
  ): void {
    const minTorsoX = Math.min(destMap.armpitL.x, destMap.waistL.x) - 10;
    const maxTorsoX = Math.max(destMap.armpitR.x, destMap.waistR.x) + 10;
    const minTorsoY = Math.min(destMap.shoulderL.y, destMap.shoulderR.y);
    const maxTorsoY = Math.max(destMap.hemL.y, destMap.hemR.y) + 20;

    const checkArm = (elbow: ScreenPoint | null, wrist: ScreenPoint | null) => {
      if (!elbow || !wrist || elbow.visibility < 0.35 || wrist.visibility < 0.35) return;

      // Check if wrist is in front of torso bounding box
      const inTorso =
        wrist.x >= minTorsoX && wrist.x <= maxTorsoX &&
        wrist.y >= minTorsoY && wrist.y <= maxTorsoY;

      if (!inTorso) return;

      const vArm: Point = { x: wrist.x - elbow.x, y: wrist.y - elbow.y };
      const len = Math.sqrt(vArm.x * vArm.x + vArm.y * vArm.y);
      if (len < 20) return;

      const perp: Point = { x: -vArm.y / len, y: vArm.x / len };
      const halfW = shoulderSpan * 0.085;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(elbow.x - perp.x * halfW, elbow.y - perp.y * halfW);
      ctx.lineTo(elbow.x + perp.x * halfW, elbow.y + perp.y * halfW);
      ctx.lineTo(wrist.x + perp.x * (halfW * 1.15), wrist.y + perp.y * (halfW * 1.15));
      ctx.lineTo(wrist.x + vArm.x * 0.25, wrist.y + vArm.y * 0.25); // Include hand/fingers
      ctx.lineTo(wrist.x - perp.x * (halfW * 1.15), wrist.y - perp.y * (halfW * 1.15));
      ctx.closePath();
      ctx.clip();

      this.drawMirroredVideo(ctx, video, tracking);
      ctx.restore();
    };

    checkArm(eL, wL);
    checkArm(eR, wR);
  }

  /**
   * Helper to draw the mirrored camera frame matching screen coordinates.
   */
  private drawMirroredVideo(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    tracking: TrackingFrame
  ): void {
    const { scale, offsetX, offsetY } = this.getCoverTransform(tracking);
    const vW = tracking.frame_width || 1280;
    ctx.save();
    ctx.translate(offsetX + vW * scale, offsetY);
    ctx.scale(-scale, scale);
    ctx.drawImage(video, 0, 0);
    ctx.restore();
  }

  // ── Skeleton Drawing ─────────────────────────────────────────────────

  private drawSkeleton(toScreen: (id: number) => ScreenPoint | null): void {
    this.ctx.save();

    this.ctx.lineWidth = 2.5;
    this.ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';

    for (const [p1, p2] of POSE_CONNECTIONS) {
      const pt1 = toScreen(p1);
      const pt2 = toScreen(p2);
      if (!pt1 || !pt2) continue;
      if (pt1.visibility < 0.3 || pt2.visibility < 0.3) continue;

      this.ctx.beginPath();
      this.ctx.moveTo(pt1.x, pt1.y);
      this.ctx.lineTo(pt2.x, pt2.y);
      this.ctx.stroke();
    }

    for (let id = 0; id <= 32; id++) {
      const pt = toScreen(id);
      if (!pt || pt.visibility < 0.3) continue;

      const isAnchor = id === 11 || id === 12 || id === 13 || id === 14 || id === 23 || id === 24;

      this.ctx.beginPath();
      this.ctx.arc(pt.x, pt.y, isAnchor ? 5 : 3, 0, Math.PI * 2);
      this.ctx.fillStyle = isAnchor ? '#a855f7' : '#22d3ee';
      this.ctx.fill();

      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  // ── Math Helpers ─────────────────────────────────────────────────────

  private applyEMA(landmarks: TrackingFrame['landmarks']): void {
    for (const lm of landmarks) {
      const prev = this.smoothed.get(lm.id);
      if (!prev) {
        this.smoothed.set(lm.id, { x: lm.x, y: lm.y, z: lm.z });
      } else {
        this.smoothed.set(lm.id, {
          x: EMA_ALPHA * lm.x + (1 - EMA_ALPHA) * prev.x,
          y: EMA_ALPHA * lm.y + (1 - EMA_ALPHA) * prev.y,
          z: EMA_ALPHA * lm.z + (1 - EMA_ALPHA) * prev.z,
        });
      }
    }
  }

  private getCoverTransform(tracking: TrackingFrame): {
    scale: number;
    offsetX: number;
    offsetY: number;
  } {
    const vW = tracking.frame_width || 1280;
    const vH = tracking.frame_height || 720;
    const cW = this.canvas.width || 1;
    const cH = this.canvas.height || 1;

    const videoAspect = vW / vH;
    const canvasAspect = cW / cH;

    let scale: number;
    if (videoAspect > canvasAspect) {
      scale = cH / vH;
    } else {
      scale = cW / vW;
    }

    const offsetX = (cW - vW * scale) / 2;
    const offsetY = (cH - vH * scale) / 2;
    return { scale, offsetX, offsetY };
  }
}