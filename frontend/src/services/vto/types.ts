/**
 * MIRAI — Live Virtual Try-On (VTO) Provider Architecture
 *
 * Pluggable streaming and rendering interface decoupling the Live VTO engine
 * from the MIRAI Smart Mirror UI.
 *
 * Supports:
 *   1. DecartVTOProvider   — Temporary Cloud Neural Prototype (Decart Lucy V-TON via WebRTC)
 *   2. MiraiVTOProvider    — Self-Hosted Engine (Kinematic Volumetric Garment Engine / KVGE)
 */

export type VTOProviderType = 'decart' | 'mirai_kvge';

export type VTOConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface VTOQualityReport {
  latencyMs?: number;
  fps?: number;
  packetLossPercent?: number;
  quality?: 'excellent' | 'good' | 'poor';
}

export interface GarmentReference {
  productId: string;
  name: string;
  category: string;
  /**
   * Reference garment image URL or data URI.
   * Sent to the neural video model to guide cloth synthesis.
   */
  referenceImageUrl: string;
  /**
   * Detailed conditioning prompt for the neural VTO model.
   * E.g. "Relaxed Camp-Collar Linen Shirt, natural flax, front buttons, short sleeves, camp collar"
   */
  vtonPrompt: string;
  /**
   * Whether this product has a tested, verified garment reference ready for Live VTO.
   * If false, Live VTO is disallowed to prevent displaying incorrect garments.
   */
  isLiveVTOReady: boolean;
}

export type VTOEventMap = {
  stream: MediaStream;
  stateChange: VTOConnectionState;
  error: Error;
  quality: VTOQualityReport;
};

export interface IVTOProvider {
  readonly id: VTOProviderType | string;
  readonly name: string;
  readonly modelName: string;
  readonly isTemporaryPrototype: boolean;
  readonly renderMode: 'stream' | 'canvas';
  readonly description: string;

  /**
   * Connects the local webcam stream to the VTO session.
   * For streaming neural providers (Decart), establishes WebRTC connection.
   * For self-hosted providers (KVGE), initializes edge tracking and mesh pipeline.
   * @param cameraStream The customer's local webcam MediaStream
   * @param initialGarment The starting garment reference to apply
   */
  connect(cameraStream: MediaStream, initialGarment?: GarmentReference): Promise<void>;

  /**
   * Dynamically updates the active garment during an ongoing live session.
   * Does NOT tear down the connection.
   */
  setGarment(garment: GarmentReference): Promise<void>;

  /**
   * Returns the transformed remote video stream received from the neural model.
   * Null if renderMode is 'canvas' (e.g. self-hosted KVGE).
   */
  getRemoteStream(): MediaStream | null;

  /**
   * Returns current connection state.
   */
  getConnectionState(): VTOConnectionState;

  /**
   * Closes the session and releases resources.
   */
  disconnect(): void;

  on<K extends keyof VTOEventMap>(event: K, listener: (data: VTOEventMap[K]) => void): void;
  off<K extends keyof VTOEventMap>(event: K, listener: (data: VTOEventMap[K]) => void): void;
}

/**
 * Backward compatibility alias for existing consumers.
 */
export type ILiveVTOProvider = IVTOProvider;