/**
 * MIRAI — DecartLucyVTOProvider
 *
 * Official Live Virtual Try-On Provider powered by Decart Lucy V-TON (`@decartai/sdk`).
 *
 * Architecture:
 *   Local Camera MediaStream
 *         │
 *         ▼
 *   Decart SDK (WebRTC via livekit-client)
 *         │
 *         ▼ (Sub-60ms GPU Neural World Model: lucy-vton-3.5)
 *   Remote Transformed MediaStream
 *         │
 *         ▼
 *   Mirror Viewport HTMLVideoElement
 */

import { createDecartClient, models } from '@decartai/sdk';
import type { RealTimeClient } from '@decartai/sdk';
import type {
  IVTOProvider,
  GarmentReference,
  VTOConnectionState,
  VTOQualityReport,
  VTOEventMap,
} from './types';

export interface DecartProviderOptions {
  apiKey?: string;
  proxy?: string;
  speed?: 'fast';
}

export class DecartLucyVTOProvider implements IVTOProvider {
  readonly id = 'decart';
  readonly name = 'Decart Lucy V-TON';
  readonly modelName = 'lucy-vton-3.5';
  readonly isTemporaryPrototype = true;
  readonly renderMode = 'stream' as const;
  readonly description = 'Temporary external VTO inference provider for prototype validation';

  private apiKey: string | null = null;
  private proxy: string | null = null;
  private speed: 'fast' = 'fast';

  private realtimeClient: RealTimeClient | null = null;
  private remoteStream: MediaStream | null = null;
  private state: VTOConnectionState = 'idle';
  private activeGarment: GarmentReference | null = null;

  // Event dispatcher
  private listeners: Map<keyof VTOEventMap, Set<(data: any) => void>> = new Map();

  constructor(options?: DecartProviderOptions) {
    this.apiKey =
      options?.apiKey ??
      (import.meta.env.VITE_DECART_API_KEY as string | undefined) ??
      null;
    this.proxy = options?.proxy ?? null;
    if (options?.speed) this.speed = options.speed;
  }

  setCredentials(credentials: { apiKey?: string; proxy?: string }): void {
    if (credentials.apiKey) this.apiKey = credentials.apiKey;
    if (credentials.proxy) this.proxy = credentials.proxy;
  }

  hasCredentials(): boolean {
    return Boolean(this.apiKey || this.proxy);
  }

  getConnectionState(): VTOConnectionState {
    return this.state;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  async connect(cameraStream: MediaStream, initialGarment?: GarmentReference): Promise<void> {
    // If no credentials configured yet, attempt local backend credentials lookup
    if (!this.apiKey && !this.proxy) {
      try {
        const res = await fetch('http://localhost:8000/api/v1/vto/credentials');
        if (res.ok) {
          const creds = await res.json();
          if (creds?.api_key) {
            this.apiKey = creds.api_key;
            console.log('[MIRAI] Decart credentials loaded from local backend environment.');
          }
        }
      } catch {
        // Backend not running or unreachable
      }
    }

    if (!this.apiKey && !this.proxy) {
      this.setState('error');
      const err = new Error(
        'DECART_API_KEY_REQUIRED: Please configure a Decart API key to start Live Lucy V-TON prototype.'
      );
      this.emit('error', err);
      throw err;
    }

    if (initialGarment) {
      this.activeGarment = initialGarment;
    }

    try {
      this.setState('connecting');

      // Initialize official Decart Client
      const client = this.proxy
        ? createDecartClient({ proxy: this.proxy })
        : createDecartClient({ apiKey: this.apiKey! });

      const model = models.realtime(this.modelName);

      // Resolve full URL for garment reference image if relative
      let initialImageUrl: string | undefined;
      if (this.activeGarment?.referenceImageUrl) {
        initialImageUrl = this.activeGarment.referenceImageUrl.startsWith('/')
          ? `${window.location.origin}${this.activeGarment.referenceImageUrl}`
          : this.activeGarment.referenceImageUrl;
      }

      console.log(`[MIRAI] Connecting to Decart Lucy V-TON (${this.modelName})...`);

      const realtimeClient = await client.realtime.connect(cameraStream, {
        model,
        speed: this.speed,
        mirror: false, // Mirrored via CSS on HTMLVideoElement (scaleX(-1))
        onRemoteStream: (stream: MediaStream) => {
          console.log('[MIRAI] Decart Lucy V-TON remote stream received!', stream);
          this.remoteStream = stream;
          this.setState('connected');
          this.emit('stream', stream);
        },
        initialState: this.activeGarment
          ? {
              prompt: {
                text: this.activeGarment.vtonPrompt,
                enhance: true,
              },
              image: initialImageUrl,
            }
          : undefined,
      });

      this.realtimeClient = realtimeClient;

      // Attach SDK WebRTC event listeners
      realtimeClient.on('connectionChange', (connState) => {
        console.log('[MIRAI] Decart connection change:', connState);
        if (connState === 'connected') {
          this.setState('connected');
        } else if (connState === 'connecting' || connState === 'reconnecting') {
          this.setState(connState);
        } else if (connState === 'disconnected') {
          this.setState('disconnected');
        }
      });

      realtimeClient.on('connectionQuality', (report) => {
        const qualityReport: VTOQualityReport = {
          quality: report.quality as 'excellent' | 'good' | 'poor',
        };
        this.emit('quality', qualityReport);
      });

      realtimeClient.on('error', (err) => {
        console.error('[MIRAI] Decart realtime error:', err);
        this.setState('error');
        this.emit('error', new Error(err.message || String(err)));
      });

      realtimeClient.on('sessionEnded', (reason) => {
        console.warn('[MIRAI] Decart session ended:', reason);
        this.setState('disconnected');
      });
    } catch (error) {
      console.error('[MIRAI] Decart connect failed:', error);
      this.setState('error');
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
      throw err;
    }
  }

  async setGarment(garment: GarmentReference): Promise<void> {
    this.activeGarment = garment;

    if (!garment.isLiveVTOReady) {
      console.warn(
        `[MIRAI] Product "${garment.name}" has no verified live VTO asset yet. Refusing fallback.`
      );
      return;
    }

    if (!this.realtimeClient || this.state !== 'connected') {
      console.log('[MIRAI] Lucy V-TON not connected. Stored garment for next connection.');
      return;
    }

    try {
      let imageUrl: string | undefined;
      if (garment.referenceImageUrl) {
        imageUrl = garment.referenceImageUrl.startsWith('/')
          ? `${window.location.origin}${garment.referenceImageUrl}`
          : garment.referenceImageUrl;
      }

      console.log(`[MIRAI] Updating Lucy V-TON garment: "${garment.name}"...`);

      // Update garment reference on the active session without tearing down WebRTC
      await this.realtimeClient.set({
        prompt: garment.vtonPrompt,
        enhance: true,
        image: imageUrl,
      });

      console.log(`[MIRAI] Lucy V-TON garment applied: "${garment.name}"`);
    } catch (err) {
      console.error('[MIRAI] Failed to update Lucy V-TON garment:', err);
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  disconnect(): void {
    if (this.realtimeClient) {
      try {
        this.realtimeClient.disconnect();
      } catch (err) {
        console.warn('[MIRAI] Error during Decart disconnect:', err);
      }
      this.realtimeClient = null;
    }
    this.remoteStream = null;
    this.setState('disconnected');
  }

  // ── Event Emitter ────────────────────────────────────────────────────

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

export { DecartLucyVTOProvider as DecartVTOProvider };