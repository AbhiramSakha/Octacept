import type { BodyMeasurements, ScanStatus } from '../hooks/useBodyMeasurementsV2';

/** What the mirror pushes to the backend and the dashboard (phone or mirror screen) shows. */
export interface DashboardSnapshot {
  status: ScanStatus;
  measurements: BodyMeasurements | null;
  product: { id: string; name?: string } | null;
  selectedSize: string | null;
  recommendedSize: string | null;
  alternateSize: string | null;
}

export interface DashboardResponse {
  snapshot: DashboardSnapshot | null;
  /** seconds since the mirror last pushed data (null = never) */
  age: number | null;
  mobile_connected: boolean;
}