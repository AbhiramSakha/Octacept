/**
 * MIRAI — DecartVTOProofModal (fixed)
 *
 * Fixes:
 *  - <video> elements are ALWAYS mounted (srcObject can attach reliably).
 *  - Uses the product selected in the catalog (`product` prop) instead of a hardcoded one.
 *  - Garment changes are pushed to the live session via changeGarment().
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, X, Play, Square, Key, Activity,
  CheckCircle2, Circle, ExternalLink, ShieldCheck,
} from 'lucide-react';
import { useDecartVTO } from '../hooks/useDecartVTO';
import { getGarmentReference } from '../services/GarmentRegistry';
import type { Product } from '../types/api';

interface DecartVTOProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  localStream: MediaStream | null;
  /** Product currently selected in the catalog */
  product?: Product | null;
}

const TEST_CHECKLIST = [
  '1. Move left / right across frame',
  '2. Move closer to camera',
  '3. Move farther away',
  '4. Raise left arm',
  '5. Raise right arm',
  '6. Raise both arms together',
  '7. Bend elbows (forearms up)',
  '8. Turn partially sideways (3/4 profile)',
  '9. Lean torso left and right',
  '10. Walk naturally back and forth',
  '11. Stop suddenly / quick movements',
  '12. Rapid distance changes',
];

const DEFAULT_PRODUCT: Product = {
  id: 'oct_sht_002',
  sku: 'OCT-SHT-002',
  name: 'Relaxed Camp-Collar Linen Shirt',
  category_id: 'shirts',
  brand: 'OCTACEPT Essentials',
  price: 739,
  currency: 'INR',
  description: 'Natural flax breathable linen camp collar shirt.',
  colors: [{ name: 'Natural Flax', hex: '#deb887' }],
  sizes: ['S', 'M', 'L', 'XL'],
  asset_2d_overlay: '/garments/camp_collar_linen_shirt.png',
  asset_thumbnail: '/garments/camp_collar_linen_shirt.png',
  in_stock: true,
};

export const DecartVTOProofModal: React.FC<DecartVTOProofModalProps> = ({
  isOpen, onClose, localStream, product,
}) => {
  const {
    remoteStream, connectionState, isStreaming, error,
    apiKey, hasApiKey, setApiKey, startSession, stopSession, changeGarment,
  } = useDecartVTO();

  const [inputKey, setInputKey] = useState(apiKey);
  const [completedTests, setCompletedTests] = useState<Record<number, boolean>>({});

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const activeProduct = product ?? DEFAULT_PRODUCT;
  const garment = useMemo(() => getGarmentReference(activeProduct.id), [activeProduct.id]);
  const isGarmentReady = Boolean(garment?.isLiveVTOReady);

  useEffect(() => {
    setInputKey(apiKey);
  }, [apiKey]);

  // Attach transformed stream (element is always mounted, so ref is always valid)
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) return;
    el.srcObject = remoteStream;
    if (remoteStream) el.play().catch((e) => console.warn('Autoplay prevented:', e));
  }, [remoteStream, isOpen]);

  // Attach raw camera PIP
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    el.srcObject = localStream;
    if (localStream) el.play().catch((e) => console.warn('Local preview error:', e));
  }, [localStream, isOpen]);

  // Apply the selected garment when it changes, including changes made while connecting.
  useEffect(() => {
    if (isStreaming) void changeGarment(activeProduct);
  }, [activeProduct, changeGarment, isStreaming]);

  // Stop session when modal closes
  useEffect(() => {
    if (!isOpen) stopSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const showRemote = isStreaming && !!remoteStream;

  const handleStart = () => {
    if (!localStream) {
      alert('Camera stream not ready. Please allow camera permissions.');
      return;
    }
    startSession(localStream, activeProduct);
  };

  const toggleTest = (i: number) =>
    setCompletedTests((p) => ({ ...p, [i]: !p[i] }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-neutral-950 border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-300">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-white font-black tracking-wide text-base">
                  DECART LUCY V-TON — REALTIME PROOF OF CONCEPT
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-mono font-bold">
                  MODEL: lucy-vton-3.5
                </span>
              </div>
              <p className="text-neutral-400 text-xs mt-0.5">
                Phase 1 Verification: Live WebRTC stream transformation on real camera feed
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-neutral-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          {/* Left: viewport */}
          <div className="lg:col-span-7 bg-black p-5 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/10">
            <div className="relative aspect-[4/3] w-full bg-neutral-900 rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center shadow-inner">
              {/* Always mounted; hidden until the stream arrives */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover ${showRemote ? 'opacity-100' : 'opacity-0'}`}
                style={{ transform: 'scaleX(-1)' }}
              />

              {!showRemote && (
                <div className="relative z-10 flex flex-col items-center justify-center text-center p-6">
                  {connectionState === 'connecting' ? (
                    <>
                      <div className="w-12 h-12 rounded-full border-4 border-violet-500/30 border-t-violet-400 animate-spin mb-4" />
                      <p className="text-white font-bold text-sm">Initiating WebRTC Session...</p>
                      <p className="text-neutral-400 text-xs mt-1 max-w-xs">
                        Connecting to Decart GPU cluster running Lucy V-TON 3.5
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-4xl mb-3">🪞</div>
                      <p className="text-white font-bold text-sm">Realtime VTO Inactive</p>
                      <p className="text-neutral-400 text-xs mt-1 max-w-xs">
                        Click "Start Live Lucy V-TON" to try on <b>{activeProduct.name}</b>.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Raw camera PIP */}
              <div className="absolute bottom-3 right-3 w-32 aspect-[4/3] rounded-xl overflow-hidden border border-white/20 shadow-2xl bg-black/80 z-20">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <span className="absolute bottom-1 left-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[8px] text-neutral-300 font-mono">
                  RAW INPUT
                </span>
              </div>

              {/* Status badge */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase shadow-lg ${
                    connectionState === 'connected'
                      ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/40'
                      : connectionState === 'connecting'
                      ? 'bg-amber-950/90 text-amber-300 border border-amber-500/40 animate-pulse'
                      : connectionState === 'error'
                      ? 'bg-red-950/90 text-red-300 border border-red-500/40'
                      : 'bg-neutral-900/90 text-neutral-400 border border-white/10'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      connectionState === 'connected'
                        ? 'bg-emerald-400 animate-pulse'
                        : connectionState === 'connecting'
                        ? 'bg-amber-400'
                        : connectionState === 'error'
                        ? 'bg-red-400'
                        : 'bg-neutral-500'
                    }`}
                  />
                  <span>{connectionState}</span>
                </span>
              </div>
            </div>

            {error && (
              <div className="mt-3 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2">
                <span className="font-bold text-red-400">Error:</span>
                <span className="flex-1 leading-snug">{error}</span>
              </div>
            )}

            <div className="flex items-center gap-3 mt-4">
              {!isStreaming ? (
                <button
                  onClick={handleStart}
                  disabled={connectionState === 'connecting' || !isGarmentReady}
                  className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Play size={15} fill="white" />
                  <span>START LIVE LUCY V-TON</span>
                </button>
              ) : (
                <button
                  onClick={stopSession}
                  className="flex-1 py-3 px-5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-900/30 transition-all active:scale-95"
                >
                  <Square size={14} fill="white" />
                  <span>STOP SESSION</span>
                </button>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-5 p-5 flex flex-col overflow-y-auto space-y-5 bg-neutral-950">
            {/* API key */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-neutral-300 font-bold text-xs">
                  <Key size={14} className="text-violet-400" />
                  <span>Decart API Credentials</span>
                </div>
                <a
                  href="https://platform.decart.ai/models/lucy-vton"
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-400 hover:text-violet-300 text-[10px] flex items-center gap-1"
                >
                  <span>platform.decart.ai</span>
                  <ExternalLink size={10} />
                </a>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="Enter DECART_API_KEY..."
                  className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-violet-500"
                />
                <button
                  onClick={() => setApiKey(inputKey)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors"
                >
                  Save
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-neutral-400">
                <ShieldCheck size={13} className={hasApiKey ? 'text-emerald-400' : 'text-amber-400'} />
                <span>{hasApiKey ? 'Decart key configured' : 'API key required to initiate session'}</span>
              </div>
            </div>

            {/* Active garment (now follows the catalog selection) */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block mb-2">
                ACTIVE GARMENT {isStreaming && '• LIVE'}
              </span>
              {garment ? (
                <div className="flex items-center gap-3">
                  {garment.referenceImageUrl && (
                    <img
                      src={garment.referenceImageUrl}
                      alt={garment.name}
                      className="w-14 h-14 rounded-xl object-contain bg-black/50 border border-white/15 p-1"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-xs font-bold truncate">{garment.name}</p>
                    <p className="text-emerald-400 text-xs font-bold mt-0.5">₹{activeProduct.price}</p>
                    <p className="text-neutral-400 text-[10px] font-mono truncate mt-0.5">
                      {garment.isLiveVTOReady
                        ? garment.vtonPrompt
                        : 'A verified Live VTO garment asset is not available yet.'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-amber-300 text-xs">
                  {activeProduct.name} is not registered for Live VTO.
                </p>
              )}
            </div>

            {/* Tests */}
            <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-neutral-300 font-bold text-xs">
                  <Activity size={14} className="text-violet-400" />
                  <span>12 Movement Acceptance Tests</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-400">
                  {Object.values(completedTests).filter(Boolean).length} / 12
                </span>
              </div>
              <div className="space-y-1.5 flex-1 overflow-y-auto no-scrollbar max-h-48 pr-1">
                {TEST_CHECKLIST.map((item, idx) => {
                  const done = completedTests[idx];
                  return (
                    <button
                      key={idx}
                      onClick={() => toggleTest(idx)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                        done
                          ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'
                          : 'bg-white/[0.02] text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span className="truncate">{item}</span>
                      {done ? (
                        <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
                      ) : (
                        <Circle size={13} className="text-neutral-600 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-white/10 bg-white/[0.01] flex items-center justify-between">
          <p className="text-[11px] text-neutral-400">
            Powered by <strong className="text-white">Decart Lucy V-TON</strong> • Official WebRTC Streaming Architecture
          </p>
          <span className="text-[10px] text-neutral-500 font-mono">
            Zero Canvas Polygons • Real-Time Neural Video
          </span>
        </div>
      </div>
    </div>
  );
};