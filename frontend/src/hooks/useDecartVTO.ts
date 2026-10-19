/**
 * MIRAI — useDecartVTO Hook
 *
 * Manages the lifecycle of Decart Lucy V-TON real-time WebRTC sessions.
 * Coordinates local camera stream input, remote transformed stream output,
 * active garment switching, and credential management.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DecartLucyVTOProvider } from '../services/vto/DecartLucyVTOProvider';
import type { GarmentReference, VTOConnectionState } from '../services/vto/types';
import { getGarmentReference } from '../services/GarmentRegistry';
import type { Product } from '../types/api';

const LOCAL_STORAGE_DECART_KEY = 'mirai_decart_api_key';

export interface UseDecartVTOResult {
  remoteStream: MediaStream | null;
  connectionState: VTOConnectionState;
  activeGarment: GarmentReference | null;
  isStreaming: boolean;
  error: string | null;
  apiKey: string;
  hasApiKey: boolean;
  setApiKey: (key: string) => void;
  startSession: (cameraStream: MediaStream, product: Product) => Promise<void>;
  stopSession: () => void;
  changeGarment: (product: Product) => Promise<boolean>;
}

export function useDecartVTO(): UseDecartVTOResult {
  const [apiKey, setApiKeyState] = useState<string>(() => {
    return (
      (import.meta.env.VITE_DECART_API_KEY as string | undefined) ??
      localStorage.getItem(LOCAL_STORAGE_DECART_KEY) ??
      ''
    );
  });

  const [connectionState, setConnectionState] = useState<VTOConnectionState>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [activeGarment, setActiveGarment] = useState<GarmentReference | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providerRef = useRef<DecartLucyVTOProvider | null>(null);

  // Fetch credentials from backend environment if not present in client
  useEffect(() => {
    if (!apiKey) {
      fetch('http://localhost:8000/api/v1/vto/credentials')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.api_key) {
            setApiKeyState(data.api_key);
            console.log('[MIRAI] Decart API key loaded from backend environment.');
          }
        })
        .catch(() => {});
    }
  }, [apiKey]);

  // Initialize provider on mount or apiKey change
  useEffect(() => {
    const provider = new DecartLucyVTOProvider({
      apiKey: apiKey.trim() || undefined,
    });

    provider.on('stateChange', (state) => {
      setConnectionState(state);
      if (state === 'connected') {
        setError(null);
      }
    });

    provider.on('stream', (stream) => {
      setRemoteStream(stream);
    });

    provider.on('error', (err) => {
      setError(err.message || 'Decart Lucy V-TON connection failed');
    });

    providerRef.current = provider;

    return () => {
      provider.disconnect();
      providerRef.current = null;
    };
  }, [apiKey]);

  const setApiKey = useCallback((newKey: string) => {
    const trimmed = newKey.trim();
    localStorage.setItem(LOCAL_STORAGE_DECART_KEY, trimmed);
    setApiKeyState(trimmed);
    if (providerRef.current) {
      providerRef.current.setCredentials({ apiKey: trimmed });
    }
  }, []);

  const startSession = useCallback(
    async (cameraStream: MediaStream, product: Product) => {
      const provider = providerRef.current;
      if (!provider) return;

      const garment = getGarmentReference(product.id);
      if (!garment || !garment.isLiveVTOReady) {
        setError(`"${product.name}" does not have a verified Live VTO asset yet.`);
        return;
      }

      setError(null);
      setActiveGarment(garment);

      try {
        await provider.connect(cameraStream, garment);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    },
    []
  );

  const stopSession = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.disconnect();
    }
    setRemoteStream(null);
    setActiveGarment(null);
    setConnectionState('idle');
  }, []);

  const changeGarment = useCallback(async (product: Product): Promise<boolean> => {
    const garment = getGarmentReference(product.id);
    if (!garment || !garment.isLiveVTOReady) {
      console.warn(`[MIRAI] Product ${product.name} not eligible for Live VTO.`);
      return false;
    }

    setActiveGarment(garment);
    if (providerRef.current && providerRef.current.getConnectionState() === 'connected') {
      try {
        await providerRef.current.setGarment(garment);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return false;
      }
    }
    return true;
  }, []);

  return {
    remoteStream,
    connectionState,
    activeGarment,
    isStreaming: connectionState === 'connected' && Boolean(remoteStream),
    error,
    apiKey,
    hasApiKey: Boolean(apiKey.trim()),
    setApiKey,
    startSession,
    stopSession,
    changeGarment,
  };
}