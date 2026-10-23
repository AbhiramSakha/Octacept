/**
 * MIRAI — PhoneApp
 *
 * What the customer's phone opens from the QR code (/?dashboard=<id>):
 *   LIVE MIRROR VIEW (what the mirror shows, with the garment) + the full dashboard below it.
 * It goes straight there: no start options, no QR, no microphone.
 */
import React, { useEffect, useState } from 'react';
import { API_BASE } from '../config/api';
import { DashboardPage } from './DashboardPage';

const LiveMirrorImage: React.FC<{ pairId: string }> = ({ pairId }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    let current: string | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/dashboard/${pairId}/frame`, { cache: 'no-store' });
        if (!res.ok) {
          if (alive) setLive(false);
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        if (!alive) {
          URL.revokeObjectURL(url);
          return;
        }
        if (current) URL.revokeObjectURL(current);
        current = url;
        setSrc(url);
        setLive(true);
      } catch {
        if (alive) setLive(false);
      }
    };

    tick();
    const id = setInterval(tick, 600);
    return () => {
      alive = false;
      clearInterval(id);
      if (current) URL.revokeObjectURL(current);
    };
  }, [pairId]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black border border-white/10 aspect-video flex items-center justify-center">
      {src && <img src={src} alt="Live mirror view" className="w-full h-full object-contain" />}
      {!src && (
        <p className="text-neutral-400 text-sm px-6 text-center">Waiting for the mirror view…</p>
      )}
      <span
        className={`absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
          live ? 'bg-red-600 text-white' : 'bg-black/60 text-neutral-400'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-white animate-pulse' : 'bg-neutral-500'}`} />
        {live ? 'LIVE' : 'OFFLINE'}
      </span>
    </div>
  );
};

export const PhoneApp: React.FC<{ pairId: string }> = ({ pairId }) => (
  <DashboardPage pairId={pairId} topSlot={<LiveMirrorImage pairId={pairId} />} />
);

export default PhoneApp;