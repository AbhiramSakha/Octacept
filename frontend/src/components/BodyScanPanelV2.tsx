/**
 * MIRAI — BodyScanPanel (AUTOMATIC)
 * Live result while the skeleton lines are tracking:
 *   YOUR SIZE (big) + skeleton measurements + estimated girth + worn-garment size
 *   + size chart with the detected size lit up.
 * Works seated / close (face-scale) or full body (height-scale).
 * Height + weight inputs improve accuracy. "Calibrate" lets you tell the mirror
 * one person's real size (e.g. 3XL).
 */
import React, { useEffect, useState } from 'react';
import type { BodyMeasurements, ClothingChoice, ScanStatus } from '../hooks/useBodyMeasurementsV2';
import { CLOTHING_LABEL } from '../hooks/useBodyMeasurementsV2';
import { CHEST_CM } from '../sizing/sizeChart';

interface Props {
  status: ScanStatus;
  progress: number;
  hint: string;
  measurements: BodyMeasurements | null;
  heightCm: number;
  onHeightChange: (cm: number) => void;
  weightKg: number | null;
  onWeightChange: (kg: number | null) => void;
  clothingChoice: ClothingChoice;
  onClothingChange: (c: ClothingChoice) => void;
  calibrated: boolean;
  onCalibrate: (size: string) => void;
  onClearCalibration: () => void;
  /** Throw away the current scan and measure again. */
  onRescan: () => void;
}

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

const cm = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v} cm`);

export const BodyScanPanelV2: React.FC<Props> = ({
  status,
  progress,
  hint,
  measurements,
  heightCm,
  onHeightChange,
  weightKg,
  onWeightChange,
  clothingChoice,
  onClothingChange,
  calibrated,
  onCalibrate,
  onClearCalibration,
  onRescan,
}) => {
  const [heightText, setHeightText] = useState(String(heightCm));
  const [weightText, setWeightText] = useState(weightKg ? String(weightKg) : '');
  const [calSize, setCalSize] = useState('3XL');
  useEffect(() => setHeightText(String(heightCm)), [heightCm]);
  useEffect(() => setWeightText(weightKg ? String(weightKg) : ''), [weightKg]);

  const commitHeight = () => {
    const h = Number(heightText);
    if (h >= 120 && h <= 220 && h !== heightCm) onHeightChange(h);
    else setHeightText(String(heightCm));
  };

  const commitWeight = () => {
    if (weightText.trim() === '') {
      if (weightKg !== null) onWeightChange(null);
      return;
    }
    const w = Number(weightText);
    if (w >= 30 && w <= 250) {
      if (w !== weightKg) onWeightChange(w);
    } else {
      setWeightText(weightKg ? String(weightKg) : '');
    }
  };

  const ready = status === 'ready' && measurements;

  return (
    <div className="absolute left-6 top-24 bottom-6 overflow-y-auto z-20 pointer-events-auto w-80 bg-black/85 backdrop-blur-2xl border border-white/15 rounded-2xl p-4 text-white text-xs">
      {ready ? (
        <>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] text-neutral-400 font-semibold">YOUR SIZE</div>
              <div className="text-5xl font-black text-emerald-400 leading-none mt-1">
                {measurements.size}
              </div>
            </div>
            <div className="text-right space-y-0.5 text-neutral-300">
              <div>
                Shoulders <b>{measurements.shoulderCm} cm</b>
              </div>
              <div>
                Chest <b>{measurements.chestCm} cm</b>
              </div>
              <div>
                Stomach <b>{cm(measurements.waistCm)}</b>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-neutral-500">
            {measurements.method === 'full-body'
              ? 'Scale: your height (full body)'
              : 'Scale: face size (upper body)'}
            {calibrated ? ' · calibrated' : ''}
          </p>
          <p className="text-[10px] text-neutral-500">
            Wearing: <b className="text-neutral-300">{CLOTHING_LABEL[measurements.clothing]}</b>
            {measurements.clothingAuto ? ' (auto-detected)' : ' (selected)'}
          </p>
          {hint && <p className="mt-1 text-amber-300">{hint}</p>}

          {/* Skeleton / girth / worn garment details */}
          <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-x-3 gap-y-1 text-neutral-300">
            <div className="col-span-2 text-[10px] text-neutral-400 font-semibold">
              BODY (skeleton)
            </div>
            <div>
              Height <b>{measurements.heightCm} cm</b>
            </div>
            <div>
              Weight <b>{measurements.weightKg ? `${measurements.weightKg} kg` : '—'}</b>
            </div>
            <div>
              Torso <b>{cm(measurements.torsoCm)}</b>
            </div>
            <div>
              Arm <b>{cm(measurements.armCm)}</b>
            </div>
            <div>
              Leg / inseam <b>{cm(measurements.legCm)}</b>
            </div>
            <div>
              Hip joints <b>{cm(measurements.hipJointCm)}</b>
            </div>

            <div className="col-span-2 text-[10px] text-neutral-400 font-semibold mt-1">
              BODY (estimated girth)
            </div>
            <div>
              Chest <b>{measurements.chestCm} cm</b>
            </div>
            <div>
              Stomach / waist <b>{cm(measurements.waistCm)}</b>
            </div>
            <div>
              Hip <b>{cm(measurements.hipCm)}</b>
            </div>
            <div>
              BMI <b>{measurements.bmi ?? '—'}</b>
            </div>

            <div className="col-span-2 text-[10px] text-neutral-400 font-semibold mt-1">
              WORN GARMENT
            </div>
            <div>
              Length <b>{cm(measurements.garmentLengthCm)}</b>
            </div>
            <div>
              Chest width <b>{cm(measurements.garmentChestWidthCm)}</b>
            </div>
            <div>
              Waist width <b>{cm(measurements.garmentWaistWidthCm)}</b>
            </div>
            <div>
              Hip width <b>{cm(measurements.garmentHipWidthCm)}</b>
            </div>
          </div>
          {measurements.waistCm === null && (
            <p className="mt-2 text-amber-300">
              Raise your arms slightly away from your body to measure stomach and garment width.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="text-[10px] text-neutral-400 font-semibold mb-1">AUTO SIZE</div>
          <p className="text-neutral-200">{hint || 'Hold still, measuring…'}</p>
          {status === 'measuring' && (
            <div className="h-1.5 mt-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
          {status === 'waiting' && (
            <p className="mt-2 text-neutral-500">
              Stand facing the camera, shoulders visible. Raise arms slightly for best results.
            </p>
          )}
        </>
      )}

      {/* Size chart: the detected size lights up automatically */}
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="text-[10px] text-neutral-400 font-semibold mb-1.5">
          SIZE CHART · CHEST (cm)
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {SIZE_ORDER.map((size) => {
            const active = ready && measurements.size === size;
            return (
              <div
                key={size}
                className={`rounded-lg py-1.5 border transition-all ${
                  active
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 scale-110 shadow-md shadow-emerald-900/50'
                    : 'bg-white/5 border-white/10 text-neutral-400'
                }`}
              >
                <div className="font-black text-[11px]">{size}</div>
                <div className="text-[10px] opacity-80">{CHEST_CM[size]}</div>
              </div>
            );
          })}
        </div>
        {ready && (
          <p className="mt-2 text-neutral-400">
            Chest <b className="text-white">{measurements.chestCm} cm</b> → closest size{' '}
            <b className="text-emerald-400">{measurements.size}</b>.
          </p>
        )}
      </div>

      {/* Clothing: the camera cannot see through clothes, so choose Auto or set it */}
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="text-[10px] text-neutral-400 font-semibold mb-1.5">WHAT ARE YOU WEARING?</div>
        <select
          value={clothingChoice}
          onChange={(e) => onClothingChange(e.target.value as ClothingChoice)}
          className="w-full px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-white"
        >
          <option value="auto" className="text-black">Auto-detect</option>
          <option value="fitted" className="text-black">Fitted / tight</option>
          <option value="regular" className="text-black">Regular shirt</option>
          <option value="loose" className="text-black">Loose / oversized</option>
          <option value="bulky" className="text-black">Jacket / hoodie</option>
        </select>
      </div>

      {/* Calibration: teach the mirror one known size */}
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="text-[10px] text-neutral-400 font-semibold mb-1.5">
          CALIBRATE (person in front is…)
        </div>
        <div className="flex items-center gap-2">
          <select
            value={calSize}
            onChange={(e) => setCalSize(e.target.value)}
            className="px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-white"
          >
            {SIZE_ORDER.map((s) => (
              <option key={s} value={s} className="text-black">
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => onCalibrate(calSize)}
            disabled={!ready}
            className="flex-1 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-bold"
          >
            Set my size
          </button>
          {calibrated && (
            <button
              onClick={onClearCalibration}
              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20"
              title="Remove calibration"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Height + weight */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10 flex-wrap">
        <span className="text-neutral-400" title="Used when your full body is visible">
          Height
        </span>
        <input
          type="number"
          min={120}
          max={220}
          value={heightText}
          onChange={(e) => setHeightText(e.target.value)}
          onBlur={commitHeight}
          onKeyDown={(e) => e.key === 'Enter' && commitHeight()}
          className="w-16 px-2 py-1 rounded-lg bg-white/10 border border-white/10 outline-none focus:border-violet-400"
        />
        <span className="text-neutral-400">cm</span>

        <span className="text-neutral-400 ml-2" title="Improves stomach / chest / hip estimates">
          Weight
        </span>
        <input
          type="number"
          min={30}
          max={250}
          placeholder="kg"
          value={weightText}
          onChange={(e) => setWeightText(e.target.value)}
          onBlur={commitWeight}
          onKeyDown={(e) => e.key === 'Enter' && commitWeight()}
          className="w-16 px-2 py-1 rounded-lg bg-white/10 border border-white/10 outline-none focus:border-violet-400"
        />
        <span className="text-neutral-400">kg</span>
      </div>

      <button
        onClick={onRescan}
        className="mt-3 w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold"
      >
        Re-measure (reset scan)
      </button>
    </div>
  );
};

export default BodyScanPanelV2;