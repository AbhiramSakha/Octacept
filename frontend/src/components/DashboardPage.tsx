/**
 * MIRAI — DashboardPage
 *
 * One dashboard, three places:
 *   • PHONE   (opened from the QR code): the whole page, mobile layout.
 *   • MIRROR  `embedded`: full-screen overlay with a Close button (voice "dashboard").
 *   • MIRROR  `docked`: full-height panel on the right of the mirror (voice "open").
 *
 * It polls the backend every 2 s for the snapshot the mirror pushes (useDashboardSync),
 * so the numbers on the phone follow the person in front of the mirror live.
 */
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { API_BASE } from '../config/api';
import type { DashboardResponse } from '../types/dashboard';
import { CLOTHING_LABEL } from '../hooks/useBodyMeasurementsV2';

interface Props {
  pairId: string;
  /** full-screen overlay on the mirror (voice "dashboard") */
  embedded?: boolean;
  /** extra content shown under the header (the phone puts the live mirror view here) */
  topSlot?: React.ReactNode;
  /** side panel docked on the right of the mirror (voice "open") */
  docked?: boolean;
  onClose?: () => void;
}

const cm = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v} cm`);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">

    <span className="text-neutral-400">{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-2xl bg-white/5 border border-white/10 p-4">
    <h2 className="text-[11px] tracking-widest font-bold text-neutral-400 mb-2">{title}</h2>
    {children}
  </section>
);

export const DashboardPage: React.FC<Props> = ({ pairId, embedded = false, docked = false, topSlot, onClose }) => {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const role = embedded || docked ? 'mirror' : 'mobile';

    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/dashboard/${pairId}?role=${role}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as DashboardResponse;
        if (alive) {
          setData(json);
          setError(null);
        }
      } catch {
        if (alive)
          setError(

            `Cannot reach the backend at ${API_BASE}. On the PC start uvicorn with --host 0.0.0.0, allow ports 5173 and 8000 in Windows Firewall, and keep the phone on the same Wi-Fi.`
          );
      }
    };

    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pairId, embedded, docked]);

  const snap = data?.snapshot ?? null;
  const m = snap?.measurements ?? null;
  const live = data?.age !== null && data?.age !== undefined && data.age < 8;

  return (
    <div
      className={
        docked
          ? 'fixed top-0 right-0 bottom-0 z-[65] w-[min(100vw,440px)] overflow-y-auto border-l border-white/15 bg-black/90 backdrop-blur-2xl text-white text-sm shadow-2xl'
          : `fixed inset-0 overflow-y-auto bg-neutral-950 text-white text-sm ${
              embedded ? 'z-[80]' : 'z-0'
            }`
      }
    >
      <div className="max-w-md md:max-w-2xl mx-auto p-4 pb-10 space-y-3">
        {/* Header */}
        <header className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-lg font-black tracking-widest">MIRAI</h1>

            <p className="text-[11px] text-neutral-400">Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                live
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-neutral-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
              {live ? 'Mirror live' : 'Mirror offline'}
            </span>
            {(embedded || docked) && onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20"
                title="Back to mirror (or say “mirror”)"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </header>

        {topSlot}

        {error && (
          <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 p-3">{error}</div>
        )}

        {!snap && !error && (

          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center text-neutral-300">
            Waiting for the mirror… stand in front of it to start measuring.
          </div>
        )}

        {snap && (
          <>
            {/* Size */}
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500/20 to-violet-500/20 border border-white/10 p-5 flex items-end justify-between">
              <div>
                <div className="text-[11px] tracking-widest font-bold text-neutral-300">YOUR SIZE</div>
                <div className="text-6xl font-black text-emerald-400 leading-none mt-2">
                  {m ? m.size : '—'}
                </div>
              </div>
              <div className="text-right text-neutral-200">
                {snap.status === 'ready' && m ? (
                  <>
                    <div>
                      Chest <b>{m.chestCm} cm</b>
                    </div>
                    <div>
                      Stomach <b>{cm(m.waistCm)}</b>
                    </div>
                  </>
                ) : (
                  <span className="text-amber-300">
                    {snap.status === 'measuring' ? 'Measuring…' : 'Waiting for a person'}
                  </span>
                )}
              </div>
            </div>


            {m && (
              <>
                <Card title="BODY (SKELETON)">
                  <Row label="Height" value={`${m.heightCm} cm`} />
                  <Row label="Weight" value={m.weightKg ? `${m.weightKg} kg` : '—'} />
                  <Row label="Shoulders" value={`${m.shoulderCm} cm`} />
                  <Row label="Torso" value={cm(m.torsoCm)} />
                  <Row label="Arm" value={cm(m.armCm)} />
                  <Row label="Leg / inseam" value={cm(m.legCm)} />
                </Card>

                <Card title="BODY (ESTIMATED GIRTH)">
                  <Row label="Chest" value={`${m.chestCm} cm`} />
                  <Row label="Stomach / waist" value={cm(m.waistCm)} />
                  <Row label="Hip" value={cm(m.hipCm)} />
                  <Row label="BMI" value={m.bmi !== null ? String(m.bmi) : '—'} />
                </Card>

                <Card title="WORN GARMENT">
                  <Row label="Clothing" value={CLOTHING_LABEL[m.clothing]} />
                  <Row label="Length" value={cm(m.garmentLengthCm)} />
                  <Row label="Chest width" value={cm(m.garmentChestWidthCm)} />
                  <Row label="Waist width" value={cm(m.garmentWaistWidthCm)} />
                  <Row label="Hip width" value={cm(m.garmentHipWidthCm)} />
                </Card>
              </>
            )}

            {/* Selected product */}
            <Card title="SELECTED GARMENT">
              {snap.product ? (

                <>
                  <Row label="Product" value={snap.product.name ?? snap.product.id} />
                  <Row label="Selected size" value={snap.selectedSize ?? '—'} />
                  <Row
                    label="Best fit"
                    value={
                      snap.recommendedSize
                        ? snap.alternateSize
                          ? `${snap.recommendedSize} (or ${snap.alternateSize})`
                          : snap.recommendedSize
                        : '—'
                    }
                  />
                </>
              ) : (
                <p className="text-neutral-400">Pick a garment on the mirror to see it here.</p>
              )}
            </Card>
          </>
        )}

        <p className="text-center text-[10px] text-neutral-600 pt-2">Session {pairId}</p>
      </div>
    </div>
  );
};

export default DashboardPage;