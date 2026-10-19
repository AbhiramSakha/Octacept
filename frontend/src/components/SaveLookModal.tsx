/**
 * MIRAI — SaveLookModal
 *
 * Investor & Customer-facing modal for saving a trial room look,
 * generating a real QR code for mobile phone handoff, and checkout continuation.
 */

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Check, Copy, Smartphone, Sparkles, ShoppingBag } from 'lucide-react';
import type { Product } from '../types/api';

interface SaveLookModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  selectedSize?: string;
  sessionId?: string;
}

export const SaveLookModal: React.FC<SaveLookModalProps> = ({
  isOpen,
  onClose,
  product,
  selectedSize = 'M',
  sessionId = 'sess_live',
}) => {
  const [copied, setCopied] = useState(false);
  const lookName = 'My MIRAI Trial Look';
  const [shareCode] = useState(() => `FIT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);

  if (!isOpen || !product) return null;

  const qrUrl = `https://mirai.octacept.com/looks/${sessionId}?code=${shareCode}&sku=${product.sku}&size=${selectedSize}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedPrice =
    product.currency === 'INR'
      ? `₹${product.price.toLocaleString('en-IN')}`
      : `${product.currency} ${product.price}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-neutral-900/95 border border-white/15 rounded-3xl p-6 shadow-2xl text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all text-neutral-400 hover:text-white"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-xl bg-violet-600/30 border border-violet-500/40 text-violet-300">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{lookName}</h3>
            <p className="text-xs text-neutral-400">Scan to continue on mobile or checkout in-store</p>
          </div>
        </div>

        {/* Garment Summary Card */}
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 mb-5">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
            style={{
              background: product.colors[0]
                ? `linear-gradient(135deg, ${product.colors[0].hex}cc, ${product.colors[0].hex}44)`
                : '#262626',
            }}
          >
            <ShoppingBag size={24} className="text-white/80" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-violet-300 uppercase tracking-wider">{product.brand}</p>
            <h4 className="text-sm font-semibold text-white truncate">{product.name}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-emerald-400 font-bold text-sm">{formattedPrice}</span>
              <span className="text-neutral-500 text-xs">•</span>
              <span className="text-xs text-neutral-300 font-mono bg-white/10 px-1.5 py-0.5 rounded">
                Size {selectedSize}
              </span>
            </div>
          </div>
        </div>

        {/* High-Resolution QR Code */}
        <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-white text-neutral-900 mb-5 shadow-inner">
          <div className="p-2 bg-white rounded-xl shadow-sm">
            <QRCodeSVG
              value={qrUrl}
              size={180}
              level="H"
              includeMargin={false}
            />
          </div>
          <p className="text-[11px] font-semibold text-neutral-600 mt-3 tracking-wider flex items-center gap-1.5">
            <Smartphone size={14} className="text-violet-600" />
            SCAN WITH PHONE CAMERA
          </p>
          <span className="text-xs font-mono font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded mt-1">
            CODE: {shareCode}
          </span>
        </div>

        {/* Link Copy & Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold text-xs transition-all shadow-lg shadow-violet-900/40 active:scale-95"
          >
            {copied ? (
              <>
                <Check size={16} className="text-emerald-300" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Copy size={16} />
                <span>Copy Share Link</span>
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="py-3 px-5 rounded-xl bg-white/10 hover:bg-white/20 font-semibold text-xs transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveLookModal;
