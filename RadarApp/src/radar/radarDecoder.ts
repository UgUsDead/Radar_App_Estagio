/**
 * radarDecoder.ts — Radar telemetry decoder (facade).
 *
 * Delegates all protobuf decoding to protobufDecoder.ts and converts
 * the output to the app's RadarTarget interface for backward compat.
 *
 * This module also re-exports the new flat interface for callers that
 * want direct access to the production decoder.
 */

import {RadarTarget} from '../types';
import {MAX_PROTO_TARGETS} from '../constants';
import {
  decodeRadarFrame,
  DecodedRadarFrame,
  DecodedTarget,
} from './protobufDecoder';

// ── No conversion buffer needed anymore since targets are flat ──
// ── Public API ─────────────────────────

/**
 * Decode binary MQTT payload into { targets, frameNumber }.
 * Returns null on any failure — never throws.
 *
 * NOTE: The returned targets array uses pooled objects. Callers must
 * consume or copy the data before the next call.
 */
export function decodeRadarMessage(
  binary: any,
): {targets: RadarTarget[]; frameNumber: number} | null {
  const frame: DecodedRadarFrame | null = decodeRadarFrame(binary);
  if (!frame) return null;

  // Return a slice (shallow copy of refs) so caller sees stable objects
  return {
    targets: frame.targets as unknown as RadarTarget[],
    frameNumber: frame.frameNumber,
  };
}

// Re-export the new decoder for callers that want the flat interface
export {decodeRadarFrame} from './protobufDecoder';
export type {DecodedRadarFrame, DecodedTarget, DecodedPoint} from './protobufDecoder';
