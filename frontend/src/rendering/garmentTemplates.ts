/**
 * MIRAI — garmentTemplates
 *
 * Per-category garment templates for GarmentRenderer2D (KVGE).
 *
 * Each template tells the renderer:
 *   - which UV layout the texture uses (uv === null → renderer's built-in master-shirt UVs)
 *   - how far the sleeve reaches along the shoulder→elbow vector
 *   - whether the collar is open (shirt) or closed (jacket / hoodie)
 *   - how to build the texture (jackets/hoodies are rasterized from the SVG generators,
 *     so they work with ZERO external assets and ZERO API keys)
 *
 * Place at: frontend/src/rendering/garmentTemplates.ts
 */

import type { Product } from '../types/api';
// SVG generator lives next to this file: frontend/src/rendering/garmentAssets.ts
import { getGarmentAsset, svgToDataUrl } from './garmentAssets';

export interface MeshPoint {
  x: number;
  y: number;
}
export type UVMap = Record<string, MeshPoint>;
type Tri = [string, string, string];
type XY = [number, number];

export interface GarmentTemplate {
  id: 'shirt' | 'jacket' | 'hoodie';
  /** null → use the renderer's built-in MESH_UV_VERTICES (master linen shirt) */
  uv: UVMap | null;
  /** extra triangles appended to MESH_TRIANGLES (e.g. to close the collar V) */
  extraTriangles: Tri[];
  /** cuff position as a multiple of the shoulder→elbow vector (shirt 0.62, long sleeve ~1.45) */
  sleeveReach: number;
  /** true → restore the real throat inside the collar V (camp collar). false → closed neckline */
  openCollar: boolean;
  /** null → renderer uses its existing master-PNG / registry / tint pipeline */
  buildTexture: ((hex: string | undefined) => Promise<HTMLCanvasElement>) | null;
}

// ── SVG rasterization ────────────────────────────────────────────────────────
// The SVGs use viewBox "0 0 1000 1200" but sleeves overflow it (x from -20 to 1020).
// We re-frame the viewBox with padding so nothing is clipped.
// Texture pixel = SVG coordinate + PAD.

const PAD = 50;
const TEX_W = 1000 + PAD * 2;
const TEX_H = 1200 + PAD * 2;

const P = (x: number, y: number): MeshPoint => ({ x: x + PAD, y: y + PAD });
const mid = (a: MeshPoint, b: MeshPoint): MeshPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Builds the full 29-vertex UV map from LEFT-side points (right side is mirrored about x=500). */
function makeUV(s: {
  neck: XY; collarTip: XY; neckBack: XY; shoulder: XY; yoke: XY;
  sleeveMid: XY; cuffOuter: XY; cuffInner: XY; armpit: XY; waist: XY; hem: XY;
}): UVMap {
  const L = (k: XY) => P(k[0], k[1]);
  const R = (k: XY) => P(1000 - k[0], k[1]);

  const armpitL = L(s.armpit);
  const armpitR = R(s.armpit);
  const chestMid = P(500, s.armpit[1]);
  const waistL = L(s.waist);
  const waistR = R(s.waist);
  const waistMid = P(500, s.waist[1]);
  const hemL = L(s.hem);
  const hemR = R(s.hem);
  const hemMid = P(500, s.hem[1]);

  return {
    neckL: L(s.neck), neckR: R(s.neck),
    collarTip: L(s.collarTip), neckBack: L(s.neckBack),
    shoulderL: L(s.shoulder), shoulderR: R(s.shoulder),
    yokeL: L(s.yoke), yokeR: R(s.yoke),
    sleeveMidL: L(s.sleeveMid), sleeveMidR: R(s.sleeveMid),
    sleeveCuffOuterL: L(s.cuffOuter), sleeveCuffOuterR: R(s.cuffOuter),
    sleeveCuffInnerL: L(s.cuffInner), sleeveCuffInnerR: R(s.cuffInner),
    armpitL, armpitR, chestMid,
    chestL: mid(armpitL, chestMid), chestR: mid(armpitR, chestMid),
    waistL, waistML: mid(waistL, waistMid), waistMid, waistMR: mid(waistR, waistMid), waistR,
    hemL, hemML: mid(hemL, hemMid), hemMid, hemMR: mid(hemR, hemMid), hemR,
  };
}

// UV coordinates below are in the ORIGINAL SVG coordinate space of GarmentAssets
// (jacketSVG / hoodieSVG). If you edit those SVG shapes, re-tune these numbers.

const JACKET_UV = makeUV({
  neck: [375, 160], collarTip: [500, 300], neckBack: [500, 118],
  shoulder: [175, 250], yoke: [278, 207],
  sleeveMid: [95, 330], cuffOuter: [-20, 590], cuffInner: [70, 680],
  armpit: [260, 440], waist: [218, 760], hem: [240, 1080],
});

const HOODIE_UV = makeUV({
  neck: [380, 157], collarTip: [500, 285], neckBack: [500, 118],
  shoulder: [175, 250], yoke: [283, 208],
  sleeveMid: [100, 340], cuffOuter: [5, 610], cuffInner: [85, 690],
  armpit: [260, 445], waist: [215, 792], hem: [242, 1140],
});

// ── Colour helpers ───────────────────────────────────────────────────────────

function normalizeHex(hex?: string): string {
  const h = (hex ?? '#2a2a2e').trim().replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return /^[0-9a-fA-F]{6}$/.test(f) ? `#${f}` : '#2a2a2e';
}

/**
 * Pure black renders as a flat silhouette (and vanishes over dark clothing).
 * Lift very dark colours to a minimum luminance so folds / sheen are visible.
 */
function liftDark(hex: string, minLum = 0.11): string {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (l >= minLum) return hex;
  const t = (minLum - l) / (1 - l);
  const f = (v: number) => Math.round(v + (255 - v) * t);
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

async function buildSvgTexture(
  category: 'jackets' | 'hoodies',
  hex: string | undefined
): Promise<HTMLCanvasElement> {
  const asset = getGarmentAsset(category, liftDark(normalizeHex(hex)));

  const svg = asset.svgString
    .replace('viewBox="0 0 1000 1200"', `viewBox="${-PAD} ${-PAD} ${TEX_W} ${TEX_H}"`)
    .replace('<svg ', `<svg width="${TEX_W}" height="${TEX_H}" `);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error(`Garment SVG failed to rasterize (${category})`));
    i.src = svgToDataUrl(svg);
  });

  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('garmentTemplates: no 2D context');
  ctx.drawImage(img, 0, 0, TEX_W, TEX_H);

  // Soft studio sheen (only where the garment is opaque) so dark fabric reads as 3D
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, 0, TEX_W, TEX_H);
  g.addColorStop(0, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.00)');
  g.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.globalCompositeOperation = 'source-over';

  return c;
}

// ── Templates ────────────────────────────────────────────────────────────────

const SHIRT: GarmentTemplate = {
  id: 'shirt',
  uv: null,
  extraTriangles: [],
  sleeveReach: 0.62,
  openCollar: true,
  buildTexture: null,
};

const JACKET: GarmentTemplate = {
  id: 'jacket',
  uv: JACKET_UV,
  extraTriangles: [['neckL', 'neckR', 'collarTip']], // closed zip collar
  sleeveReach: 1.45,
  openCollar: false,
  buildTexture: (hex) => buildSvgTexture('jackets', hex),
};

const HOODIE: GarmentTemplate = {
  id: 'hoodie',
  uv: HOODIE_UV,
  extraTriangles: [['neckL', 'neckR', 'collarTip']],
  sleeveReach: 1.45,
  openCollar: false,
  buildTexture: (hex) => buildSvgTexture('hoodies', hex),
};

// ── Public API ───────────────────────────────────────────────────────────────

/** Best-effort category id from a Product (field name differs between API versions). */
export function categoryOf(p: Product): string {
  const a = p as unknown as Record<string, unknown>;
  return String(a.category_id ?? a.categoryId ?? a.category ?? '').toLowerCase();
}

export function getTemplate(category: string): GarmentTemplate {
  const c = category.toLowerCase();
  if (c.includes('jacket') || c.includes('bomber') || c.includes('coat')) return JACKET;
  if (c.includes('hood') || c.includes('sweat')) return HOODIE;
  return SHIRT;
}