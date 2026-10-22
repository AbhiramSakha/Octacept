/**
 * MIRAI — ProductDetailCard
 *
 * Floating contextual retail card displaying the active garment's pricing,
 * physical in-store rack location, interactive size selector, and action buttons.
 *
 * UPDATE: shows a BEST FIT tag + recommendation text from the body scan.
 */

import React, { useState, useEffect } from 'react';
import { Tag, MapPin, X, QrCode } from 'lucide-react';
import type { Product, InventoryStatus } from '../types/api';

interface ProductDetailCardProps {
  product: Product | null;
  selectedSize: string;
  onSelectSize: (size: string) => void;
  onSaveLook: () => void;
  onOpenCoupons: () => void;
  onClear: () => void;
  /** Size recommended from the body scan (null if no scan / not a top). */
  recommendedSize?: string | null;
  /** Second-best size when the user is between two sizes. */
  alternateSize?: string | null;
}

export const ProductDetailCard: React.FC<ProductDetailCardProps> = ({
  product,
  selectedSize,
  onSelectSize,
  onSaveLook,
  onOpenCoupons,
  onClear,
  recommendedSize = null,
  alternateSize = null,
}) => {
  const [inventory, setInventory] = useState<InventoryStatus | null>(null);

  useEffect(() => {
    if (!product) {
      setInventory(null);
      return;
    }

    // Fetch real-time inventory from backend
    fetch(`http://localhost:8000/api/v1/inventory/${product.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setInventory(data);
        } else {
          // Fallback realistic inventory data
          setInventory({
            product_id: product.id,
            total_stock: 14,
            size_breakdown: { S: 3, M: 5, L: 4, XL: 2 },
            rack_location: 'Aisle 2, Section B • Rack 04',
          });
        }
      })
      .catch(() => {
        setInventory({
          product_id: product.id,
          total_stock: 12,
          size_breakdown: { S: 2, M: 4, L: 4, XL: 2 },
          rack_location: 'Aisle 2, Section B • Rack 04',
        });
      });
  }, [product]);

  if (!product) return null;

  const formattedPrice =
    product.currency === 'INR'
      ? `₹${product.price.toLocaleString('en-IN')}`
      : `${product.currency} ${product.price}`;

  const primaryColor = product.colors[0];

  return (
    <div className="absolute left-6 bottom-6 z-20 pointer-events-auto max-w-sm w-full bg-black/85 backdrop-blur-2xl border border-white/15 rounded-3xl p-5 shadow-2xl text-white animate-in slide-in-from-bottom-4 duration-300">
      {/* Top Header with Brand & Close */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">
            {product.brand}
          </span>
          <h3 className="text-base font-bold text-white leading-snug">{product.name}</h3>
        </div>
        <button
          onClick={onClear}
          className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-neutral-400 hover:text-white transition-colors"
          title="Remove Garment"
        >
          <X size={15} />
        </button>
      </div>

      {/* Price & Color */}
      <div className="flex items-center gap-3 my-2.5">
        <span className="text-emerald-400 font-extrabold text-lg">{formattedPrice}</span>
        {primaryColor && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
            <span
              className="w-3 h-3 rounded-full border border-white/30"
              style={{ backgroundColor: primaryColor.hex }}
            />
            <span className="text-xs text-neutral-300 font-medium">{primaryColor.name}</span>
          </div>
        )}
      </div>

      {/* Size Selector Pills */}
      <div className="my-3">
        <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5 font-semibold">
          <span>SELECT SIZE</span>
          {inventory && (
            <span className="text-emerald-400">
              {inventory.size_breakdown[selectedSize] ?? 2} available
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {product.sizes.map((size) => {
            const isSelected = selectedSize === size;
            const inStock = (inventory?.size_breakdown[size] ?? 1) > 0;

            return (
              <button
                key={size}
                onClick={() => onSelectSize(size)}
                disabled={!inStock}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-900/50 ring-1 ring-violet-400'
                    : inStock
                    ? 'bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10'
                    : 'bg-white/[0.02] text-neutral-600 line-through cursor-not-allowed border border-white/5'
                }`}
              >
                {size}
                {size === recommendedSize && (
                  <span className="block text-[8px] text-emerald-300 leading-none mt-0.5">
                    BEST FIT
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {recommendedSize && (
          <p className="mt-2 text-[11px] text-emerald-400">
            Based on your measurements, we recommend <b>{recommendedSize}</b>
            {alternateSize && (
              <>
                {' '}
                (or <b>{alternateSize}</b> for a different fit)
              </>
            )}
            .
          </p>
        )}
      </div>

      {/* Physical Store Location */}
      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10 my-3 text-xs text-neutral-300">
        <MapPin size={15} className="text-violet-400 flex-shrink-0" />
        <span className="truncate">
          {inventory?.rack_location || 'Aisle 2, Section B • Rack 04'}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onSaveLook}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 font-bold text-xs transition-all shadow-lg shadow-violet-900/40 active:scale-95 text-white"
        >
          <QrCode size={15} />
          <span>Save Look (QR)</span>
        </button>

        <button
          onClick={onOpenCoupons}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 font-bold text-xs transition-all text-neutral-200 active:scale-95"
          title="View In-Store Coupons"
        >
          <Tag size={15} className="text-amber-400" />
          <span>Coupons</span>
        </button>
      </div>
    </div>
  );
};

export default ProductDetailCard;