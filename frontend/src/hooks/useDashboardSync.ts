import { useEffect, useRef } from 'react';
import { API_BASE } from '../config/api';
import type { DashboardSnapshot } from '../types/dashboard';

/**
 * Mirror side: pushes the latest scan / product state to the backend so the dashboard
 * (on the phone or on the mirror screen) can show it live. Sends on change, and at
 * least every 5 s as a heartbeat. Network errors are ignored (the next tick retries).
 */
export function useDashboardSync(pairId: string | undefined, snapshot: DashboardSnapshot) {
  const latest = useRef(snapshot);
  latest.current = snapshot;

  useEffect(() => {
    if (!pairId) return;
    let lastJson = '';
    let lastSent = 0;

    const send = async () => {
      const body = JSON.stringify(latest.current);
      const now = Date.now();
      if (body === lastJson && now - lastSent < 5000) return;
      try {
        await fetch(`${API_BASE}/api/v1/dashboard/${pairId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        lastJson = body;
        lastSent = now;
      } catch {
        /* backend not reachable: retry on next tick */
      }
    };

    send();
    const id = setInterval(send, 1500);
    return () => clearInterval(id);
  }, [pairId]);
}