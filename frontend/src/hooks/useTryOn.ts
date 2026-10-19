/**
 * useTryOn — state machine for the complete virtual try-on flow.
 *
 * States:
 *   idle        — waiting for user to press TRY ON
 *   capturing   — grabbing webcam frame
 *   processing  — waiting for backend response
 *   success     — result image available
 *   error       — something went wrong
 *
 * Usage:
 *   const { state, resultImage, resultMode, error, triggerTryOn, reset } = useTryOn(captureFrame);
 *
 * triggerTryOn(product) must be called with the product the user selected.
 * The product ID is sent to the backend — this guarantees Product A never
 * sends Product B to the try-on service.
 */

import { useCallback, useRef, useState } from 'react';
import type { Product } from '../types/api';
import type { TryOnResponse } from '../types/api';
import { postTryOn } from '../services/api';

export type TryOnState = 'idle' | 'capturing' | 'processing' | 'success' | 'error';

export interface UseTryOnReturn {
  state: TryOnState;
  resultImage: string | null;   // base-64 PNG
  resultMode: 'demo' | 'ai' | null;
  processingMs: number | null;
  error: string | null;
  lastProduct: Product | null;
  triggerTryOn: (product: Product, captureFrame: () => string | null) => Promise<void>;
  reset: () => void;
}

export function useTryOn(): UseTryOnReturn {
  const [state, setState] = useState<TryOnState>('idle');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultMode, setResultMode] = useState<'demo' | 'ai' | null>(null);
  const [processingMs, setProcessingMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastProduct, setLastProduct] = useState<Product | null>(null);

  // Prevent concurrent requests
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState('idle');
    setResultImage(null);
    setResultMode(null);
    setProcessingMs(null);
    setError(null);
    setLastProduct(null);
  }, []);

  const triggerTryOn = useCallback(
    async (product: Product, captureFrame: () => string | null) => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setError(null);
      setResultImage(null);
      setResultMode(null);
      setProcessingMs(null);
      setLastProduct(product);

      // ── Step 1: Capture ───────────────────────────────────────────────
      setState('capturing');

      // Give the capturing state a brief render window before taking the frame.
      await new Promise((r) => setTimeout(r, 80));

      const personImageB64 = captureFrame();
      if (!personImageB64) {
        setState('error');
        setError('Could not capture your image. Please allow camera access and try again.');
        return;
      }

      // ── Step 2: Process ───────────────────────────────────────────────
      setState('processing');

      try {
        const response: TryOnResponse = await postTryOn({
          person_image_b64: personImageB64,
          product_id: product.id,
        });

        if (abortRef.current?.signal.aborted) return;

        setResultImage(response.result_image_b64);
        setResultMode(response.mode);
        setProcessingMs(response.processing_time_ms);
        setState('success');
      } catch (err: unknown) {
        if (abortRef.current?.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        // Map backend detail strings to user-friendly messages
        if (msg.includes('not found')) {
          setError('This product is no longer available. Please select another.');
        } else if (msg.includes('out of stock')) {
          setError('This item is out of stock. Please choose another.');
        } else if (msg.includes('camera') || msg.includes('image')) {
          setError('Could not capture your image. Please allow camera access and try again.');
        } else if (msg.includes('503') || msg.includes('service')) {
          setError('Unable to create your look right now. Please try again in a moment.');
        } else {
          setError('Unable to create your look right now. Please try again.');
        }
        setState('error');
      }
    },
    []
  );

  return { state, resultImage, resultMode, processingMs, error, lastProduct, triggerTryOn, reset };
}