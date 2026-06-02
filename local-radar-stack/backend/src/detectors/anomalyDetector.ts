import type { EventRecord, RadarRuntimeState } from "../types.js";

/**
 * Anomaly detection disabled as per user request (posture and gait alerts).
 */
export function detectAnomaly(_state: RadarRuntimeState): EventRecord | null {
  return null;
}
