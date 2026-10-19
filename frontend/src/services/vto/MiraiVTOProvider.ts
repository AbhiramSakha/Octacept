/**
 * MIRAI — MiraiVTOProvider
 *
 * Self-Hosted Kinematic Volumetric Garment Engine (KVGE) Provider.
 * Serves as the primary self-hosted VTO architecture for MIRAI.
 * Renders via local 2D Canvas using deformable 32-triangle fabric mesh,
 * cylindrical lighting, flexion creasing, and throat/arm occlusion.
 */

import type {
  IVTOProvider,
  GarmentReference,
  VTOConnectionState,
  VTOEventMap,
} from './types';

export class MiraiVTOProvider implements IVTOProvider {
  readonly id = 'mirai_kvge';
  readonly name = 'Mirai KVGE (Self-Hosted)';
  readonly modelName = 'kvge-deformable-mesh-v1';
  readonly isTemporaryPrototype = false;
  readonly renderMode = 'canvas' as const;
  readonly description = 'Kinematic Volumetric Garment Engine (Edge GPU/WASM)';

  private state: VTOConnectionState = 'idle';
  private activeGarment: GarmentReference | null = null;
  private cameraStream: MediaStream | null = null;

  private listeners: Map<keyof VTOEventMap, Set<(data: any) => void>> = new Map();

  getConnectionState(): VTOConnectionState {
    return this.state;
  }

  getRemoteStream(): MediaStream | null {
    // KVGE renders directly to the 2D Canvas viewport overlay
    return null;
  }

  getActiveGarment(): GarmentReference | null {
    return this.activeGarment;
  }

  getCameraStream(): MediaStream | null {
    return this.cameraStream;
  }

  async connect(cameraStream: MediaStream, initialGarment?: GarmentReference): Promise<void> {
    this.cameraStream = cameraStream;
    this.setState('connecting');

    if (initialGarment) {
      this.activeGarment = initialGarment;
    }

    // KVGE runs locally via browser MediaPipe WASM/GPU
    this.setState('connected');
    console.log('[MIRAI] Mirai KVGE Self-Hosted Engine connected.');
  }

  async setGarment(garment: GarmentReference): Promise<void> {
    this.activeGarment = garment;
    console.log(`[MIRAI] Mirai KVGE garment set: "${garment.name}"`);
  }

  disconnect(): void {
    this.cameraStream = null;
    this.activeGarment = null;
    this.setState('disconnected');
    console.log('[MIRAI] Mirai KVGE Engine disconnected.');
  }

  on<K extends keyof VTOEventMap>(event: K, listener: (data: VTOEventMap[K]) => void): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
  }

  off<K extends keyof VTOEventMap>(event: K, listener: (data: VTOEventMap[K]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit<K extends keyof VTOEventMap>(event: K, data: VTOEventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const fn of set) {
        try {
          fn(data);
        } catch (err) {
          console.error(`[MIRAI] Event listener error for "${event}":`, err);
        }
      }
    }
  }

  private setState(newState: VTOConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('stateChange', newState);
    }
  }
}