import type { EventRecord, RadarRuntimeState } from "../types.js";
import { toIso } from "../utils/time.js";

const FALL_DROP_THRESHOLD_M = 0.02;
const FALL_ACCEL_THRESHOLD_MPS2 = 0.05;
const INACTIVITY_SPEED_THRESHOLD_MPS = 0.25;
const INACTIVITY_WINDOW_MS = 2000;
const TARGET_COOLDOWN_MS = 12000;
const RADAR_COOLDOWN_MS = 1200;
const LOW_HEIGHT_THRESHOLD_M = 0.35;
const STANDING_HEIGHT_THRESHOLD_M = 0.45;
const MIN_LOW_FRAMES = 2;

interface TargetSample {
  t: number;
  x: number;
  y: number;
  z: number;
  speed: number;
}

interface FallDetectionOptions {
  thresholdMultiplier?: number;
  riskLevel?: string;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function detectFall(state: RadarRuntimeState, options?: FallDetectionOptions): EventRecord | null {
  const now = Date.now();
  if (now < state.fallCooldownUntil) return null;
  if (state.frameBuffer.length < 4) return null;

  const thresholdMultiplier = Math.min(2, Math.max(0.5, options?.thresholdMultiplier ?? 1));
  const dropThreshold = FALL_DROP_THRESHOLD_M * thresholdMultiplier;
  const accelThreshold = FALL_ACCEL_THRESHOLD_MPS2 * thresholdMultiplier;
  const velocityDropThreshold = 0.005 * thresholdMultiplier;
  const lowHeightThreshold = LOW_HEIGHT_THRESHOLD_M * (1 + (1 - thresholdMultiplier) * 0.3);
  const floorZThreshold = 0.55 * (1 + (1 - thresholdMultiplier) * 0.35);
  const inactivityThreshold = INACTIVITY_SPEED_THRESHOLD_MPS * (1 + (1 - thresholdMultiplier) * 0.3);
  const minLowFrames = Math.max(2, Math.round(MIN_LOW_FRAMES * thresholdMultiplier));

  // Use a 10-second window for detection history
  const windowStart = now - 10000;
  const recent = state.frameBuffer.filter(f => f.timestamp >= windowStart);
  const tracks = new Map<number, TargetSample[]>();

  for (const frame of recent) {
    for (const target of frame.targets) {
      const existing = tracks.get(target.id) ?? [];
      existing.push({
        t: frame.timestamp,
        x: target.x,
        y: target.y,
        z: target.z,
        speed: target.speed,
      });
      tracks.set(target.id, existing);
    }
  }

  type Candidate = {
    targetId: number;
    timestamp: number;
    duration: number;
    severity: number;
    dz: number;
    vDrop: number;
    accel: number;
    x: number;
    y: number;
    z: number;
  };

  const candidates: Candidate[] = [];

  for (const [targetId, samples] of tracks.entries()) {
    if (samples.length < 4) continue;

    const cooldownUntil = state.fallCooldownByTarget[String(targetId)] ?? 0;
    if (now < cooldownUntil) continue;

    const first = samples[0];
    const last = samples[samples.length - 1];
    const dtSec = Math.max((last.t - first.t) / 1000, 0.001);
    if (dtSec < 0.25) continue;

    const dz = first.z - last.z;
    const vDrop = dz / dtSec;

    const mid = samples[Math.floor(samples.length / 2)];
    const dt1 = Math.max((mid.t - first.t) / 1000, 0.001);
    const dt2 = Math.max((last.t - mid.t) / 1000, 0.001);
    const v1 = (first.z - mid.z) / dt1;
    const v2 = (mid.z - last.z) / dt2;
    const accel = Math.abs(v2 - v1) / Math.max(dtSec, 0.001);

    const inactivitySpeeds = samples
      .filter((sample) => last.t - sample.t <= INACTIVITY_WINDOW_MS)
      .map((sample) => sample.speed);
    const avgSpeed = average(inactivitySpeeds);

    const recentLowFrames = samples.filter(
      (sample) => last.t - sample.t <= INACTIVITY_WINDOW_MS && sample.z <= lowHeightThreshold
    ).length;
    const maxHistoricalZ = Math.max(...samples.map((sample) => sample.z));
    const standingToFloorTransition =
      maxHistoricalZ >= STANDING_HEIGHT_THRESHOLD_M &&
      recentLowFrames >= minLowFrames &&
      avgSpeed <= 0.35;

    // Simulator-safe fallback: if a target stays near floor and mostly static
    // for multiple recent frames, treat it as a fall even if drop dynamics
    // were missed due downsampling.
    const persistentLowPosture =
      recentLowFrames >= minLowFrames &&
      last.z <= lowHeightThreshold + 0.05 &&
      avgSpeed <= inactivityThreshold;

    const zNearFloor = last.z <= floorZThreshold;
    const suddenDrop = dz >= dropThreshold;
    const dynamicTrigger = accel >= accelThreshold || vDrop >= velocityDropThreshold;
    const inactiveAfterImpact = avgSpeed <= inactivityThreshold;
    const permissiveSimulatorPattern =
      zNearFloor &&
      (suddenDrop || persistentLowPosture || standingToFloorTransition) &&
      inactiveAfterImpact;

    const hardFallPattern = zNearFloor && suddenDrop && dynamicTrigger && inactiveAfterImpact;

    if (!(hardFallPattern || standingToFloorTransition || persistentLowPosture || permissiveSimulatorPattern)) {
      continue;
    }

    const severityBase = Math.min(1, (dz * 1.1 + accel * 0.25 + vDrop * 0.35) / 2.5);
    const severity =
      standingToFloorTransition || persistentLowPosture
        ? Math.max(0.45, severityBase)
        : severityBase;
    candidates.push({
      targetId,
      timestamp: last.t,
      duration: Math.max(1, Math.round((last.t - first.t) / 1000)),
      severity,
      dz,
      vDrop,
      accel,
      x: last.x,
      y: last.y,
      z: last.z,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.severity - a.severity);
  const selected = candidates[0];

  state.fallCooldownUntil = now + RADAR_COOLDOWN_MS;
  state.fallCooldownByTarget[String(selected.targetId)] = now + TARGET_COOLDOWN_MS;
  state.dayFalls += 1;
  state.dayAlerts += 1;

  return {
    radar_id: state.radarId,
    type: "fall",
    timestamp: toIso(selected.timestamp),
    duration: selected.duration,
    metadata: {
      target_id: selected.targetId,
      estimated_severity: Number(selected.severity.toFixed(3)),
      risk_threshold_multiplier: Number(thresholdMultiplier.toFixed(3)),
      risk_level_applied: options?.riskLevel ?? "medium",
      vertical_drop: Number(selected.dz.toFixed(3)),
      vertical_velocity: Number(selected.vDrop.toFixed(3)),
      acceleration: Number(selected.accel.toFixed(3)),
      location: {
        x: Number(selected.x.toFixed(3)),
        y: Number(selected.y.toFixed(3)),
        z: Number(selected.z.toFixed(3))
      }
    },
    telemetry_snapshot: recent
  };
}
