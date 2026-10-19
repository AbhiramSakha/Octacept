/**
 * MIRAI — useLiveAR
 *
 * The main Live AR orchestration hook.
 *
 * Responsibilities:
 *   • Initialize MediaPipe Pose Landmarker (WASM, runs in browser, SELF-HOSTED)
 *   • Run pose detection only when the webcam delivers a new frame
 *   • Drive GarmentRenderer3D (Three.js) or GarmentRenderer2D (mesh warp) to draw garment anchored to body
 *   • Optionally render real-time skeleton overlay
 *   • Sync canvas dimensions to video element each frame
 *   • Throttle React state updates (fps, trackingState) to ~8/s
 *   • Handle tracking loss / fade
 *
 * UPDATE (3D renderer):
 *   - New `renderMode` parameter ('3d' default | '2d'). The renderer is re-created when it changes
 *     and the selected product is reloaded into the new renderer.
 *
 * UPDATE (KVGE v2):
 *   1. MediaPipe WASM + model are served from /public/mediapipe (no CDN, works offline).
 *   2. outputSegmentationMasks is OFF (the mask was never used and cost a lot of FPS).
 *   3. Pose detection is skipped when the video has no new frame (video.currentTime check).
 *   4. Previous fixes kept: shoulder-based tracking confidence, GPU→CPU fallback,
 *      garment load status + retry, throttled error logging, 2s diagnostics.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Product } from '../types/api';
import type { TrackingFrame } from '../types/tracking';
import { GarmentRenderer2D } from '../rendering/GarmentRenderer2D';
import { GarmentRenderer3D } from '../rendering/GarmentRenderer3D';

import type { IARGarmentRenderer, RenderMode } from '../rendering/garmentRenderer';

// ── Self-hosted MediaPipe assets (see KVGE_PATCH.md for the copy commands) ───
// Local files are tried first; the CDN is only a safety net if they are missing.
const WASM_SOURCES = [
  '/mediapipe/wasm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
];
const MODEL_SOURCES = [
  '/mediapipe/pose_landmarker_lite.task',
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
];

// UI state update throttle — React re-renders max this often
const UI_UPDATE_INTERVAL_MS = 120;

// Console diagnostics (set to false to silence the periodic status line)
const DEBUG = true;
const DEBUG_INTERVAL_MS = 2000;

// Tracking confidence thresholds
const PRESENCE_THRESHOLD = 0.5;
const TRACKING_THRESHOLD = 0.5;
const DETECTION_THRESHOLD = 0.5;

// Landmarks used to decide whether a person is "tracked".
// Shoulders only: hips are often out of frame on a webcam.
const SHOULDER_IDS = [11, 12];

// ── Types ────────────────────────────────────────────────────────────────────

export type ARTrackingState =

  | 'initializing'
  | 'ready'
  | 'searching'
  | 'tracked'
  | 'lost'
  | 'error';

export type GarmentStatus = 'none' | 'loading' | 'loaded' | 'error';

export interface LiveARState {
  trackingState: ARTrackingState;
  fps: number;
  confidence: number;
  isLoading: boolean;
  loadError: string | null;
  /** true once PoseLandmarker is initialized and ready */
  isReady: boolean;
  /** state of the currently selected garment asset */
  garmentStatus: GarmentStatus;
}

// ── MediaPipe landmark name lookup ──────────────────────────────────────────
const LANDMARK_NAMES: Record<number, string> = {
  0: 'nose',
  1: 'left_eye_inner',
  2: 'left_eye',
  3: 'left_eye_outer',
  4: 'right_eye_inner',
  5: 'right_eye',
  6: 'right_eye_outer',
  7: 'left_ear',
  8: 'right_ear',

  9: 'mouth_left',
  10: 'mouth_right',
  11: 'left_shoulder',
  12: 'right_shoulder',
  13: 'left_elbow',
  14: 'right_elbow',
  15: 'left_wrist',
  16: 'right_wrist',
  17: 'left_pinky',
  18: 'right_pinky',
  19: 'left_index',
  20: 'right_index',
  21: 'left_thumb',
  22: 'right_thumb',
  23: 'left_hip',
  24: 'right_hip',
  25: 'left_knee',
  26: 'right_knee',
  27: 'left_ankle',
  28: 'right_ankle',
  29: 'left_heel',
  30: 'right_heel',
  31: 'left_foot_index',
  32: 'right_foot_index',
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLiveAR(
  videoRef: RefObject<HTMLVideoElement>,
  arCanvasRef: RefObject<HTMLCanvasElement>,
  selectedProduct: Product | null,

  isARActive: boolean,
  showSkeleton: boolean = true,
  renderMode: RenderMode = '3d'
): LiveARState {
  const [state, setState] = useState<LiveARState>({
    trackingState: 'initializing',
    fps: 0,
    confidence: 0,
    isLoading: true,
    loadError: null,
    isReady: false,
    garmentStatus: 'none',
  });

  // ── Imperative refs (never trigger re-renders) ───────────────────────
  const rendererRef = useRef<IARGarmentRenderer | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const landmarkerRef = useRef<any>(null); // PoseLandmarker (dynamic import)
  const rafRef = useRef<number>(0);
  const runningRef = useRef(false);

  // fps accounting
  const frameTimesRef = useRef<number[]>([]);
  const lastUIUpdateRef = useRef(0);
  const lastTrackedAtRef = useRef(0);

  // only process NEW webcam frames
  const lastVideoTimeRef = useRef(-1);

  // diagnostics
  const lastErrorLogRef = useRef(0);
  const lastDebugLogRef = useRef(0);

  const garmentStatusRef = useRef<GarmentStatus>('none');

  // Track the last loaded product id to avoid reloading the same product
  const loadedProductIdRef = useRef<string | null>(null);

  const setGarmentStatus = useCallback((status: GarmentStatus) => {
    garmentStatusRef.current = status;
    setState((s) => (s.garmentStatus === status ? s : { ...s, garmentStatus: status }));
  }, []);

  // ── (Re)create the renderer whenever the render mode changes (2D ↔ 3D) ──
  useEffect(() => {
    const renderer: IARGarmentRenderer =
      renderMode === '3d' ? new GarmentRenderer3D() : new GarmentRenderer2D();
    rendererRef.current = renderer;
    renderer.setShowSkeleton(showSkeleton);
    const canvas = arCanvasRef.current;
    if (canvas) renderer.initialize(canvas);
    // force the garment-load effect below to reload the product into the new renderer
    loadedProductIdRef.current = null;
    console.log('[MIRAI][AR] Renderer mode:', renderMode);
    return () => {
      renderer.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderMode]);

  // ── Sync showSkeleton changes to renderer ────────────────────────────
  useEffect(() => {
    rendererRef.current?.setShowSkeleton(showSkeleton);
  }, [showSkeleton, renderMode]);


  // ── Initialize MediaPipe PoseLandmarker ───────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function initMediaPipe() {
      try {
        const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let landmarker: any = null;
        let lastErr: unknown = null;

        for (let i = 0; i < WASM_SOURCES.length && !landmarker; i++) {
          try {
            const vision = await FilesetResolver.forVisionTasks(WASM_SOURCES[i]);
            if (cancelled) return;

            const make = (delegate: 'GPU' | 'CPU') =>
              PoseLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: MODEL_SOURCES[i], delegate },
                runningMode: 'VIDEO',
                numPoses: 1,
                minPoseDetectionConfidence: DETECTION_THRESHOLD,
                minPosePresenceConfidence: PRESENCE_THRESHOLD,
                minTrackingConfidence: TRACKING_THRESHOLD,
                outputSegmentationMasks: false, // unused → big FPS win
              });

            try {
              landmarker = await make('GPU');
              console.log(`[MIRAI][AR] PoseLandmarker ready (GPU) from ${WASM_SOURCES[i]}`);

            } catch (gpuErr) {
              console.warn('[MIRAI][AR] GPU delegate failed, trying CPU:', gpuErr);
              landmarker = await make('CPU');
              console.log(`[MIRAI][AR] PoseLandmarker ready (CPU) from ${WASM_SOURCES[i]}`);
            }
          } catch (srcErr) {
            lastErr = srcErr;
            console.warn(`[MIRAI][AR] MediaPipe source failed: ${WASM_SOURCES[i]}`, srcErr);
          }
        }

        if (!landmarker) throw lastErr ?? new Error('No MediaPipe source available');

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setState((s) => ({
          ...s,
          isLoading: false,
          isReady: true,
          trackingState: 'searching',
        }));
      } catch (err) {
        if (cancelled) return;
        console.error('[MIRAI][AR] MediaPipe init failed:', err);
        setState((s) => ({
          ...s,
          isLoading: false,
          isReady: false,

          loadError:
            'Pose tracking unavailable. Check that /public/mediapipe contains the wasm folder and pose_landmarker_lite.task.',
          trackingState: 'error',
        }));
      }
    }

    initMediaPipe();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load garment when selected product changes ────────────────────────
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (!selectedProduct || !isARActive) {
      renderer.unloadGarment?.();
      loadedProductIdRef.current = null;
      setGarmentStatus('none');
      return;
    }

    if (selectedProduct.id === loadedProductIdRef.current) return;

    const productId = selectedProduct.id;
    loadedProductIdRef.current = productId;
    setGarmentStatus('loading');
    console.log('[MIRAI][AR] Loading garment for product:', productId);


    renderer
      .loadProduct(selectedProduct)
      .then(() => {
        // ignore if the user already picked something else
        if (loadedProductIdRef.current !== productId) return;
        console.log('[MIRAI][AR] Garment loaded:', productId);
        setGarmentStatus('loaded');
      })
      .catch((err) => {
        console.error('[MIRAI][AR] Garment load failed:', productId, err);
        if (loadedProductIdRef.current === productId) {
          loadedProductIdRef.current = null; // allow retry
          setGarmentStatus('error');
        }
      });
  }, [selectedProduct, isARActive, setGarmentStatus, renderMode]);

  // ── Main rAF tracking + render loop ──────────────────────────────────
  const startLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    function tick(timestamp: number) {
      if (!runningRef.current) return;

      const video = videoRef.current;
      const canvas = arCanvasRef.current;
      const landmarker = landmarkerRef.current;
      const renderer = rendererRef.current;

      // Always re-request the next frame first so loop keeps going even on error
      rafRef.current = requestAnimationFrame(tick);


      if (!video || !canvas || !landmarker || !renderer) return;
      if (video.readyState < 2) return; // HAVE_CURRENT_DATA

      // Skip if the webcam has not produced a new frame yet
      if (video.currentTime === lastVideoTimeRef.current) return;
      lastVideoTimeRef.current = video.currentTime;

      // ── Sync canvas size to video element ──────────────────────────
      const rect = video.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        if (
          canvas.width !== Math.round(rect.width) ||
          canvas.height !== Math.round(rect.height)
        ) {
          canvas.width = Math.round(rect.width);
          canvas.height = Math.round(rect.height);
        }
      }

      // ── Pose detection ─────────────────────────────────────────────
      let trackingFrame: TrackingFrame = {
        timestamp,
        frame_id: 0,
        frame_width: video.videoWidth || 1280,
        frame_height: video.videoHeight || 720,
        fps: 0,
        confidence: 0,
        tracking_state: 'searching',
        landmarks: [],
      };


      try {
        const result = landmarker.detectForVideo(video, timestamp);

        if (result.landmarks && result.landmarks.length > 0) {
          const rawLandmarks = result.landmarks[0];

          // Convert MediaPipe NormalizedLandmark[] to our Landmark[] schema
          const landmarks = rawLandmarks.map(
            (lm: { x: number; y: number; z: number; visibility?: number }, i: number) => ({
              id: i,
              name: LANDMARK_NAMES[i] ?? `landmark_${i}`,
              x: lm.x,
              y: lm.y,
              z: lm.z,
              visibility: lm.visibility ?? 1.0,
            })
          );

          // Confidence from SHOULDERS only (hips are often out of frame).
          const shoulderVis = SHOULDER_IDS.map((id) => landmarks[id]?.visibility ?? 0);
          const confidence = shoulderVis.length
            ? shoulderVis.reduce((a: number, b: number) => a + b, 0) / shoulderVis.length
            : 0;

          trackingFrame = {
            ...trackingFrame,
            tracking_state: confidence > TRACKING_THRESHOLD ? 'tracked' : 'searching',
            confidence,
            landmarks,
          };
          lastTrackedAtRef.current = Date.now();
        } else {

          const elapsed = Date.now() - lastTrackedAtRef.current;
          trackingFrame.tracking_state = elapsed > 1500 ? 'lost' : 'searching';
        }

        // ── Render garment / skeleton ────────────────────────────────
        if (isARActive) {
          renderer.renderFrame(trackingFrame, selectedProduct ?? undefined, video);
        } else if (showSkeleton) {
          renderer.renderFrame(trackingFrame, undefined, video);
        } else {
          renderer.clear();
        }
      } catch (err) {
        // Non-fatal: skip this frame, but LOG it (throttled) so problems are visible.
        const now = Date.now();
        if (now - lastErrorLogRef.current > 2000) {
          lastErrorLogRef.current = now;
          console.error('[MIRAI][AR] frame error:', err);
        }
      }

      // ── Periodic diagnostics ───────────────────────────────────────
      if (DEBUG && timestamp - lastDebugLogRef.current >= DEBUG_INTERVAL_MS) {
        lastDebugLogRef.current = timestamp;
        const vis = (id: number) =>
          Math.round((trackingFrame.landmarks[id]?.visibility ?? 0) * 100) / 100;
        console.log('[MIRAI][AR] status', {
          isARActive,
          product: selectedProduct?.id ?? null,
          garment: garmentStatusRef.current,
          tracking: trackingFrame.tracking_state,
          confidence: Math.round(trackingFrame.confidence * 100) / 100,

          landmarks: trackingFrame.landmarks.length,
          shoulders: [vis(11), vis(12)],
          hips: [vis(23), vis(24)],
          canvas: `${canvas.width}x${canvas.height}`,
          video: `${video.videoWidth}x${video.videoHeight}`,
        });
      }

      // ── Throttled UI state update ──────────────────────────────────
      frameTimesRef.current.push(timestamp);
      // Keep only last 30 frames for FPS rolling average
      if (frameTimesRef.current.length > 30) frameTimesRef.current.shift();

      if (timestamp - lastUIUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
        lastUIUpdateRef.current = timestamp;

        const times = frameTimesRef.current;
        const fps =
          times.length > 1
            ? Math.round((1000 * (times.length - 1)) / (times[times.length - 1] - times[0]))
            : 0;

        setState((s) => ({
          ...s,
          trackingState: trackingFrame.tracking_state as ARTrackingState,
          fps,
          confidence: Math.round(trackingFrame.confidence * 100) / 100,
        }));
      }
    }

    rafRef.current = requestAnimationFrame(tick);

  }, [videoRef, arCanvasRef, isARActive, selectedProduct, showSkeleton]);

  const stopLoop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    rendererRef.current?.clear();
  }, []);

  // ── Start/stop loop based on readiness ───────────────────────────────
  useEffect(() => {
    if (state.isReady) {
      startLoop();
    }
    return () => stopLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isReady]);

  // ── Restart loop on dependency change ────────────────────────────────
  useEffect(() => {
    if (!state.isReady) return;
    stopLoop();
    lastVideoTimeRef.current = -1; // force a fresh frame after restart
    startLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isARActive, selectedProduct?.id, showSkeleton]);

  return state;
}