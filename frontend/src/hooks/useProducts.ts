/**
 * useProducts — fetches the product catalog and category list from the backend.
 *
 * Usage:
 *   const { categories, products, loading, error, selectCategory } = useProducts();
 */

import { useCallback, useEffect, useState } from 'react';
import type { Product, ProductCategory } from '../types/api';
import { fetchCategories, fetchProducts } from '../services/api';

export interface UseProductsReturn {
  categories: ProductCategory[];
  products: Product[];
  activeCategoryId: string | null;
  loading: boolean;
  error: string | null;
  selectCategory: (id: string | null) => void;
}

export function useProducts(): UseProductsReturn {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load categories once on mount
  useEffect(() => {
    let cancelled = false;
    fetchCategories()
      .then((cats) => {
        if (cancelled) return;
        const sorted = [...cats].sort((a, b) => a.display_order - b.display_order);
        setCategories(sorted);
        // Auto-select first category
        if (sorted.length > 0) setActiveCategoryId(sorted[0].id);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message ?? 'Failed to load categories.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Load products when active category changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProducts(activeCategoryId ?? undefined)
      .then((prods) => {
        if (cancelled) return;
        setProducts(prods);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message ?? 'Failed to load products.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeCategoryId]);

  const selectCategory = useCallback((id: string | null) => {
    setActiveCategoryId(id);
  }, []);

  return { categories, products, activeCategoryId, loading, error, selectCategory };
}