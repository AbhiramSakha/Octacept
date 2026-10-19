/**
 * MIRAI — GarmentRenderer3D
 *
 * Real 3D garment renderer (Three.js) driven by MediaPipe pose landmarks.
 *
 *   - A private WebGL renderer draws into an OFFSCREEN canvas with an orthographic camera whose
 *     units are screen pixels. The result is composited onto the shared AR canvas with drawImage,
 *     so the existing <canvas> (and the skeleton HUD) keep working with no context conflicts.
 *   - Procedural garment (no asset needed): lofted torso tube + two sleeve tubes + collar ring,
 *     rebuilt every frame from shoulders / elbows / hips. Landmark z gives real body yaw.
 *   - Optional: if product.asset_3d_model (.glb / .gltf) is set, that model is loaded and fitted
 *     rigidly to the shoulders. If loading fails we fall back to the procedural shirt.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { IARGarmentRenderer } from './garmentRenderer';
import type { TrackingFrame } from '../types/tracking';
import type { Product } from '../types/api';

const EMA_ALPHA = 0.35;
const FADE_DURATION_MS = 600;
const FADE_IN_STEP = 0.14;
const Z_DAMP = 0.6;       // MediaPipe z is noisy → damp it
const MAX_YAW_RATIO = 0.9; // |dz| ≤ 0.9·|dxy| ≈ max ~42° body turn

const L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_HIP = 23, R_HIP = 24, NOSE = 0;

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],

  [0, 11], [0, 12],
];

// Torso profile: [t along shoulders→hem, width factor, depth factor, lift above shoulders (× torso len)]
const TORSO_PROFILE: [number, number, number, number][] = [
  [-0.14, 0.24, 0.55, 0.06],  // neck opening
  [-0.09, 0.50, 0.70, 0.045], // shoulder slope
  [-0.03, 0.84, 0.88, 0.015], // shoulder top
  [0.00, 1.04, 1.00, 0],      // shoulder line
  [0.18, 1.06, 1.02, 0],      // chest
  [0.42, 1.00, 1.00, 0],      // waist
  [0.70, 1.06, 1.04, 0],      // lower
  [1.00, 1.12, 1.06, 0],      // hip line
  [1.12, 1.14, 1.07, 0],      // hem
];
const TORSO_SEGMENTS = 28;

const SLEEVE_RINGS = 7;
const SLEEVE_SEGMENTS = 18;

interface V3 { x: number; y: number; z: number }
interface Sm extends V3 { vis: number }

const v = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
const sub = (a: V3, b: V3): V3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a: V3, b: V3): V3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const mul = (a: V3, s: number): V3 => v(a.x * s, a.y * s, a.z * s);
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return v(a.x / l, a.y / l, a.z / l);
};

const cross = (a: V3, b: V3): V3 =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const lerp3 = (a: V3, b: V3, t: number): V3 => add(mul(a, 1 - t), mul(b, t));
/** Limit the depth component of a left→right body vector so noisy z can't blow up the width. */
const clampYaw = (a: V3): V3 => {
  const lim = MAX_YAW_RATIO * Math.hypot(a.x, a.y);
  return v(a.x, a.y, Math.max(-lim, Math.min(lim, a.z)));
};

export class GarmentRenderer3D implements IARGarmentRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  private gl: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(0, 1, 0, 1, -4000, 4000);
  private garmentGroup = new THREE.Group();

  // procedural meshes
  private torso: THREE.Mesh | null = null;
  private sleeves: THREE.Mesh[] = [];
  private collar: THREE.Mesh | null = null;
  private material: THREE.MeshStandardMaterial;
  private collarMaterial: THREE.MeshStandardMaterial;

  // optional .glb
  private glbRoot: THREE.Object3D | null = null;
  private glbBox = new THREE.Box3();
  private glbSize = new THREE.Vector3(1, 1, 1);

  private currentProduct: Product | null = null;
  private loadToken = 0;

  private showSkeleton = false;

  private smoothed = new Map<number, Sm>();
  private opacity = 0;
  private lastTrackedAt = 0;
  private glW = 0;
  private glH = 0;

  constructor() {
    this.material = new THREE.MeshStandardMaterial({
      color: 0xd9c9a8,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
    });
    this.collarMaterial = this.material.clone();

    this.scene.add(this.garmentGroup);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-400, -700, 900); // y-down scene: negative y = above
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd7ff, 0.5);
    rim.position.set(600, -200, -400);
    this.scene.add(rim);
  }

  // ── IGarmentRenderer ──────────────────────────────────────────────────

  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('GarmentRenderer3D: could not get 2D context');
    this.ctx = ctx;

    const glCanvas = document.createElement('canvas');
    this.gl = new THREE.WebGLRenderer({
      canvas: glCanvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    this.gl.setPixelRatio(1);
    this.gl.setClearColor(0x000000, 0);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.buildProceduralGarment();
  }

  setShowSkeleton(show: boolean): void {
    this.showSkeleton = show;
  }

  async loadProduct(product: Product): Promise<void> {
    const token = ++this.loadToken;
    this.currentProduct = product;
    this.opacity = 0;
    this.removeGlb();

    // Fabric colour from the product's first colour
    const hex = product.colors?.[0]?.hex;
    if (hex) {
      this.material.color.set(hex);
      this.collarMaterial.color.set(hex).offsetHSL(0, 0, 0.04);

    }
    this.material.map = this.collarMaterial.map = makeWeaveTexture();
    this.material.needsUpdate = this.collarMaterial.needsUpdate = true;

    const url = product.asset_3d_model;
    if (!url) {
      this.setProceduralVisible(true);
      return;
    }

    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      if (token !== this.loadToken) return;
      const root = gltf.scene;
      this.glbBox.setFromObject(root);
      this.glbBox.getSize(this.glbSize);
      // centre horizontally on origin, top (max y) at shoulder line
      const c = this.glbBox.getCenter(new THREE.Vector3());
      root.position.set(-c.x, -this.glbBox.max.y, -c.z);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material) {
          (m.material as THREE.Material).side = THREE.DoubleSide;
        }
      });
      const wrapper = new THREE.Group();
      wrapper.add(root);
      this.glbRoot = wrapper;
      this.garmentGroup.add(wrapper);
      this.setProceduralVisible(false);
    } catch (err) {
      console.warn('[MIRAI][3D] .glb failed, using procedural 3D shirt:', url, err);

      this.setProceduralVisible(true);
    }
  }

  unloadGarment(): void {
    this.loadToken++;
    this.currentProduct = null;
    this.removeGlb();
    this.clear();
  }

  clear(): void {
    if (this.canvas && this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.opacity = 0;
    this.smoothed.clear();
    this.lastTrackedAt = 0;
  }

  dispose(): void {
    this.clear();
    this.removeGlb();
    for (const m of [this.torso, ...this.sleeves, this.collar]) {
      m?.geometry.dispose();
    }
    this.material.map?.dispose();
    this.material.dispose();
    this.collarMaterial.dispose();
    this.gl?.dispose();
    this.gl = null;
  }


  renderFrame(
    tracking: TrackingFrame,
    selectedGarment?: Product,
    _videoElement?: HTMLVideoElement,
    _maskCanvas?: HTMLCanvasElement | OffscreenCanvas
  ): void {
    if (!this.canvas || !this.ctx || !this.gl) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.ctx.clearRect(0, 0, W, H);
    if (W < 2 || H < 2) return;

    const isTracked = tracking.tracking_state === 'tracked' && tracking.landmarks.length > 0;
    if (isTracked) {
      this.lastTrackedAt = Date.now();
      this.opacity = Math.min(1, this.opacity + FADE_IN_STEP);
    } else {
      const elapsed = Date.now() - this.lastTrackedAt;
      this.opacity = 1 - Math.min(1, elapsed / FADE_DURATION_MS);
    }
    if (this.opacity < 0.01 && !this.showSkeleton) return;

    if (tracking.landmarks.length > 0) this.applyEMA(tracking.landmarks);

    // ── screen mapping (same cover + mirror transform as the 2D renderer) ──
    const vW = tracking.frame_width || 1280;
    const vH = tracking.frame_height || 720;
    const scale = vW / vH > W / H ? H / vH : W / vW;
    const offX = (W - vW * scale) / 2;
    const offY = (H - vH * scale) / 2;
    const zScale = vW * scale;


    const pt = (id: number): Sm | null => {
      const p = this.smoothed.get(id);
      if (!p) return null;
      return {
        x: offX + (1 - p.x) * vW * scale,
        y: offY + p.y * vH * scale,
        z: -p.z * zScale * Z_DAMP, // MediaPipe: smaller z = closer. Scene: bigger z = closer to camera.
        vis: p.vis,
      };
    };

    const garment = selectedGarment ?? this.currentProduct;
    if (garment && this.opacity >= 0.01) {
      this.syncSize(W, H);
      const ok = this.poseGarment(pt);
      if (ok) {
        this.material.opacity = this.collarMaterial.opacity = this.opacity;
        this.gl.render(this.scene, this.camera);
        this.ctx.drawImage(this.gl.domElement, 0, 0, W, H);
      }
    }

    if (this.showSkeleton && isTracked) this.drawSkeleton(pt);
  }

  // ── Garment posing ────────────────────────────────────────────────────

  private poseGarment(pt: (id: number) => Sm | null): boolean {
    const ls = pt(L_SH), rs = pt(R_SH);
    if (!ls || !rs || ls.vis < 0.3 || rs.vis < 0.3) return false;


    // Hips are often out of frame on a webcam → estimate from shoulders if needed.
    const shMid = lerp3(ls, rs, 0.5);
    const shVec = clampYaw(sub(rs, ls));
    const shW = len(shVec);
    if (shW < 8) return false;

    const lh = pt(L_HIP), rh = pt(R_HIP);
    let hipMid: V3, hipVec: V3;
    if (lh && rh && lh.vis > 0.3 && rh.vis > 0.3) {
      hipMid = lerp3(lh, rh, 0.5);
      hipVec = clampYaw(sub(rh, lh));
    } else {
      const down = norm(v(-shVec.y, shVec.x, 0)); // perpendicular to shoulder line
      const sign = down.y < 0 ? -1 : 1;
      hipMid = add(shMid, mul(down, sign * shW * 1.35));
      hipVec = mul(shVec, 0.82);
    }

    if (this.glbRoot) {
      this.poseGlb(shMid, shVec, shW);
      return true;
    }
    if (!this.torso) return false;

    const torsoVec = sub(hipMid, shMid);
    const torsoLen = len(torsoVec);
    const yAxis = norm(torsoVec);

    this.fillTorso(shMid, shVec, hipMid, hipVec, yAxis, torsoLen, shW);
    this.fillSleeve(0, ls, pt(L_EL), -1, shW, yAxis);
    this.fillSleeve(1, rs, pt(R_EL), +1, shW, yAxis);
    this.placeCollar(shMid, shVec, yAxis, torsoLen, shW, pt(NOSE));

    return true;
  }

  private fillTorso(
    shMid: V3, shVec: V3, hipMid: V3, hipVec: V3, yAxis: V3, torsoLen: number, shW: number
  ): void {
    const pos = this.torso!.geometry.getAttribute('position') as THREE.BufferAttribute;
    let n = 0;
    for (const [t, wf, df, lift] of TORSO_PROFILE) {
      const center = lerp3(shMid, hipMid, t);
      const c = add(center, mul(yAxis, -lift * torsoLen));
      const xv = norm(lerp3(shVec, hipVec, Math.min(1, Math.max(0, t))));
      const zv = norm(cross(xv, yAxis));
      const halfW = (shW / 2) * wf;
      const halfD = (shW / 2) * 0.62 * df;
      for (let s = 0; s <= TORSO_SEGMENTS; s++) {
        const a = (s / TORSO_SEGMENTS) * Math.PI * 2;
        const cx = Math.cos(a) * halfW;
        const cz = Math.sin(a) * halfD;
        pos.setXYZ(
          n++,
          c.x + xv.x * cx + zv.x * cz,
          c.y + xv.y * cx + zv.y * cz,
          c.z + xv.z * cx + zv.z * cz
        );
      }
    }
    pos.needsUpdate = true;
    this.torso!.geometry.computeVertexNormals();
  }

  private fillSleeve(

    idx: number, shoulder: Sm, elbow: Sm | null, side: number, shW: number, yAxis: V3
  ): void {
    const mesh = this.sleeves[idx];
    if (!mesh) return;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;

    // Fallback: arm hangs down if elbow isn't visible
    const el: V3 =
      elbow && elbow.vis > 0.3 ? elbow : add(shoulder, mul(yAxis, shW * 0.7));
    const arm = sub(el, shoulder);
    const armLen = len(arm);
    const dir = norm(arm);
    // Short camp-collar sleeve: ~55% of the upper arm, starting slightly inside the torso.
    const start = add(shoulder, mul(dir, -shW * 0.06));
    const end = add(shoulder, mul(arm, 0.55));
    const ref = Math.abs(dir.z) > 0.9 ? v(1, 0, 0) : v(0, 0, 1);
    const b1 = norm(cross(dir, ref));
    const b2 = norm(cross(dir, b1));
    const r0 = shW * 0.19;
    const r1 = Math.max(shW * 0.145, Math.min(r0, armLen * 0.22));

    let n = 0;
    for (let i = 0; i <= SLEEVE_RINGS; i++) {
      const t = i / SLEEVE_RINGS;
      const c = lerp3(start, end, t);
      const r = r0 + (r1 - r0) * t;
      for (let s = 0; s <= SLEEVE_SEGMENTS; s++) {
        const a = (s / SLEEVE_SEGMENTS) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        pos.setXYZ(
          n++,

          c.x + b1.x * x + b2.x * y,
          c.y + b1.y * x + b2.y * y,
          c.z + b1.z * x + b2.z * y
        );
      }
    }
    void side;
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  private placeCollar(
    shMid: V3, shVec: V3, yAxis: V3, torsoLen: number, shW: number, nose: Sm | null
  ): void {
    if (!this.collar) return;
    const xv = norm(shVec);
    const zv = norm(cross(xv, yAxis));
    const up = mul(yAxis, -1);
    const centre = add(shMid, mul(yAxis, -0.1 * torsoLen));
    void nose;
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(xv.x, xv.y, xv.z),
      new THREE.Vector3(zv.x, zv.y, zv.z),
      new THREE.Vector3(up.x, up.y, up.z) // torus axis (local Z) points along the neck
    );
    this.collar.matrixAutoUpdate = false;
    const s = shW * 0.26;
    m.scale(new THREE.Vector3(s, s * 0.75, s));
    m.setPosition(centre.x, centre.y, centre.z);
    this.collar.matrix.copy(m);
    this.collar.matrixWorldNeedsUpdate = true;
  }


  private poseGlb(shMid: V3, shVec: V3, shW: number): void {
    const g = this.glbRoot!;
    // Fit model width to ~1.25× shoulder span. Scene is y-down, glb is y-up → flip y.
    const s = (shW * 1.25) / Math.max(1e-4, this.glbSize.x);
    g.scale.set(s, -s, s);
    const roll = Math.atan2(shVec.y, shVec.x);
    const yaw = Math.atan2(-shVec.z, Math.abs(shVec.x) || 1);
    g.rotation.set(0, yaw, roll, 'YXZ');
    g.position.set(shMid.x, shMid.y - shW * 0.05, shMid.z);
  }

  // ── Procedural geometry ───────────────────────────────────────────────

  private buildProceduralGarment(): void {
    const rings = TORSO_PROFILE.length;
    const cols = TORSO_SEGMENTS + 1;
    this.torso = new THREE.Mesh(ringGeometry(rings, cols), this.material);
    this.torso.frustumCulled = false;
    this.garmentGroup.add(this.torso);

    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(
        ringGeometry(SLEEVE_RINGS + 1, SLEEVE_SEGMENTS + 1),
        this.material
      );
      m.frustumCulled = false;
      this.sleeves.push(m);
      this.garmentGroup.add(m);
    }

    this.collar = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 10, 28), this.collarMaterial);

    this.collar.rotation.order = 'XYZ';
    this.collar.frustumCulled = false;
    this.garmentGroup.add(this.collar);
  }

  private setProceduralVisible(on: boolean): void {
    if (this.torso) this.torso.visible = on;
    if (this.collar) this.collar.visible = on;
    this.sleeves.forEach((s) => (s.visible = on));
  }

  private removeGlb(): void {
    if (this.glbRoot) {
      this.garmentGroup.remove(this.glbRoot);
      this.glbRoot.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry?.dispose();
      });
      this.glbRoot = null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private syncSize(W: number, H: number): void {
    if (!this.gl) return;
    if (W !== this.glW || H !== this.glH) {
      this.glW = W;
      this.glH = H;
      this.gl.setSize(W, H, false);
      // y-down pixel space: top = 0, bottom = H
      this.camera.left = 0;

      this.camera.right = W;
      this.camera.top = 0;
      this.camera.bottom = H;
      this.camera.position.set(0, 0, 2000);
      this.camera.updateProjectionMatrix();
    }
  }

  private applyEMA(landmarks: TrackingFrame['landmarks']): void {
    for (const lm of landmarks) {
      const prev = this.smoothed.get(lm.id);
      if (!prev) {
        this.smoothed.set(lm.id, { x: lm.x, y: lm.y, z: lm.z, vis: lm.visibility });
      } else {
        this.smoothed.set(lm.id, {
          x: EMA_ALPHA * lm.x + (1 - EMA_ALPHA) * prev.x,
          y: EMA_ALPHA * lm.y + (1 - EMA_ALPHA) * prev.y,
          z: EMA_ALPHA * lm.z + (1 - EMA_ALPHA) * prev.z,
          vis: lm.visibility,
        });
      }
    }
  }

  private drawSkeleton(pt: (id: number) => Sm | null): void {
    const ctx = this.ctx!;
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
    for (const [a, b] of POSE_CONNECTIONS) {
      const p1 = pt(a), p2 = pt(b);
      if (!p1 || !p2 || p1.vis < 0.3 || p2.vis < 0.3) continue;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let id = 0; id <= 32; id++) {
      const p = pt(id);
      if (!p || p.vis < 0.3) continue;
      const anchor = id === 11 || id === 12 || id === 13 || id === 14 || id === 23 || id === 24;
      ctx.beginPath();
      ctx.arc(p.x, p.y, anchor ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = anchor ? '#a855f7' : '#22d3ee';
      ctx.fill();
    }
    ctx.restore();
  }
}

// ── Module helpers ──────────────────────────────────────────────────────────

/** Grid of `rings` × `cols` vertices with quad indices + UVs; positions are filled every frame. */
function ringGeometry(rings: number, cols: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const count = rings * cols;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const uv = new Float32Array(count * 2);
  for (let r = 0; r < rings; r++) {
    for (let c = 0; c < cols; c++) {
      uv[(r * cols + c) * 2] = (c / (cols - 1)) * 3;
      uv[(r * cols + c) * 2 + 1] = (r / (rings - 1)) * 2;
    }
  }

  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx: number[] = [];
  for (let r = 0; r < rings - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  g.setIndex(idx);
  return g;
}

/** Small tiling linen-weave texture (greyscale, multiplied with the product colour). */
function makeWeaveTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i += 2) {
    x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.07})`;
    x.fillRect(i, 0, 1, size);
    x.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`;
    x.fillRect(0, i, size, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);

  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}