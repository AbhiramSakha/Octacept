/**
 * MIRAI — useBodyMeasurements v2 (height + weight + skeleton + waist + worn garment)
 *
 * SCALE
 *   FULL BODY visible -> person's height (nose->ankle = 0.89 x height) gives pixels/cm
 *                        and a 3D scale (cm per MediaPipe world-unit) for bone lengths.
 *   UPPER BODY only   -> face size gives pixels/cm; shoulder width gives the 3D scale.
 *
 * SKELETON (from MediaPipe WORLD landmarks, true 3D, so arm/leg bending and camera
 *   tilt do not shrink the lengths): torso, arm (shoulder->wrist), leg (hip->ankle),
 *   hip-joint width. Inseam ~= leg length (hip joint height ~ crotch + ankle height).
 *
 * WAIST / HIP / CHEST  (silhouette width -> circumference)
 *   A single front camera sees WIDTH only. Depth is estimated from the weight (BMI),
 *   then the body is treated as an ellipse (Ramanujan perimeter). Clothing ease is removed
 *   with the clothing factor. This is an ESTIMATE (typically +-4-6 cm).
 *
 * WORN GARMENT
 *   garment breadth  = silhouette width at chest / waist / hip level (clothes included)
 *   garment length   = shoulder line -> hem row (hem found by a colour edge on the leg line)
 *
 * Silhouette widths are only used when the arms are raised slightly (A-pose),
 * otherwise the arms merge with the torso and inflate the width.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrackingFrame } from '../types/tracking';
import { CHEST_CM, sizeFromChest } from '../sizing/sizeChart';

export type MeasureMethod = 'full-body' | 'face-scale';
export type ClothingClass = 'fitted' | 'regular' | 'loose' | 'bulky';
export type ClothingChoice = ClothingClass | 'auto';

export interface WorldPoint { x: number; y: number; z: number }

/** Extra per-frame data sent by useLiveAR. */
export interface FrameExtra {
  /** Silhouette widths (clothes included) as a fraction of the frame width. */
  widths?: { chest?: number; waist?: number; hip?: number };
  /** Hem row (fraction of frame height) found by the colour-edge detector. */
  hemYNorm?: number;
  /** MediaPipe world landmarks (metres, hip-centred). */
  world?: WorldPoint[];
}

export interface BodyMeasurements {
  heightCm: number;
  weightKg: number | null;
  bmi: number | null;
  // skeleton
  shoulderCm: number;
  torsoCm: number | null;
  armCm: number | null;
  legCm: number | null;
  inseamCm: number | null;
  hipJointCm: number | null;
  // body circumference estimates
  chestCm: number;
  waistCm: number | null; // stomach / waist
  hipCm: number | null;
  size: string;
  // worn garment (clothes included)
  garmentChestWidthCm: number | null;
  garmentWaistWidthCm: number | null;
  garmentHipWidthCm: number | null;
  garmentLengthCm: number | null;
  method: MeasureMethod;
  clothing: ClothingClass;
  clothingAuto: boolean;
}
export type ScanStatus = 'waiting' | 'measuring' | 'ready';

const DEFAULT_HEIGHT_CM = 170;
const WINDOW = 45;
const MIN_SAMPLES = 30;
const MIN_OPTIONAL = 5; // samples needed for optional measurements
const UPDATE_EVERY = 10;
const LOST_MS = 2500; // no valid frame for this long -> drop the old result
const PUBLISH_MS = 400; // max UI update rate once ready (stops re-render storms)
const STABLE_CV = 0.04; // shoulder jitter allowed before a scan counts as 'steady'
const SIL_MAX_MS = 20000; // silhouette mask never stays on longer than this
const MIN_VIS = 0.6;
const LIMB_VIS = 0.5;
const FACE_VIS = 0.5;
const NOSE_TO_ANKLE_RATIO = 0.89;
const EYE_OUTER_CM = 9.0;
const EAR_CM = 14.5;
const CHEST_FROM_SHOULDER = 2.45;
const ARMS_CLEAR_FACTOR = 1.0; // wrist must be this many shoulder-spans from the body centre

const RATIO_FITTED = 1.1;
const RATIO_REGULAR = 1.22;
const RATIO_LOOSE = 1.35;
const CLOTHING_FACTOR: Record<ClothingClass, number> = {
  fitted: 1.0,
  regular: 0.97,
  loose: 0.93,
  bulky: 0.89,
};
export const CLOTHING_LABEL: Record<ClothingClass, string> = {
  fitted: 'Fitted',
  regular: 'Regular',
  loose: 'Loose',
  bulky: 'Jacket / hoodie',
};

const STORAGE_KEY = 'mirai_size_calibration_v2';

interface P { x: number; y: number }
type Scales = Record<MeasureMethod, number>;
type Key =
  | 'shoulder' | 'torso' | 'arm' | 'leg' | 'hipJoint'
  | 'chestSil' | 'waistSil' | 'hipSil' | 'garmentLen';
type Sample = Record<Key, number | null>;

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const d3 = (a: WorldPoint, b: WorldPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const m3 = (a: WorldPoint, b: WorldPoint): WorldPoint => ({
  x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2,
});
const avg = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const medOf = (arr: Sample[], k: Key): number | null => {
  const v = arr.map((s) => s[k]).filter((x): x is number => x !== null);
  return v.length >= MIN_OPTIONAL ? median(v) : null;
};

/** Ellipse perimeter (Ramanujan) from full width and full depth. */
const ellipse = (width: number, depth: number) => {
  const a = width / 2;
  const b = depth / 2;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
};

function classifyClothing(ratio: number): ClothingClass {
  if (ratio < RATIO_FITTED) return 'fitted';
  if (ratio < RATIO_REGULAR) return 'regular';
  if (ratio < RATIO_LOOSE) return 'loose';
  return 'bulky';
}

function loadScales(): Scales {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return { 'full-body': Number(v['full-body']) || 1, 'face-scale': Number(v['face-scale']) || 1 };
    }
  } catch { /* ignore */ }
  return { 'full-body': 1, 'face-scale': 1 };
}

export function useBodyMeasurements(initialHeightCm: number = DEFAULT_HEIGHT_CM) {
  const [status, setStatus] = useState<ScanStatus>('waiting');
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState('Step in front of the mirror');
  const [measurements, setMeasurements] = useState<BodyMeasurements | null>(null);
  const [heightCm, setHeightState] = useState(initialHeightCm);
  const [weightKg, setWeightState] = useState<number | null>(null);
  const [scales, setScales] = useState<Scales>(loadScales);
  const [clothingChoice, setClothingChoiceState] = useState<ClothingChoice>('auto');

  const scalesRef = useRef<Scales>(scales);
  const clothingRef = useRef<ClothingChoice>('auto');
  const statusRef = useRef<ScanStatus>('waiting');
  const heightRef = useRef(initialHeightCm);
  const weightRef = useRef<number | null>(null);
  const methodRef = useRef<MeasureMethod | null>(null);
  const samples = useRef<Sample[]>([]);
  const held = useRef<Partial<Record<Key, number>>>({}); // last good silhouette values
  const ratios = useRef<number[]>([]);
  const lastGood = useRef(0); // last time a frame produced a valid sample
  const lastProgress = useRef(0);
  const lastPublish = useRef(0);
  const lastJson = useRef('');
  const outlierHist = useRef<boolean[]>([]);
  const silRef = useRef(false);
  const silTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wantsSilhouette, setWantsSilhouette] = useState(false);
  const sinceUpdate = useRef(0);
  const outlierRun = useRef(0);
  const lastRawChest = useRef<number | null>(null);
  const lastHint = useRef('Step in front of the mirror');
  const latestFrame = useRef<TrackingFrame | null>(null);

  const setHintOnce = (h: string) => {
    if (h !== lastHint.current) {
      lastHint.current = h;
      setHint(h);
    }
  };
  const setStatusOnce = (s: ScanStatus) => {
    if (statusRef.current !== s) {
      statusRef.current = s;
      setStatus(s);
    }
  };
  /** Segmentation mask on/off with a hard time limit, so it can never stay on (and slow the app) forever. */
  const setSilhouette = (on: boolean) => {
    if (silRef.current === on) return;
    silRef.current = on;
    setWantsSilhouette(on);
    if (silTimer.current) {
      clearTimeout(silTimer.current);
      silTimer.current = null;
    }
    if (on) {
      silTimer.current = setTimeout(() => {
        silRef.current = false;
        setWantsSilhouette(false);
      }, SIL_MAX_MS);
    }
  };
  useEffect(
    () => () => {
      if (silTimer.current) clearTimeout(silTimer.current);
    },
    []
  );

  const clearAll = useCallback(() => {
    samples.current = [];
    held.current = {};
    ratios.current = [];
    sinceUpdate.current = 0;
    outlierRun.current = 0;
    outlierHist.current = [];
    lastProgress.current = 0;
    lastJson.current = '';
    lastPublish.current = 0;
    lastRawChest.current = null;
    setSilhouette(false);
    methodRef.current = null;
    statusRef.current = 'waiting';
    lastHint.current = 'Step in front of the mirror';
    setStatus('waiting');
    setProgress(0);
    setMeasurements(null);
    setHint('Step in front of the mirror');
  }, []);

  const setHeight = useCallback((h: number) => {
    heightRef.current = h;
    setHeightState(h);
    clearAll();
  }, [clearAll]);

  /** Weight only changes the depth model, so no need to restart the scan. */
  const setWeight = useCallback((kg: number | null) => {
    weightRef.current = kg;
    setWeightState(kg);
    sinceUpdate.current = UPDATE_EVERY;
  }, []);

  const setClothing = useCallback((c: ClothingChoice) => {
    clothingRef.current = c;
    setClothingChoiceState(c);
    sinceUpdate.current = UPDATE_EVERY;
  }, []);

  const saveScales = (next: Scales) => {
    scalesRef.current = next;
    setScales(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  /** Tell the mirror the real size of the person standing there (corrects circumferences). */
  const calibrate = useCallback((targetSize: string) => {
    const method = methodRef.current;
    const raw = lastRawChest.current;
    const target = CHEST_CM[targetSize];
    if (!method || !raw || !target) return;
    saveScales({ ...scalesRef.current, [method]: clamp(target / raw, 0.5, 2) });
    sinceUpdate.current = UPDATE_EVERY;
  }, []);

  const clearCalibration = useCallback(() => {
    saveScales({ 'full-body': 1, 'face-scale': 1 });
    sinceUpdate.current = UPDATE_EVERY;
  }, []);

  const feedFrame = useCallback((f: TrackingFrame, extra?: FrameExtra) => {
    latestFrame.current = f;
    const now = Date.now();
    const lm = f.landmarks;

    // Watchdog: no valid frame for LOST_MS (person left, or the model only hallucinates
    // low-confidence landmarks) -> drop the old result instead of showing it forever.
    if (samples.current.length && now - lastGood.current > LOST_MS) clearAll();

    if (lm.length < 33) {
      if (!samples.current.length) setHintOnce('Step in front of the mirror');
      return;
    }

    const vis = (i: number) => lm[i]?.visibility ?? 0;
    if (vis(11) < MIN_VIS || vis(12) < MIN_VIS) return setHintOnce('Show your shoulders to the camera');

    const px = (i: number): P => ({ x: lm[i].x * f.frame_width, y: lm[i].y * f.frame_height });
    const sL = px(11);
    const sR = px(12);
    const shoulderPx = dist(sL, sR);

    if (Math.abs(lm[11].z - lm[12].z) > 0.25) return setHintOnce('Face the camera directly');
    if (Math.abs(sL.y - sR.y) > shoulderPx * 0.15) return setHintOnce('Keep your shoulders level');

    // ── Scale source ────────────────────────────────────────────────────
    const fullBody = [0, 23, 24, 27, 28].every((i) => vis(i) >= MIN_VIS);
    let method: MeasureMethod;
    let pxPerCm = 0;

    if (fullBody) {
      method = 'full-body';
      const bodyPx = dist(px(0), mid(px(27), px(28)));
      pxPerCm = bodyPx / (heightRef.current * NOSE_TO_ANKLE_RATIO);
    } else {
      method = 'face-scale';
      const cands: number[] = [];
      if (vis(3) >= FACE_VIS && vis(6) >= FACE_VIS) cands.push(dist(px(3), px(6)) / EYE_OUTER_CM);
      if (vis(7) >= FACE_VIS && vis(8) >= FACE_VIS) cands.push(dist(px(7), px(8)) / EAR_CM);
      if (!cands.length) return setHintOnce('Look straight at the camera');
      pxPerCm = median(cands);
    }
    if (!isFinite(pxPerCm) || pxPerCm <= 0) return;

    const shoulderCm = shoulderPx / pxPerCm;
    if (shoulderCm < 25 || shoulderCm > 75) return;

    if (methodRef.current !== method) {
      methodRef.current = method;
      samples.current = [];
      held.current = {};
      ratios.current = [];
      sinceUpdate.current = 0;
      outlierRun.current = 0;
    }

    // Different person?
    if (samples.current.length >= 10) {
      const med = median(samples.current.map((s) => s.shoulder as number));
      // Sliding window (not a consecutive counter): alternating good/bad frames can no longer
      // keep an old wrong median alive forever.
      const isOut = Math.abs(shoulderCm - med) / med > 0.15;
      outlierHist.current.push(isOut);
      if (outlierHist.current.length > 20) outlierHist.current.shift();
      if (isOut) {
        if (outlierHist.current.filter(Boolean).length < 12) return;
        samples.current = [];
        held.current = {};
        ratios.current = [];
        sinceUpdate.current = 0;
        outlierRun.current = 0;
        outlierHist.current = [];
        lastProgress.current = 0;
        setSilhouette(true);
        setStatusOnce('measuring');
        setProgress(0);
      }
    }

    // ── Arms clear of the torso? (needed for any silhouette width) ──────
    const midShoulderX = (lm[11].x + lm[12].x) / 2;
    const shoulderSpanN = Math.abs(lm[11].x - lm[12].x);
    const armsClear = [15, 16].every(
      (i) => vis(i) >= LIMB_VIS && Math.abs(lm[i].x - midShoulderX) > shoulderSpanN * ARMS_CLEAR_FACTOR
    );

    // Clothing bulk signal
    if (armsClear && extra?.widths?.chest) {
      const ratio = (extra.widths.chest * f.frame_width) / shoulderPx;
      if (ratio > 0.7 && ratio < 2.2) {
        ratios.current.push(ratio);
        if (ratios.current.length > 40) ratios.current.shift();
      }
    }

    // ── Skeleton from 3D world landmarks ────────────────────────────────
    const hipsVisible = vis(23) >= MIN_VIS && vis(24) >= MIN_VIS;
    const world = extra?.world && extra.world.length >= 33 ? extra.world : null;
    let wScale: number | null = null; // cm per world unit
    if (world) {
      if (fullBody) {
        const ref = d3(world[0], m3(world[27], world[28]));
        if (ref > 0.3) wScale = (heightRef.current * NOSE_TO_ANKLE_RATIO) / ref;
      } else {
        const ws = d3(world[11], world[12]);
        if (ws > 0.1) wScale = shoulderCm / ws;
      }
    }
    const chain = (ids: number[]): number | null => {
      if (!world || !wScale) return null;
      let t = 0;
      for (let i = 0; i < ids.length; i++) {
        if (vis(ids[i]) < LIMB_VIS) return null;
        if (i) t += d3(world[ids[i - 1]], world[ids[i]]);
      }
      return t * wScale;
    };
    const arm = avg([chain([11, 13, 15]), chain([12, 14, 16])]);
    const leg = avg([chain([23, 25, 27]), chain([24, 26, 28])]);

    let torso: number | null = null;
    if (world && wScale && hipsVisible) {
      torso = d3(m3(world[11], world[12]), m3(world[23], world[24])) * wScale;
    } else if (fullBody) {
      torso = dist(mid(sL, sR), mid(px(23), px(24))) / pxPerCm;
    }
    const hipJoint = world && wScale && hipsVisible ? d3(world[23], world[24]) * wScale : null;

    // ── Silhouette widths and garment length ────────────────────────────
    const silCm = (n?: number) => (armsClear && n ? (n * f.frame_width) / pxPerCm : null);
    let garmentLen: number | null = null;
    if (extra?.hemYNorm) {
      const hemY = extra.hemYNorm * f.frame_height;
      const shY = (sL.y + sR.y) / 2;
      if (hemY > shY) garmentLen = (hemY - shY) / pxPerCm;
    }

    lastGood.current = now;
    samples.current.push({
      shoulder: shoulderCm,
      torso,
      arm,
      leg,
      hipJoint,
      chestSil: silCm(extra?.widths?.chest),
      waistSil: silCm(extra?.widths?.waist),
      hipSil: silCm(extra?.widths?.hip),
      garmentLen,
    });
    if (samples.current.length > WINDOW) samples.current.shift();
    sinceUpdate.current++;

    const n = samples.current.length;
    if (n < MIN_SAMPLES) {
      if (statusRef.current === 'waiting') setSilhouette(true);
      setStatusOnce('measuring');
      // update the bar in 5% steps only (was: a React re-render on EVERY frame)
      const p = Math.round((n / MIN_SAMPLES) * 20) / 20;
      if (p !== lastProgress.current) {
        lastProgress.current = p;
        setProgress(p);
      }
      return setHintOnce(
        armsClear ? 'Hold still, measuring…' : 'Raise your arms slightly away from your body'
      );
    }

    // Steadiness gate: do not publish a result while the person is still moving.
    if (statusRef.current !== 'ready') {
      const sh = samples.current.map((s) => s.shoulder as number);
      const mean = sh.reduce((a, b) => a + b, 0) / n;
      const sd = Math.sqrt(sh.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
      if (sd / mean > STABLE_CV) {
        setStatusOnce('measuring');
        return setHintOnce('Hold still, measuring…');
      }
    }

    if (statusRef.current !== 'ready' || sinceUpdate.current >= UPDATE_EVERY) {
      sinceUpdate.current = 0;
      const S = samples.current;
      const pick = (k: Key): number | null => {
        const v = medOf(S, k);
        if (v !== null) held.current[k] = v;
        return v ?? held.current[k] ?? null;
      };

      const rawShoulder = median(S.map((s) => s.shoulder as number));
      const scale = scalesRef.current[method];

      const choice = clothingRef.current;
      const auto = choice === 'auto';
      const clothing: ClothingClass = auto
        ? ratios.current.length >= 5 ? classifyClothing(median(ratios.current)) : 'regular'
        : choice;
      const factor = CLOTHING_FACTOR[clothing];

      const h = heightRef.current;
      const w = weightRef.current;
      const bmi = w ? w / ((h / 100) ** 2) : null;
      const bmiX = (bmi ?? 22) - 22;

      // Chest: shoulder-based estimate, blended with the silhouette ellipse when available
      const chestFromShoulder = rawShoulder * CHEST_FROM_SHOULDER * factor;
      const chestSil = pick('chestSil');
      const chestFromSil = chestSil
        ? ellipse(chestSil * factor, chestSil * factor * clamp(0.68 + bmiX * 0.01, 0.55, 0.85))
        : null;
      const rawChest = chestFromSil ? (chestFromShoulder + chestFromSil) / 2 : chestFromShoulder;
      lastRawChest.current = rawChest;
      const chestCm = Math.round(rawChest * scale);

      const waistSil = pick('waistSil');
      const waistCm = waistSil
        ? Math.round(ellipse(waistSil * factor, waistSil * factor * clamp(0.62 + bmiX * 0.02, 0.55, 0.95)) * scale)
        : null;
      const hipSil = pick('hipSil');
      const hipCm = hipSil
        ? Math.round(ellipse(hipSil * factor, hipSil * factor * clamp(0.66 + bmiX * 0.012, 0.55, 0.9)) * scale)
        : null;

      const legCm = pick('leg');
      const orNull = (v: number | null) => (v === null ? null : r1(v));

      const next: BodyMeasurements = {
        heightCm: h,
        weightKg: w,
        bmi: bmi ? r1(bmi) : null,
        shoulderCm: r1(rawShoulder),
        torsoCm: orNull(pick('torso')),
        armCm: orNull(pick('arm')),
        legCm: orNull(legCm),
        inseamCm: orNull(legCm), // hip-joint height ~ crotch height + ankle height
        hipJointCm: orNull(pick('hipJoint')),
        chestCm,
        waistCm,
        hipCm,
        size: sizeFromChest(chestCm),
        garmentChestWidthCm: orNull(chestSil),
        garmentWaistWidthCm: orNull(waistSil),
        garmentHipWidthCm: orNull(hipSil),
        garmentLengthCm: orNull(pick('garmentLen')),
        method,
        clothing,
        clothingAuto: auto,
      };
      // Publish only when something changed, and at most every PUBLISH_MS once ready.
      const json = JSON.stringify(next);
      if (
        json !== lastJson.current &&
        (statusRef.current !== 'ready' || now - lastPublish.current >= PUBLISH_MS)
      ) {
        lastJson.current = json;
        lastPublish.current = now;
        setMeasurements(next);
      }
      lastProgress.current = 1;
      setProgress(1);
      setStatusOnce('ready');
      if (next.waistCm !== null) setSilhouette(false); // waist known -> mask no longer needed
    }
    setHintOnce(armsClear ? '' : 'Raise your arms slightly away from your body for waist width');
  }, [clearAll]);

  const calibrated = measurements ? scales[measurements.method] !== 1 : false;

  // wantsSilhouette (state above): mask is on while measuring, off once the waist is known
  // or after SIL_MAX_MS, whichever comes first.

  return {
    status,
    progress,
    hint,
    measurements,
    heightCm,
    setHeight,
    weightKg,
    setWeight,
    clothingChoice,
    setClothing,
    calibrated,
    calibrate,
    clearCalibration,
    wantsSilhouette,
    reset: clearAll,
    feedFrame,
    latestFrame,
  };
}