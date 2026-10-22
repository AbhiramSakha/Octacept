/**
 * MIRAI — MirrorView
 *
 * The Main MIRAI Intelligent Mirror Experience.
 *
 * Pluggable Live Virtual Try-On Pipeline:
 *   1. Decart Lucy V-TON (Temporary External Prototype Provider)
 *      Webcam MediaStream ──► WebRTC ──► Sub-60ms Neural Model (lucy-vton-3.5) ──► Mirror Viewport
 *   2. Mirai KVGE (Proprietary Self-Hosted Edge Engine)
 *      Webcam MediaStream ──► MediaPipe WASM ──► 3D (Three.js) or 2D mesh-warp garment (60 FPS)
 *
 * UPDATE (measurements v2):
 *   - Weight input is passed to the scan panel (improves stomach / chest / hip estimates).
 *   - The segmentation mask stays on (scan.wantsSilhouette) until the waist width is measured.
 *
 * UPDATE (size scan):
 *   - Body scan panel (height -> measurements) + automatic size recommendation.
 *   - useLiveAR passes every tracking frame to the scan via the new `onFrame` argument.
 *   - ProductDetailCard shows BEST FIT; the recommended size is auto-selected.
 *
 * UPDATE (3D + camera):
 *   - 2D / 3D renderer toggle in the header (3D default).
 *   - Camera picker (when >1 camera), specific camera error messages, robust retry.
 *
 * UPDATE (dress not visible fix):
 *   - Default provider is now 'mirai_kvge' so the dress is drawn locally on the
 *     live camera immediately when a product is picked.
 *   - If Decart is selected but cannot run (no API key, no camera stream, or the
 *     garment is not registered for live VTO), we now automatically fall back to
 *     Mirai KVGE instead of silently doing nothing.
 *   - Switching to Decart without an API key opens the provider modal and keeps KVGE active.
 *   - Added MIRROR_AR_CANVAS flag: set to true only if the dress shows up
 *     flipped / on the wrong side (useLiveAR does not mirror its own drawing).
 *
 * Layer order: local camera (z-0) < Decart stream (z-[1]) < AR canvas (z-10) < HUD (z-20+).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import { useProducts } from '../hooks/useProducts';
import { useLiveAR } from '../hooks/useLiveAR';
import { useBodyMeasurements } from '../hooks/useBodyMeasurements';

import { useTryOn } from '../hooks/useTryOn';
import { useDecartVTO } from '../hooks/useDecartVTO';
import { ProductCatalog } from './ProductCatalog';
import { ProductDetailCard } from './ProductDetailCard';
import { BodyScanPanel } from './BodyScanPanel';
import { MeasurementOverlay } from './MeasurementOverlay';
import { SaveLookModal } from './SaveLookModal';
import { CouponsModal } from './CouponsModal';
import { TryOnOverlay } from './TryOnOverlay';
import { VTOProviderModal } from './VTOProviderModal';
import type { Product } from '../types/api';
import type { VTOProviderType } from '../services/vto/types';
import { isLiveVTOAvailable } from '../services/GarmentRegistry';
import { recommendSize } from '../sizing/sizeChart';
import { Activity, Eye, EyeOff, Tag, LogOut, Zap, Shield, Cpu, Box, Layers } from 'lucide-react';
import type { RenderMode } from '../rendering/garmentRenderer';

/**
 * Set to true ONLY if the dress/skeleton appears mirrored (wrong side) after
 * selecting a product. The camera videos are flipped with scaleX(-1); if
 * useLiveAR already mirrors its own drawing, leave this false.
 */
const MIRROR_AR_CANVAS = false;

export const MirrorView: React.FC = () => {
  // ── Hardware Camera Feed ───────────────────────────────────────────────────
  const {
    videoRef,
    canvasRef,
    stream: cameraStream,
    isReady: cameraReady,
    error: cameraError,
    errorDetail: cameraErrorDetail,
    devices: cameraDevices,
    activeDeviceId: activeCameraId,
    startCamera,
    switchCamera,
    captureFrame,
  } = useCamera();

  // ── Session State & Telemetry ──────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string>(
    () => `sess_${Math.random().toString(36).substring(2, 9)}`
  );

  // Initialize session on mount
  useEffect(() => {
    fetch('http://localhost:8000/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mirror_id: 'MIRAI-SMART-MIRROR-01',
        client_timestamp: Date.now(),
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.session_id) {
          setSessionId(data.session_id);
        }
      })
      .catch((err) => console.warn('[MIRAI] Backend session init notice:', err));
  }, []);

  // ── Product Catalog ────────────────────────────────────────────────────────
  const {
    categories,
    products,
    activeCategoryId,
    loading: catalogLoading,
    selectCategory,
  } = useProducts();

  // ── VTO Engine Selection & Decart Live Prototype ───────────────────────────
  // FIX: default to the self-hosted engine so the dress is drawn on the live camera.
  const [activeProvider, setActiveProvider] = useState<VTOProviderType>('mirai_kvge');
  const [isProviderModalOpen, setIsProviderModalOpen] = useState<boolean>(false);
  const decartVideoRef = useRef<HTMLVideoElement>(null);

  const {
    remoteStream: decartRemoteStream,
    connectionState: decartState,
    error: decartError,
    apiKey: decartApiKey,
    setApiKey: setDecartApiKey,
    startSession: startDecartSession,
    stopSession: stopDecartSession,
    changeGarment: changeDecartGarment,
  } = useDecartVTO();

  // Route remote transformed WebRTC stream to Decart video viewport
  useEffect(() => {
    const video = decartVideoRef.current;
    if (!video || !decartRemoteStream) return;

    console.log('[MIRAI] Attaching Decart remoteStream to video element:', {
      streamId: decartRemoteStream.id,
      videoTracks: decartRemoteStream.getVideoTracks().map((t) => ({
        id: t.id,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
      })),
    });

    video.srcObject = decartRemoteStream;

    const playRemoteVideo = async () => {
      try {
        await video.play();
        console.log('[MIRAI] Decart remote video playback active:', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          paused: video.paused,
        });
      } catch (err) {
        console.warn('[MIRAI] Decart video play() promise waiting:', err);
      }
    };

    video.onloadedmetadata = () => {
      console.log('[MIRAI] Decart video loadedmetadata:', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      playRemoteVideo();
    };

    decartRemoteStream.getVideoTracks().forEach((track) => {
      track.onunmute = () => {
        console.log('[MIRAI] Decart video track unmuted, frames arriving!');
        playRemoteVideo();
      };
    });

    playRemoteVideo();
  }, [decartRemoteStream]);

  // ── Body Size Scan (height + weight -> measurements -> size recommendation) ─
  const scan = useBodyMeasurements();

  // ── Live AR Virtual Try-On Engine (Mirai Self-Hosted KVGE) ─────────────────
  const arCanvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [isARActive, setIsARActive] = useState<boolean>(true);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(false);
  // 3D (Three.js) is the default garment renderer; 2D is the classic mesh-warp fallback.
  const [renderMode, setRenderMode] = useState<RenderMode>('3d');

  // Drive self-hosted Kinematic Volumetric Garment Engine (60 FPS local canvas).
  // When Decart is active, 2D mesh rendering is suppressed so it doesn't overlap the neural video stream,
  // while body tracking & skeleton HUD remain completely functional.
  const isKVGEMeshActive = isARActive && activeProvider === 'mirai_kvge';

  const { fps: realFPS } = useLiveAR(
    videoRef,
    arCanvasRef,
    selectedProduct,
    isKVGEMeshActive,
    showSkeleton,
    renderMode,
    scan.feedFrame, // every tracking frame goes to the size scan
    scan.wantsSilhouette // mask stays on until the waist width is measured (saves FPS afterwards)
  );

  // Recommended size for the selected product (tops only), from the finished scan
  const rec = useMemo(
    () =>
      selectedProduct && scan.measurements
        ? recommendSize(
            selectedProduct.category_id,
            selectedProduct.sizes,
            scan.measurements.chestCm
          )
        : null,
    [selectedProduct, scan.measurements]
  );

  // Auto-select the recommended size (also when the user picks a different product)
  useEffect(() => {
    if (rec) setSelectedSize(rec.size);
  }, [rec?.size, selectedProduct?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modals & Dialogs ───────────────────────────────────────────────────────
  const [isSaveLookOpen, setIsSaveLookOpen] = useState<boolean>(false);
  const [isCouponsOpen, setIsCouponsOpen] = useState<boolean>(false);

  // ── AI Photo Snapshot Try-On (Secondary Feature) ───────────────────────────
  const {
    state: photoState,
    resultImage: photoResultImage,
    resultMode: photoResultMode,
    processingMs: photoProcessingMs,
    error: photoError,
    triggerTryOn: triggerPhotoTryOn,
    reset: resetPhotoTryOn,
  } = useTryOn();

  const [capturedB64, setCapturedB64] = useState<string | null>(null);

  // Start hardware camera on mount
  useEffect(() => {
    startCamera();
  }, [startCamera]);

  // ── Product Selection Handler ──────────────────────────────────────────────
  const handleSelectProduct = useCallback(
    async (product: Product) => {
      setSelectedProduct(product);
      setSelectedSize(product.sizes[0] || 'M');
      setIsARActive(true);

      // Record selection event with backend telemetry
      fetch('http://localhost:8000/api/v1/analytics/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          event_type: 'garment_selected',
          product_id: product.id,
          dwell_time_seconds: 0,
          timestamp: Date.now(),
        }),
      }).catch(() => {});

      // In Decart prototype mode: connect or switch garment — but only if it can actually run.
      if (activeProvider === 'decart') {
        const stream =
          cameraStream || (videoRef.current?.srcObject as MediaStream) || null;

        const canUseDecart =
          Boolean(decartApiKey) && Boolean(stream) && isLiveVTOAvailable(product.id);

        if (!canUseDecart) {
          // FIX: previously this silently did nothing, so no dress ever appeared.
          console.warn(
            '[MIRAI] Decart unavailable (no API key / no camera stream / garment not registered). ' +
              'Falling back to Mirai KVGE.',
            {
              productId: product.id,
              hasKey: Boolean(decartApiKey),
              hasStream: Boolean(stream),
              liveAvailable: isLiveVTOAvailable(product.id),
            }
          );
          setActiveProvider('mirai_kvge');
          return;
        }

        if (decartState === 'connected') {
          await changeDecartGarment(product);
        } else {
          await startDecartSession(stream as MediaStream, product);
        }
      }
    },
    [
      sessionId,
      activeProvider,
      cameraStream,
      videoRef,
      decartState,
      decartApiKey,
      changeDecartGarment,
      startDecartSession,
    ]
  );

  // ── Provider Switching Handler ─────────────────────────────────────────────
  const handleSelectProvider = useCallback(
    async (provider: VTOProviderType) => {
      if (provider === 'decart') {
        // Decart needs an API key; otherwise stay on KVGE and ask for the key.
        if (!decartApiKey) {
          setIsProviderModalOpen(true);
          setActiveProvider('mirai_kvge');
          return;
        }

        setActiveProvider('decart');

        if (selectedProduct) {
          const stream =
            cameraStream || (videoRef.current?.srcObject as MediaStream) || null;
          if (stream && isLiveVTOAvailable(selectedProduct.id)) {
            await startDecartSession(stream, selectedProduct);
          } else {
            console.warn(
              '[MIRAI] Selected garment is not available for Decart live VTO. Using Mirai KVGE.'
            );
            setActiveProvider('mirai_kvge');
          }
        }
      } else {
        setActiveProvider(provider);
        stopDecartSession();
      }
    },
    [decartApiKey, selectedProduct, cameraStream, videoRef, startDecartSession, stopDecartSession]
  );

  const handleToggleAR = useCallback(() => {
    setIsARActive((v) => !v);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedProduct(null);
  }, []);

  const handleEndSession = useCallback(() => {
    fetch(`http://localhost:8000/api/v1/sessions/${sessionId}/end`, {
      method: 'POST',
    }).catch(() => {});

    stopDecartSession();
    setSelectedProduct(null);
    setIsARActive(true);
    scan.reset(); // clear the previous customer's measurements
    setSessionId(`sess_${Math.random().toString(36).substring(2, 9)}`);
  }, [sessionId, stopDecartSession, scan.reset]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI Photo Try-On Handlers ───────────────────────────────────────────────
  const handlePhotoTryOn = useCallback(async () => {
    if (!selectedProduct) return;
    setCapturedB64(null);

    // Capture from currently active video stream (Decart remote stream or local camera)
    const activeVideoEl =
      activeProvider === 'decart' && decartRemoteStream && decartVideoRef.current
        ? decartVideoRef.current
        : videoRef.current;

    await triggerPhotoTryOn(selectedProduct, () => {
      const frame = captureFrame(activeVideoEl);
      setCapturedB64(frame);
      return frame;
    });
  }, [selectedProduct, triggerPhotoTryOn, captureFrame, activeProvider, decartRemoteStream, videoRef]);

  const isPhotoOverlayOpen = photoState !== 'idle';
  const isDecartLive = activeProvider === 'decart' && Boolean(decartRemoteStream);

  return (
    // `isolate` creates a stacking context so child z-indexes can never
    // slip behind this container's own background.
    <div className="relative isolate w-full h-full bg-neutral-950 overflow-hidden select-none">

      {/* ── Layer 1: Hardware Mirror Camera Viewport & Neural Stream ── */}
      <div className="absolute inset-0 z-0">
        <canvas ref={canvasRef} className="hidden" />

        {cameraError ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="text-5xl mb-4">📷</div>
            <p className="text-white font-semibold text-lg">Camera Access Required</p>
            <p className="text-neutral-400 text-sm mt-2 max-w-sm">
              {cameraError === 'permission_denied'
                ? 'Please allow camera access (click the camera icon in the address bar → Allow), then retry.'
                : cameraError === 'not_found'
                ? 'No camera found. Connect the camera (USB) and click Retry.'
                : cameraError === 'not_readable'
                ? 'The camera is busy or blocked. Close other apps using it (Teams, Zoom, other browser tabs, Camera app) and retry.'
                : cameraError === 'insecure'
                ? 'Camera needs a secure address. Open the app at http://localhost:5173.'
                : cameraError === 'overconstrained'
                ? 'This camera does not support the requested mode. Retry or choose another camera.'
                : 'Could not start mirror camera stream.'}
            </p>
            {cameraErrorDetail && (
              <p className="text-neutral-500 text-[11px] mt-2 max-w-sm font-mono break-words">
                {cameraErrorDetail}
              </p>
            )}
            {cameraDevices.length > 1 && (
              <select
                value={activeCameraId ?? ''}
                onChange={(e) => switchCamera(e.target.value)}
                className="mt-4 px-3 py-2 rounded-lg bg-white/10 text-white text-sm border border-white/20 max-w-sm"
              >
                {cameraDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId} className="text-black">
                    {d.label}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => startCamera()}
              className="mt-6 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-all shadow-lg shadow-violet-900/40"
            >
              Retry Camera
            </button>
          </div>
        ) : (
          <>
            {/* Layer 1A: Hardware local camera (always visible underneath, keeps MediaPipe running) */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover absolute inset-0 z-0"
              style={{ transform: 'scaleX(-1)' }}
            />

            {/* Layer 1B: Decart Lucy V-TON neural stream (fades in on top when connected) */}
            <video
              ref={decartVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover absolute inset-0 z-[1] transition-opacity duration-300 ${
                isDecartLive ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              style={{ transform: 'scaleX(-1)' }}
            />

            {/* Loading hint while the camera warms up */}
            {!cameraReady && (
              <div className="absolute inset-0 z-[2] flex items-center justify-center text-neutral-400 text-sm pointer-events-none">
                Starting mirror camera…
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Layer 2: Self-Hosted Kinematic Volumetric Garment Canvas / Skeleton HUD ── */}
      <canvas
        ref={arCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={MIRROR_AR_CANVAS ? { transform: 'scaleX(-1)' } : undefined}
      />

      {/* ── Layer 2B: Skeleton + measurement lines (shoulders, chest, torso, height) ── */}
      {!isPhotoOverlayOpen && (
        <MeasurementOverlay
          frameRef={scan.latestFrame}
          measurements={scan.measurements}
          status={scan.status}
        />
      )}

      {/* ── Layer 3: Enterprise Retail HUD Header Bar ── */}
      {!isPhotoOverlayOpen && (
        <header className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center mx-4 mt-4 px-5 py-3 bg-black/80 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-widest text-white">MIRAI</h1>
              <span className="px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 text-[10px] font-bold">
                5G SMART TRIAL ROOM
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 tracking-wider">OCTACEPT • Intelligent Mirror</p>
          </div>

          {/* Engine & Retail Control Badges */}
          <div className="flex items-center gap-2.5">
            {/* Pluggable VTO Engine Status & Switcher Badge */}
            <button
              onClick={() => setIsProviderModalOpen(true)}
              title="Click to configure VTO inference provider"
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                activeProvider === 'decart'
                  ? decartState === 'connected'
                    ? 'bg-violet-950/80 border-violet-500/50 text-violet-300 shadow-sm shadow-violet-900/30'
                    : decartState === 'connecting'
                    ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                    : 'bg-neutral-900/80 border-violet-500/30 text-violet-400 hover:border-violet-500'
                  : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-900/30'
              }`}
            >
              {activeProvider === 'decart' ? (
                <>
                  <Zap
                    size={13}
                    className={decartState === 'connected' ? 'text-violet-400' : 'text-amber-400'}
                  />
                  <span className="font-mono">
                    {decartState === 'connected'
                      ? 'DECART VTO: ACTIVE'
                      : decartState === 'connecting'
                      ? 'DECART: CONNECTING...'
                      : 'DECART VTO: PROTOTYPE'}
                  </span>
                  <span className="text-[9px] text-amber-300 font-bold px-1.5 py-0.5 rounded bg-amber-500/20">
                    TEMP
                  </span>
                </>
              ) : (
                <>
                  <Shield size={13} className="text-emerald-400" />
                  <span className="font-mono">
                    {selectedProduct && isARActive ? 'MIRAI KVGE: ACTIVE' : 'MIRAI KVGE: READY'}
                  </span>
                  <span className="text-[9px] text-emerald-300 font-bold px-1.5 py-0.5 rounded bg-emerald-500/20">
                    SELF-HOSTED
                  </span>
                </>
              )}
            </button>

            {/* Real Measured FPS */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-neutral-300 text-xs font-mono">
              <Activity size={12} className="text-violet-400" />
              <span>{realFPS > 0 ? `${realFPS} FPS` : '-- FPS'}</span>
            </div>

            {/* Engine Architecture & Key Modal Toggle */}
            <button
              onClick={() => setIsProviderModalOpen(true)}
              title="Configure VTO Inference Engine & API Keys"
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 transition-all active:scale-95"
            >
              <Cpu size={13} className="text-violet-400" />
              <span>Engine</span>
            </button>

            {/* Skeleton Overlay Toggle */}
            <button
              onClick={() => setShowSkeleton((v) => !v)}
              title={showSkeleton ? 'Hide body skeleton lines' : 'Show body skeleton lines'}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                showSkeleton
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-white/5 text-neutral-400 border border-white/10 hover:text-white'
              }`}
            >
              {showSkeleton ? <Eye size={13} /> : <EyeOff size={13} />}
              <span>Skeleton</span>
            </button>

            {/* Camera picker (shown when more than one camera is connected) */}
            {cameraDevices.length > 1 && (
              <select
                value={activeCameraId ?? ''}
                onChange={(e) => switchCamera(e.target.value)}
                title="Choose camera"
                className="px-2 py-1 rounded-lg text-xs font-semibold bg-white/5 text-neutral-200 border border-white/10 max-w-[160px]"
              >
                {cameraDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId} className="text-black">
                    {d.label}
                  </option>
                ))}
              </select>
            )}

            {/* 2D / 3D Garment Renderer Toggle */}
            <button
              onClick={() => setRenderMode((m) => (m === '3d' ? '2d' : '3d'))}
              title={renderMode === '3d' ? 'Using 3D renderer (click for 2D)' : 'Using 2D renderer (click for 3D)'}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                renderMode === '3d'
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                  : 'bg-white/5 text-neutral-400 border border-white/10 hover:text-white'
              }`}
            >
              {renderMode === '3d' ? <Box size={13} /> : <Layers size={13} />}
              <span>{renderMode === '3d' ? '3D' : '2D'}</span>
            </button>

            {/* In-Store Promotions & Coupons Button */}
            <button
              onClick={() => setIsCouponsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all shadow-sm active:scale-95"
            >
              <Tag size={13} />
              <span>Coupons & Rewards</span>
            </button>

            {/* Hardware Camera Indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-neutral-300 text-xs font-mono">
              <span className={`w-2 h-2 rounded-full ${cameraReady ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
              <span>{cameraReady ? 'CAM' : 'OFF'}</span>
            </div>

            {/* End Session Button */}
            <button
              onClick={handleEndSession}
              title="End session and reset mirror for next customer"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 hover:bg-red-500/20 text-neutral-400 hover:text-red-300 border border-white/10 hover:border-red-500/30 transition-all active:scale-95"
            >
              <LogOut size={13} />
              <span>Reset</span>
            </button>
          </div>
        </header>
      )}

      {/* ── Decart Key Alert Notification (if key missing in prototype mode) ── */}
      {activeProvider === 'decart' && !decartApiKey && selectedProduct && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-amber-950/90 border border-amber-500/50 backdrop-blur-md shadow-xl flex items-center gap-3">
          <Zap size={14} className="text-amber-400 shrink-0" />
          <span className="text-xs text-amber-200">
            Decart API Key required for live prototype streaming.
          </span>
          <button
            onClick={() => setIsProviderModalOpen(true)}
            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold rounded-lg transition-all"
          >
            Enter Key
          </button>
          <button
            onClick={() => handleSelectProvider('mirai_kvge')}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold rounded-lg transition-all"
          >
            Switch to Mirai KVGE
          </button>
        </div>
      )}

      {/* ── Layer 3B: Body Size Scan Panel (left side, below the header) ── */}
      {!isPhotoOverlayOpen && (
        <BodyScanPanel
          status={scan.status}
          progress={scan.progress}
          hint={scan.hint}
          measurements={scan.measurements}
          heightCm={scan.heightCm}
          onHeightChange={scan.setHeight}
          weightKg={scan.weightKg}
          onWeightChange={scan.setWeight}
          clothingChoice={scan.clothingChoice}
          onClothingChange={scan.setClothing}
          calibrated={scan.calibrated}
          onCalibrate={scan.calibrate}
          onClearCalibration={scan.clearCalibration}
        />
      )}

      {/* ── Layer 4: Contextual Product Details, Sizes & In-Store Inventory ── */}
      {!isPhotoOverlayOpen && selectedProduct && (
        <ProductDetailCard
          product={selectedProduct}
          selectedSize={selectedSize}
          onSelectSize={setSelectedSize}
          onSaveLook={() => setIsSaveLookOpen(true)}
          onOpenCoupons={() => setIsCouponsOpen(true)}
          onClear={handleClearSelection}
          recommendedSize={rec?.size ?? null}
          alternateSize={rec?.alternate ?? null}
        />
      )}

      {/* ── Layer 5: Interactive Wardrobe & Garment Catalog (Right Drawer) ── */}
      {!isPhotoOverlayOpen && (
        <ProductCatalog
          categories={categories}
          products={products}
          activeCategoryId={activeCategoryId}
          selectedProduct={selectedProduct}
          loading={catalogLoading}
          isARActive={isARActive}
          onSelectCategory={selectCategory}
          onSelectProduct={handleSelectProduct}
          onToggleAR={handleToggleAR}
          onPhotoTryOn={handlePhotoTryOn}
          onClearSelection={handleClearSelection}
        />
      )}

      {/* ── Layer 6: Save Look & Real QR Code Handoff Modal ── */}
      <SaveLookModal
        isOpen={isSaveLookOpen}
        onClose={() => setIsSaveLookOpen(false)}
        product={selectedProduct}
        selectedSize={selectedSize}
        sessionId={sessionId}
      />

      {/* ── Layer 7: In-Store Promotional Coupons & Rewards Modal ── */}
      <CouponsModal isOpen={isCouponsOpen} onClose={() => setIsCouponsOpen(false)} />

      {/* ── Layer 8: Secondary AI Photo Snapshot Try-On Overlay ── */}
      <TryOnOverlay
        state={photoState}
        resultImage={photoResultImage}
        resultMode={photoResultMode}
        processingMs={photoProcessingMs}
        error={photoError}
        product={selectedProduct}
        capturedPersonB64={capturedB64}
        onTryAnother={() => {
          resetPhotoTryOn();
          setCapturedB64(null);
        }}
        onRetry={handlePhotoTryOn}
        onSaveLook={() => setIsSaveLookOpen(true)}
      />

      {/* ── Layer 9: VTO Provider Architecture & Credentials Modal ── */}
      <VTOProviderModal
        isOpen={isProviderModalOpen}
        onClose={() => setIsProviderModalOpen(false)}
        activeProvider={activeProvider}
        onSelectProvider={handleSelectProvider}
        decartState={decartState}
        decartApiKey={decartApiKey}
        onSaveApiKey={setDecartApiKey}
        decartError={decartError}
      />
    </div>
  );
};