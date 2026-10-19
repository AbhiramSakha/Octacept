/**
 * ProductCatalog — Premium Wardrobe Panel (right side of the mirror).
 *
 * Same props / handlers as before, so MirrorView.tsx needs no changes.
 *
 * Images:
 *   1. Tries the real product photo: asset_thumbnail, then asset_2d_overlay.
 *   2. If neither loads, draws a garment illustration in the product's own colour,
 *      with the correct shape for its type (jacket, overcoat, hoodie, shirt, tee,
 *      trousers, dress), so every piece is easy to recognise at a glance.
 *   Set PREFER_REAL_PHOTOS = false to always use the illustrations.
 *
 * Design:
 *   - Warm graphite glass panel, one champagne-brass accent.
 *   - Serif product names (Cormorant Garamond), clean sans for details (Manrope).
 *   - Category tabs with a brass underline.
 *   - Two-column portrait grid, each card labelled with its garment type.
 *   - Selected piece shown as a featured card with try-on controls.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Camera, Check, X, ChevronRight, ChevronLeft } from 'lucide-react';
import type { Product, ProductCategory } from '../types/api';

interface ProductCatalogProps {
  categories: ProductCategory[];
  products: Product[];
  activeCategoryId: string | null;
  selectedProduct: Product | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  isARActive: boolean;
  onSelectCategory: (id: string) => void;
  onSelectProduct: (product: Product) => void;
  onToggleAR: () => void;
  onPhotoTryOn: () => void;
  onClearSelection: () => void;
}

/** Use real product photos when they load. Set false to always show illustrations. */
const PREFER_REAL_PHOTOS = true;

/* ── Design tokens ─────────────────────────────────────────────────────────── */

const C = {
  panel: 'rgba(24, 20, 16, 0.86)',
  surface: '#1d1914',
  line: 'rgba(232, 217, 184, 0.14)',
  lineStrong: 'rgba(232, 217, 184, 0.28)',
  ivory: '#f3ece0',
  muted: '#a39a8b',
  brass: '#c8a96a',
  brassInk: '#1a150e',
};

const SERIF = "'Cormorant Garamond', 'Playfair Display', Georgia, serif";
const SANS = "'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Format price as ₹1,499 */
function formatPrice(price: number, currency: string): string {
  if (currency === 'INR') {
    return `₹${price.toLocaleString('en-IN')}`;
  }
  return `${currency} ${price.toFixed(2)}`;
}

/** "Jackets" -> "Jacket", "Hoodies" -> "Hoodie", "Dresses" -> "Dress", "Trousers" stays. */
function singular(name: string): string {
  if (/(trousers|pants|jeans|bottoms)$/i.test(name)) return name;
  if (/sses$/i.test(name)) return name.slice(0, -2);
  if (/s$/i.test(name)) return name.slice(0, -1);
  return name;
}

/* ── Colour helpers ────────────────────────────────────────────────────────── */

function parseHex(hex: string | undefined): [number, number, number] {
  let h = (hex ?? '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}/.test(h)) return [138, 131, 120];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** amt in -1..1: negative darkens (mix with black), positive lightens (mix with white). */
function shade(hex: string | undefined, amt: number): string {
  const [r, g, b] = parseHex(hex);
  const target = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const m = (v: number) => Math.round(v + (target - v) * p);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

function luminance(hex: string | undefined): number {
  const [r, g, b] = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/* ── Garment illustration ──────────────────────────────────────────────────── */

type GarmentKind = 'jacket' | 'coat' | 'hoodie' | 'shirt' | 'tee' | 'trousers' | 'dress';

function detectKind(p: Product): GarmentKind {
  const cat = (p.category_id || '').toLowerCase();
  const name = (p.name || '').toLowerCase();
  const text = `${cat} ${name}`;

  if (/dress|gown/.test(text)) return 'dress';
  if (/trouser|pant|jean|chino|jogger/.test(text)) return 'trousers';
  if (/hood|sweatshirt/.test(text)) return 'hoodie';
  if (/overcoat|coat|trench|blazer/.test(name)) return 'coat';
  if (/jacket|bomber|windbreaker|puffer/.test(text)) return 'jacket';
  if (/t-shirt|tee\b/.test(text)) return 'tee';
  if (/shirt/.test(text)) return 'shirt';
  return 'tee';
}

let illustrationCounter = 0;

const GarmentIllustration: React.FC<{ product: Product }> = ({ product }) => {
  const uid = useMemo(() => `gi${++illustrationCounter}`, []);
  const base = product.colors[0]?.hex ?? '#8a8378';
  const kind = detectKind(product);

  const light = shade(base, 0.22);
  const dark = shade(base, -0.28);
  const deep = shade(base, -0.5);
  const stitch = shade(base, 0.42);
  const edge = luminance(base) < 0.18 ? 'rgba(255,255,255,0.28)' : shade(base, -0.45);

  /** Fabric fill (side-to-side gradient) + vertical depth overlay + outline. */
  const body = (d: string) => (
    <g>
      <path d={d} fill={`url(#${uid}-f)`} stroke={edge} strokeWidth="1" strokeLinejoin="round" />
      <path d={d} fill={`url(#${uid}-v)`} />
    </g>
  );

  const ribbed = (d: string) => (
    <path d={d} fill={dark} stroke={edge} strokeWidth="0.8" strokeLinejoin="round" />
  );

  const longSleeveBody =
    'M46 24 L34 30 L16 46 L10 100 L24 104 L32 68 L32 132 L88 132 L88 68 L96 104 L110 100 L104 46 L86 30 L74 24 Q60 40 46 24 Z';

  let art: React.ReactNode = null;

  switch (kind) {
    case 'shirt':
      art = (
        <>
          {body('M48 22 L34 28 L12 46 L22 68 L34 60 L34 132 L86 132 L86 60 L98 68 L108 46 L86 28 L72 22 Q60 30 48 22 Z')}
          <path d="M47 22 L60 48 L41 40 Z" fill={light} stroke={edge} strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M73 22 L60 48 L79 40 Z" fill={light} stroke={edge} strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M60 48 L60 132" stroke={stitch} strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
          {[62, 80, 98, 116].map((y) => (
            <circle key={y} cx="60" cy={y} r="1.4" fill={stitch} />
          ))}
          <rect x="66" y="68" width="14" height="15" rx="1.5" fill="none" stroke={stitch} strokeWidth="0.8" strokeDasharray="2 2" />
        </>
      );
      break;

    case 'tee':
      art = (
        <>
          {body('M48 22 L34 28 L12 46 L22 68 L34 60 L34 132 L86 132 L86 60 L98 68 L108 46 L86 28 L72 22 Q60 38 48 22 Z')}
          <path d="M48 22 Q60 38 72 22" fill="none" stroke={dark} strokeWidth="3" strokeLinecap="round" />
          <path d="M34 124 L86 124" stroke={stitch} strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
        </>
      );
      break;

    case 'hoodie':
      art = (
        <>
          <path d="M42 28 Q42 4 60 4 Q78 4 78 28 Q60 20 42 28 Z" fill={dark} stroke={edge} strokeWidth="1" strokeLinejoin="round" />
          {body(longSleeveBody)}
          <path d="M46 24 Q60 40 74 24 Q60 14 46 24 Z" fill={deep} />
          <path d="M46 24 Q60 40 74 24" fill="none" stroke={dark} strokeWidth="2" strokeLinecap="round" />
          <path d="M55 36 L54 56" stroke={stitch} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M65 36 L66 56" stroke={stitch} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="54" cy="57" r="1.5" fill={stitch} />
          <circle cx="66" cy="57" r="1.5" fill={stitch} />
          <path d="M42 98 L78 98 L84 120 L36 120 Z" fill="none" stroke={stitch} strokeWidth="0.9" strokeDasharray="2 2" strokeLinejoin="round" />
          {ribbed('M32 126 H88 V132 H32 Z')}
          {ribbed('M10 100 L24 104 L23 110 L9 106 Z')}
          {ribbed('M96 104 L110 100 L111 106 L97 110 Z')}
        </>
      );
      break;

    case 'jacket':
      art = (
        <>
          {body(longSleeveBody)}
          <path d="M47 22 Q60 34 73 22" fill="none" stroke={dark} strokeWidth="5" strokeLinecap="round" />
          <path d="M60 34 L60 126" stroke={stitch} strokeWidth="1" strokeDasharray="2 1.5" fill="none" />
          <rect x="58.6" y="36" width="2.8" height="6" rx="1" fill={stitch} />
          <path d="M40 92 L45 114" stroke={dark} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M80 92 L75 114" stroke={dark} strokeWidth="1.6" strokeLinecap="round" />
          {ribbed('M32 124 H88 V132 H32 Z')}
          {ribbed('M10 100 L24 104 L23 110 L9 106 Z')}
          {ribbed('M96 104 L110 100 L111 106 L97 110 Z')}
        </>
      );
      break;

    case 'coat':
      art = (
        <>
          <path d="M46 24 L74 24 L60 66 Z" fill={deep} />
          {body('M46 24 L34 30 L16 46 L10 112 L24 116 L32 74 L32 148 L88 148 L88 74 L96 116 L110 112 L104 46 L86 30 L74 24 L60 66 Z')}
          <path d="M46 24 L60 66 L40 56 L38 34 Z" fill={light} stroke={edge} strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M74 24 L60 66 L80 56 L82 34 Z" fill={light} stroke={edge} strokeWidth="0.8" strokeLinejoin="round" />
          <path d="M60 66 L60 148" stroke={stitch} strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
          {[84, 106, 128].map((y) => (
            <g key={y}>
              <circle cx="54" cy={y} r="1.6" fill={stitch} />
              <circle cx="66" cy={y} r="1.6" fill={stitch} />
            </g>
          ))}
          <rect x="38" y="98" width="16" height="5" rx="1" fill={dark} stroke={edge} strokeWidth="0.6" />
          <rect x="66" y="98" width="16" height="5" rx="1" fill={dark} stroke={edge} strokeWidth="0.6" />
        </>
      );
      break;

    case 'trousers':
      art = (
        <>
          {body('M36 12 L84 12 L89 34 L82 142 L63 142 L60 56 L57 142 L38 142 L31 34 Z')}
          {ribbed('M36 12 H84 V21 H36 Z')}
          <path d="M60 21 L60 56" stroke={stitch} strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
          <path d="M45 21 L42 38" stroke={stitch} strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
          <path d="M75 21 L78 38" stroke={stitch} strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
          <path d="M38 134 L57 134 M63 134 L82 134" stroke={stitch} strokeWidth="0.8" strokeDasharray="2 2" fill="none" />
        </>
      );
      break;

    case 'dress':
      art = (
        <>
          {body('M46 12 L52 12 Q60 26 68 12 L74 12 L80 54 L102 144 L18 144 L40 54 Z')}
          <path d="M52 12 Q60 26 68 12" fill="none" stroke={dark} strokeWidth="2" strokeLinecap="round" />
          {ribbed('M40 54 L80 54 L81 61 L39 61 Z')}
          <path d="M50 63 L40 144 M60 63 L60 144 M70 63 L80 144" stroke={stitch} strokeWidth="0.7" opacity="0.7" fill="none" />
        </>
      );
      break;
  }

  return (
    <svg
      viewBox="0 0 120 152"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={product.name}
    >
      <defs>
        <linearGradient id={`${uid}-f`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={shade(base, 0.14)} />
          <stop offset="0.45" stopColor={base} />
          <stop offset="1" stopColor={shade(base, -0.24)} />
        </linearGradient>
        <linearGradient id={`${uid}-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.16" />
        </linearGradient>
      </defs>

      <ellipse cx="60" cy="148" rx="34" ry="3.2" fill="rgba(0,0,0,0.38)" />
      <g transform="translate(0, 2)">{art}</g>
    </svg>
  );
};

/* ── Product image: real photo -> illustration ─────────────────────────────── */

const ProductThumb: React.FC<{ product: Product }> = ({ product }) => {
  const sources = useMemo(
    () =>
      PREFER_REAL_PHOTOS
        ? ([product.asset_thumbnail, product.asset_2d_overlay].filter(Boolean) as string[])
        : [],
    [product.asset_thumbnail, product.asset_2d_overlay]
  );
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [product.id, sources]);

  const hex = product.colors[0]?.hex ?? '#3a342b';
  const src = sources[idx];

  if (src) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background: `radial-gradient(120% 90% at 50% 15%, ${hex}55 0%, ${hex}1f 45%, #1a1612 100%)`,
        }}
      >
        <img
          src={src}
          alt={product.name}
          loading="lazy"
          onError={() => setIdx((i) => i + 1)}
          className="w-full h-full object-contain p-3 drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)]"
        />
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-2"
      style={{
        background: `radial-gradient(90% 70% at 50% 28%, ${hex}30 0%, transparent 70%), radial-gradient(110% 80% at 50% 20%, rgba(243,236,224,0.20) 0%, rgba(243,236,224,0.05) 55%, rgba(0,0,0,0) 100%), #211c16`,
      }}
    >
      <GarmentIllustration product={product} />
    </div>
  );
};

/* ── Main component ────────────────────────────────────────────────────────── */

export const ProductCatalog: React.FC<ProductCatalogProps> = ({
  categories,
  products,
  activeCategoryId,
  selectedProduct,
  loading,
  error,
  onRetry,
  isARActive,
  onSelectCategory,
  onSelectProduct,
  onToggleAR,
  onPhotoTryOn,
  onClearSelection,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Load the premium fonts once.
  useEffect(() => {
    const id = 'mirai-wardrobe-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  const typeLabel = (categoryId: string): string => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? singular(cat.name.split('&')[0].trim()) : '';
  };

  /* ── Collapsed: slim brass-edged tab ── */
  if (isCollapsed) {
    return (
      <div className="absolute right-4 top-24 z-20 pointer-events-auto">
        <button
          onClick={() => setIsCollapsed(false)}
          title="Open wardrobe"
          className="group flex items-center gap-2.5 pl-3 pr-4 py-3 rounded-2xl backdrop-blur-xl
                     transition-all duration-200 active:scale-95
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a96a]"
          style={{
            background: C.panel,
            border: `1px solid ${C.lineStrong}`,
            color: C.ivory,
            fontFamily: SANS,
          }}
        >
          <ChevronLeft
            size={16}
            style={{ color: C.brass }}
            className="group-hover:-translate-x-0.5 transition-transform"
          />
          <span style={{ fontFamily: SERIF }} className="text-lg font-semibold leading-none">
            Wardrobe
          </span>
          {selectedProduct && (
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.brass }} />
          )}
        </button>
      </div>
    );
  }

  return (
    <aside
      className="absolute right-4 top-20 bottom-4 z-20 pointer-events-auto w-[22.5rem] max-w-[calc(100vw-2rem)]
                 flex flex-col rounded-[28px] overflow-hidden backdrop-blur-2xl
                 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.75)] transition-all duration-300"
      style={{
        background: C.panel,
        border: `1px solid ${C.line}`,
        color: C.ivory,
        fontFamily: SANS,
      }}
    >
      {/* Hide scrollbars inside the panel */}
      <style>{`
        .mirai-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .mirai-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Header ── */}
      <div className="flex items-end justify-between px-5 pt-5 pb-3">
        <div>
          <h2
            style={{ fontFamily: SERIF }}
            className="text-[28px] font-semibold leading-none tracking-wide"
          >
            Wardrobe
          </h2>
          <p className="text-[12px] mt-1.5" style={{ color: C.muted }}>
            {products.length} {products.length === 1 ? 'piece' : 'pieces'} to try
          </p>
        </div>

        <button
          onClick={() => setIsCollapsed(true)}
          title="Minimize wardrobe"
          className="p-2 rounded-full transition-colors hover:bg-white/10 active:scale-95
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a96a]"
          style={{ color: C.muted, border: `1px solid ${C.line}` }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Category tabs ── */}
      <div
        className="mirai-scroll flex overflow-x-auto gap-5 px-5"
        style={{ borderBottom: `1px solid ${C.line}` }}
      >
        {categories.map((cat) => {
          const active = activeCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className="relative flex-shrink-0 py-3 text-[13px] font-semibold whitespace-nowrap transition-colors
                         focus:outline-none focus-visible:text-white"
              style={{ color: active ? C.ivory : C.muted }}
            >
              {cat.name.split('&')[0].trim()}
              <span
                className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full transition-opacity"
                style={{ background: C.brass, opacity: active ? 1 : 0 }}
              />
            </button>
          );
        })}
      </div>

      {/* ── Featured (selected) piece ── */}
      {selectedProduct && (
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="flex gap-4">
            {/* Portrait */}
            <div
              className="relative w-[96px] h-[124px] rounded-2xl overflow-hidden flex-shrink-0"
              style={{ border: `1px solid ${C.lineStrong}` }}
            >
              <ProductThumb product={selectedProduct} />
            </div>

            {/* Details */}
            <div className="min-w-0 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h3
                  style={{ fontFamily: SERIF }}
                  className="text-[21px] font-semibold leading-[1.1] line-clamp-2"
                >
                  {selectedProduct.name}
                </h3>
                <button
                  onClick={onClearSelection}
                  title="Remove garment"
                  className="p-1.5 -mr-1 rounded-full transition-colors hover:bg-white/10 flex-shrink-0
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a96a]"
                  style={{ color: C.muted }}
                >
                  <X size={14} />
                </button>
              </div>

              <p className="text-[12px] mt-1" style={{ color: C.muted }}>
                {selectedProduct.brand}
              </p>
              {typeLabel(selectedProduct.category_id) && (
                <p className="text-[12px]" style={{ color: C.muted }}>
                  {typeLabel(selectedProduct.category_id)}
                </p>
              )}

              <p className="text-[17px] font-semibold mt-1.5" style={{ color: C.brass }}>
                {formatPrice(selectedProduct.price, selectedProduct.currency)}
              </p>

              {/* Colours */}
              <div className="flex items-center gap-2 mt-auto pt-2">
                {selectedProduct.colors.map((c) => (
                  <span
                    key={c.name}
                    title={c.name}
                    className="w-4 h-4 rounded-full"
                    style={{
                      backgroundColor: c.hex,
                      boxShadow: `0 0 0 1px ${C.lineStrong}, 0 0 0 3px rgba(0,0,0,0.35)`,
                    }}
                  />
                ))}
                <span className="text-[11px] ml-1 truncate" style={{ color: C.muted }}>
                  {selectedProduct.colors[0]?.name}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 mt-4">
            <button
              onClick={onToggleAR}
              title="Toggle live try-on on the mirror"
              className="flex-1 flex items-center justify-between gap-2 pl-4 pr-3 py-2.5 rounded-xl
                         text-[13px] font-bold transition-all duration-200 active:scale-[0.98]
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a96a] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              style={
                isARActive
                  ? { background: C.brass, color: C.brassInk }
                  : { background: 'transparent', color: C.ivory, border: `1px solid ${C.lineStrong}` }
              }
            >
              <span className="flex items-center gap-2">
                <Sparkles size={14} />
                Live try-on
              </span>
              {/* mini switch */}
              <span
                className="relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0"
                style={{ background: isARActive ? 'rgba(26,21,14,0.35)' : 'rgba(255,255,255,0.18)' }}
              >
                <span
                  className="absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all"
                  style={{
                    left: isARActive ? 16 : 2,
                    background: isARActive ? C.brassInk : C.ivory,
                  }}
                />
              </span>
            </button>

            <button
              onClick={onPhotoTryOn}
              title="Create a high-resolution AI photo"
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold
                         transition-all hover:bg-white/10 active:scale-[0.98] whitespace-nowrap
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a96a]"
              style={{ color: C.ivory, border: `1px solid ${C.line}` }}
            >
              <Camera size={14} />
              Photo
            </button>
          </div>
        </div>
      )}

      {/* ── Product grid ── */}
      <div className="mirai-scroll flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl animate-pulse" style={{ background: C.surface }}>
                <div className="aspect-[3/4]" />
                <div className="h-10" />
              </div>
            ))}
          </div>
        ) : error && products.length === 0 ? (
          <div className="py-10 text-center">
            <p style={{ fontFamily: SERIF }} className="text-xl font-semibold">
              Catalog unavailable
            </p>
            <p className="text-[12px] mt-1.5 mb-4" style={{ color: C.muted }}>
              {error}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-4 py-2 rounded-xl text-[13px] font-bold transition-all active:scale-95"
                style={{ background: C.brass, color: C.brassInk }}
              >
                Reconnect
              </button>
            )}
          </div>
        ) : products.length === 0 ? (
          <p className="text-[13px] py-10 text-center" style={{ color: C.muted }}>
            Nothing in this collection yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            {products.map((product) => {
              const isSelected = selectedProduct?.id === product.id;
              const label = typeLabel(product.category_id);

              return (
                <button
                  key={product.id}
                  onClick={() => onSelectProduct(product)}
                  className="group text-left focus:outline-none"
                >
                  {/* Image */}
                  <div
                    className="relative aspect-[3/4] rounded-2xl overflow-hidden transition-all duration-200
                               group-focus-visible:ring-2 group-focus-visible:ring-[#c8a96a]"
                    style={{
                      border: `1px solid ${isSelected ? C.brass : C.line}`,
                      boxShadow: isSelected
                        ? `0 0 0 1px ${C.brass}, 0 14px 30px -12px rgba(200,169,106,0.45)`
                        : 'none',
                    }}
                  >
                    <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]">
                      <ProductThumb product={product} />
                    </div>

                    {label && (
                      <span
                        className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-md"
                        style={{ background: 'rgba(0,0,0,0.55)', color: C.ivory }}
                      >
                        {label}
                      </span>
                    )}

                    {isSelected && (
                      <span
                        className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: C.brass, color: C.brassInk }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}

                    {!product.in_stock && (
                      <span
                        className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-md"
                        style={{ background: 'rgba(0,0,0,0.6)', color: C.muted }}
                      >
                        Out of stock
                      </span>
                    )}
                  </div>

                  {/* Caption */}
                  <p
                    style={{ fontFamily: SERIF }}
                    className="mt-2.5 text-[17px] font-semibold leading-tight line-clamp-1"
                  >
                    {product.name}
                  </p>
                  <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: C.muted }}>
                    {product.colors[0]?.name}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span
                      className="text-[13px] font-semibold"
                      style={{ color: isSelected ? C.brass : C.ivory }}
                    >
                      {formatPrice(product.price, product.currency)}
                    </span>
                    <span className="flex items-center gap-1">
                      {product.colors.slice(0, 3).map((c) => (
                        <span
                          key={c.name}
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: c.hex, boxShadow: `0 0 0 1px ${C.lineStrong}` }}
                        />
                      ))}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-5 py-2.5 text-center" style={{ borderTop: `1px solid ${C.line}` }}>
        <p className="text-[11px]" style={{ color: C.muted }}>
          Tap a piece to see it on you. Use the arrow to give the mirror full view.
        </p>
      </div>
    </aside>
  );
};