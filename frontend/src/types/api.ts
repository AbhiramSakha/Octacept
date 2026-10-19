/**
 * Frontend → Backend REST API contracts.
 * Strictly mirrors /docs/API_CONTRACT.md
 */

export interface ProductCategory {
  id: string;
  name: string;
  display_order: number;
  icon?: string;
}

export interface ProductColor {
  name: string;
  hex: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  brand: string;
  price: number;
  currency: string;
  description: string;
  colors: ProductColor[];
  sizes: string[];
  asset_2d_overlay: string;
  asset_3d_model?: string | null;
  asset_thumbnail: string;
  in_stock: boolean;
}

export interface InventoryStatus {
  product_id: string;
  total_stock: number;
  size_breakdown: Record<string, number>;
  rack_location: string;
}

export interface CustomerSession {
  session_id: string;
  mirror_id: string;
  status: 'active' | 'ended';
  created_at: string;
}

export interface SavedLookResponse {
  look_id: string;
  qr_url: string;
  shareable_code: string;
}

// ── Virtual Try-On ────────────────────────────────────────────────────────

export interface TryOnRequest {
  /** Base-64 encoded JPEG captured from the customer's webcam. */
  person_image_b64: string;
  /** Product ID or SKU to be tried on. */
  product_id: string;
  /** Optional session ID for analytics. */
  session_id?: string;
}

export interface TryOnResponse {
  /** Base-64 encoded PNG of the try-on result image. */
  result_image_b64: string;
  /** The product ID that was processed. */
  product_id: string;
  /**
   * 'demo'  — Pillow composite produced by DemoVirtualTryOnService. NOT real AI.
   * 'ai'    — Real AI virtual try-on provider result.
   */
  mode: 'demo' | 'ai';
  /** Server-side processing time in milliseconds. */
  processing_time_ms: number;
}

export interface TryOnErrorResponse {
  detail: string;
}
