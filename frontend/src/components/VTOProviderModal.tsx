/**
 * MIRAI — VTO Provider Settings Modal (updated)
 *
 * Changes vs. previous version:
 *  - Shows the currently selected garment so operators see what Decart will render.
 *  - Optional "Start Live Try-On" button (onStartLive) to jump straight to the live stream.
 *  - Warns when Decart is selected but no API key is configured.
 *  - API key input stays in sync with the saved key (prop changes) and supports Enter to save.
 *  - Closes on Escape or backdrop click; cards are keyboard accessible.
 *  - Key storage text corrected: the key is sent to Decart to authenticate the session.
 */

import React, { useEffect, useState } from 'react';
import {
  X, Zap, Shield, Key, CheckCircle, AlertTriangle, Cpu, Globe, Play, Shirt,
} from 'lucide-react';
import type { VTOProviderType, VTOConnectionState } from '../services/vto/types';
import type { Product } from '../types/api';

interface VTOProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProvider: VTOProviderType;
  onSelectProvider: (provider: VTOProviderType) => void;
  decartState: VTOConnectionState;
  decartApiKey: string;
  onSaveApiKey: (key: string) => void;
  decartError: string | null;
  /** Garment currently selected in the catalog (optional) */
  activeProduct?: Product | null;
  /** Opens the live Decart try-on (optional) */
  onStartLive?: () => void;
}

export const VTOProviderModal: React.FC<VTOProviderModalProps> = ({
  isOpen,
  onClose,
  activeProvider,
  onSelectProvider,
  decartState,
  decartApiKey,
  onSaveApiKey,
  decartError,
  activeProduct,
  onStartLive,
}) => {
  const [inputKey, setInputKey] = useState(decartApiKey);
  const [isSaved, setIsSaved] = useState(false);

  // Keep the input in sync if the saved key changes elsewhere
  useEffect(() => {
    setInputKey(decartApiKey);
  }, [decartApiKey]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveApiKey(inputKey.trim());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const decartSelected = activeProvider === 'decart';
  const missingKey = decartSelected && !decartApiKey;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="VTO Inference Engine Architecture"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Cpu size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">VTO Inference Engine Architecture</h2>
              <p className="text-xs text-neutral-400">MIRAI Intelligent Mirror • Pluggable Provider Layer</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Notice Banner */}
        <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-300">Funding Prototype Notice:</span> Decart Lucy V-TON serves
            as a temporary external inference layer for investor validation. MIRAI’s proprietary Kinematic Volumetric
            Garment Engine (KVGE) remains intact as our self-hosted core architecture.
          </p>
        </div>

        {/* Provider Cards */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {/* Decart */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectProvider('decart')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectProvider('decart')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              decartSelected
                ? 'bg-violet-950/40 border-violet-500 shadow-lg shadow-violet-900/20 ring-1 ring-violet-500'
                : 'bg-neutral-800/50 border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap size={16} className={decartSelected ? 'text-violet-400' : 'text-neutral-400'} />
                <span className="text-sm font-bold text-white">Decart Lucy V-TON</span>
              </div>
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                PROTOTYPE
              </span>
            </div>
            <p className="text-xs text-neutral-400 leading-snug">
              Real-time WebRTC neural world model (<code className="text-violet-300">lucy-vton-3.5</code>). Cloud inference.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  decartState === 'connected'
                    ? 'bg-emerald-400'
                    : decartState === 'connecting'
                    ? 'bg-amber-400 animate-pulse'
                    : decartState === 'error'
                    ? 'bg-red-400'
                    : 'bg-neutral-500'
                }`}
              />
              <span className="text-neutral-300 capitalize">{decartState}</span>
            </div>
          </div>

          {/* Mirai KVGE */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectProvider('mirai_kvge')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectProvider('mirai_kvge')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeProvider === 'mirai_kvge'
                ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-900/20 ring-1 ring-emerald-500'
                : 'bg-neutral-800/50 border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Shield size={16} className={activeProvider === 'mirai_kvge' ? 'text-emerald-400' : 'text-neutral-400'} />
                <span className="text-sm font-bold text-white">Mirai KVGE</span>
              </div>
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                SELF-HOSTED
              </span>
            </div>
            <p className="text-xs text-neutral-400 leading-snug">
              Kinematic Volumetric Garment Engine. 32-triangle fabric mesh, edge GPU/WASM 60 FPS.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Edge Ready (Local)</span>
            </div>
          </div>
        </div>

        {/* Active garment */}
        {decartSelected && (
          <div className="mt-4 p-3 rounded-xl bg-neutral-800/50 border border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
              {activeProduct?.asset_thumbnail ? (
                <img src={activeProduct.asset_thumbnail} alt={activeProduct.name} className="w-full h-full object-contain p-0.5" />
              ) : (
                <Shirt size={18} className="text-neutral-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">Garment sent to Decart</p>
              <p className="text-xs font-semibold text-white truncate">
                {activeProduct ? activeProduct.name : 'No garment selected — default shirt will be used'}
              </p>
            </div>
            {onStartLive && (
              <button
                onClick={onStartLive}
                disabled={!decartApiKey}
                className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Play size={12} fill="white" />
                Live Try-On
              </button>
            )}
          </div>
        )}

        {/* API Key */}
        <div className="mt-4 p-4 rounded-xl bg-neutral-800/50 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="decart-key" className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
              <Key size={14} className="text-violet-400" />
              Decart API Key (Runtime Kiosk Configuration)
            </label>
            {decartApiKey ? (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle size={12} /> Key Loaded
              </span>
            ) : (
              <span className="text-[11px] text-neutral-500">Not configured</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              id="decart-key"
              type="password"
              autoComplete="off"
              placeholder="decart_sk_..."
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="flex-1 bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-violet-500 font-mono"
            />
            <button
              onClick={handleSave}
              disabled={!inputKey.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-all active:scale-95"
            >
              {isSaved ? 'Saved!' : 'Save Key'}
            </button>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2">
            Stored in this kiosk's browser session only and never committed to git. It is sent to Decart solely to
            authenticate the live session.
          </p>
        </div>

        {/* Warnings / errors */}
        {missingKey && (
          <div className="mt-3 p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            <span>Decart is selected but no API key is saved. Add a key above to start a live session.</span>
          </div>
        )}
        {decartError && decartSelected && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span className="break-words">{decartError}</span>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex justify-between items-center pt-4 border-t border-white/10">
          <div className="flex items-center gap-2 text-[11px] text-neutral-400">
            <Globe size={13} className="text-violet-400" />
            <span>5G Low-Latency Real-Time Architecture</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};