/**
 * useDecartVTO — realtime Decart Lucy V-TON session hook.
 *
 * NOTE: verify the model id / method names below against your installed
 * @decartai/sdk version (platform.decart.ai/models/lucy-vton). Calls that
 * may differ between versions are wrapped defensively.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createDecartClient, models } from '@decartai/sdk';
import { GARMENT_REGISTRY } from '../services/GarmentRegistry';
import type { Product } from '../types/api';

export type DecartConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

const KEY_STORAGE = 'mirai_decart_api_key';
const MODEL_ID = 'lucy-vton-3.5';

function resolveGarment(product: Product | null) {
  return (
    (product && GARMENT_REGISTRY[product.id]) ||
    GARMENT_REGISTRY['oct_sht_002']
  );
}

async function urlToBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    return await res.blob();
  } catch {
    return null;
  }
}

export function useDecartVTO() {
  const [apiKey, setApiKeyState] = useState<string>(
    () => sessionStorage.getItem(KEY_STORAGE) || (import.meta as any).env?.VITE_DECART_API_KEY || ''
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<DecartConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);

  const setApiKey = useCallback((key: string) => {
    const k = key.trim();
    sessionStorage.setItem(KEY_STORAGE, k);
    setApiKeyState(k);
  }, []);

  /** Push garment prompt + reference image to a running (or starting) session. */
  const applyGarment = useCallback(async (session: any, product: Product | null) => {
    const garment = resolveGarment(product);
    const prompt = garment.vtonPrompt;
    try {
      const blob = garment.referenceImageUrl ? await urlToBlob(garment.referenceImageUrl) : null;
      if (blob && typeof session.setImage === 'function') {
        await session.setImage(blob, { prompt, enhance: true });
      } else if (typeof session.setPrompt === 'function') {
        await session.setPrompt(prompt, { enhance: true });
      }
    } catch (e) {
      console.warn('[Decart] applyGarment failed:', e);
    }
  }, []);

  const stopSession = useCallback(() => {
    try {
      sessionRef.current?.disconnect?.();
    } catch (e) {
      console.warn('[Decart] disconnect error:', e);
    }
    sessionRef.current = null;
    setRemoteStream(null);
    setConnectionState('disconnected');
  }, []);

  const startSession = useCallback(
    async (localStream: MediaStream, product: Product | null) => {
      if (!apiKey) {
        setError('Decart API key required.');
        setConnectionState('error');
        return;
      }
      stopSession();
      setError(null);
      setConnectionState('connecting');

      try {
        if (!clientRef.current) clientRef.current = createDecartClient({ apiKey });
        const garment = resolveGarment(product);

        const session = await clientRef.current.realtime.connect(localStream, {
          model: (models as any).realtime(MODEL_ID),
          onRemoteStream: (stream: MediaStream) => setRemoteStream(stream),
          initialState: { prompt: { text: garment.vtonPrompt, enhance: true } },
        });

        sessionRef.current = session;
        session.on?.('connectionChange', (state: string) => {
          if (state === 'connected') setConnectionState('connected');
          else if (state === 'connecting' || state === 'reconnecting') setConnectionState('connecting');
          else if (state === 'disconnected') setConnectionState('disconnected');
        });
        session.on?.('error', (e: any) => {
          setError(e?.message || 'Decart session error');
          setConnectionState('error');
        });

        setConnectionState('connected');
        // Reference image (if supported) is sent right after connect.
        applyGarment(session, product);
      } catch (e: any) {
        setError(e?.message || 'Failed to start Decart session');
        setConnectionState('error');
      }
    },
    [apiKey, stopSession, applyGarment]
  );

  /** Swap garment on the live stream without restarting the session. */
  const updateGarment = useCallback(
    (product: Product | null) => {
      if (sessionRef.current) applyGarment(sessionRef.current, product);
    },
    [applyGarment]
  );

  useEffect(() => () => stopSession(), [stopSession]);

  return {
    remoteStream,
    connectionState,
    isStreaming: connectionState === 'connected' || !!remoteStream,
    error,
    apiKey,
    hasApiKey: !!apiKey,
    setApiKey,
    startSession,
    stopSession,
    updateGarment,
  };
}