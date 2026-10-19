/**
 * Garment Renderer interface for AR overlay.
 * Phase 0 Foundation Scaffolding.
 */
import { TrackingFrame } from '../types/tracking';
import { Product } from '../types/api';

export interface GarmentRenderAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface IGarmentRenderer {
  initialize(canvas: HTMLCanvasElement): void;
  renderFrame(
    tracking: TrackingFrame,
    selectedGarment?: Product,
    videoElement?: HTMLVideoElement,
    maskCanvas?: HTMLCanvasElement | OffscreenCanvas
  ): void;
  clear(): void;
  dispose(): void;
}

/** Renderer surface used by useLiveAR — implemented by both GarmentRenderer2D and GarmentRenderer3D. */
export interface IARGarmentRenderer extends IGarmentRenderer {
  setShowSkeleton(show: boolean): void;
  loadProduct(product: Product): Promise<void>;
  unloadGarment(): void;
}

export type RenderMode = '2d' | '3d';