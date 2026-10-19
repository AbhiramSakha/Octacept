import React from 'react';
import { Product, ProductCategory } from '../types/api';

interface ProductCatalogDrawerProps {
  categories: ProductCategory[];
  products: Product[];
  selectedCategory: string | null;
  selectedProduct: Product | null;
  isLoading: boolean;
  error: string | null;
  onSelectCategory: (catId: string | null) => void;
  onSelectProduct: (prod: Product) => void;
  onRetry: () => void;
}

export const ProductCatalogDrawer: React.FC<ProductCatalogDrawerProps> = ({
  categories,
  products,
  selectedCategory,
  selectedProduct,
  isLoading,
  error,
  onSelectCategory,
  onSelectProduct,
  onRetry
}) => {
  return (
    <div className="z-20 flex flex-col space-y-3 bg-black/75 backdrop-blur-xl p-4 rounded-3xl border border-white/10 shadow-2xl transition-all">
      {/* Category selector pills */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => onSelectCategory(null)}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
            selectedCategory === null
              ? 'bg-white text-black shadow-lg shadow-white/20'
              : 'bg-white/10 text-neutral-300 hover:bg-white/20'
          }`}
        >
          All Items ({products.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategory === cat.id
                ? 'bg-white text-black shadow-lg shadow-white/20'
                : 'bg-white/10 text-neutral-300 hover:bg-white/20'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Loading & Error States */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-neutral-400 text-xs">
          <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mr-2" />
          Loading store catalog...
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-6 text-center text-xs">
          <p className="text-rose-400 font-medium">{error}</p>
          <button
            onClick={onRetry}
            className="mt-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium"
          >
            Retry Connection
          </button>
        </div>
      ) : (
        /* Horizontal product cards */
        <div className="flex space-x-3 overflow-x-auto pb-2 pt-1 scrollbar-none">
          {products.map((prod) => {
            const isSelected = selectedProduct?.id === prod.id;
            return (
              <div
                key={prod.id}
                onClick={() => onSelectProduct(prod)}
                className={`flex-shrink-0 w-44 p-3 rounded-2xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-white/15 border-cyan-400 shadow-lg shadow-cyan-500/20 scale-[1.02]'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="w-full h-24 rounded-xl bg-neutral-900 flex items-center justify-center mb-2 overflow-hidden border border-white/5">
                  <div className="text-center text-xs text-neutral-400 font-mono">
                    [{prod.sku}]
                  </div>
                </div>
                <h4 className="text-xs font-semibold text-white truncate">{prod.name}</h4>
                <p className="text-[10px] text-neutral-400 mt-0.5">{prod.brand}</p>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs font-bold text-emerald-400">
                    ${prod.price.toFixed(2)}
                  </span>
                  <div className="flex space-x-1">
                    {prod.sizes.slice(0, 3).map((s) => (
                      <span key={s} className="text-[9px] px-1 py-0.5 bg-white/10 rounded text-neutral-300">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};