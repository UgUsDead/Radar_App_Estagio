import { config } from "../config.js";
import type { RadarRuntimeState, SummaryRecord } from "../types.js";
import { average, clamp, variance } from "../utils/math.js";
import { toIso } from "../utils/time.js";

export function createSummaryIfDue(state: RadarRuntimeState, nowMs: number): SummaryRecord | null {
  if (nowMs - state.lastSummaryAt < config.processing.summaryIntervalMs) return null;

  const windowStart = nowMs - config.processing.summaryIntervalMs;
  const frames = state.frameBuffer.filter((frame) => frame.timestamp >= windowStart);
  if (frames.length === 0) return null;

  const heights = frames.flatMap((frame) => frame.targets.map((target) => target.z));
  const speeds = state.speedSamples;

  const activeTargets =
    frames.reduce((acc, frame) => acc + frame.targets.length, 0) / Math.max(frames.length, 1);

  const gaitStability = variance(speeds);
  const postureStability = variance(state.zSamples);

  state.gaitBaseline = state.gaitBaseline === 0 ? gaitStability : state.gaitBaseline * 0.9 + gaitStability * 0.1;
  state.postureBaseline =
    state.postureBaseline === 0 ? postureStability : state.postureBaseline * 0.9 + postureStability * 0.1;

  const movementLevel = clamp(average(speeds) / Math.max(config.processing.maxAbsVelocityMps, 0.1), 0, 1);

  const summary: SummaryRecord = {
    radar_id: state.radarId,
    timestamp: toIso(nowMs),
    avg_height: average(heights),
    movement_level: movementLevel,
    active_targets: Math.round(activeTargets),
    avg_walking_speed: average(speeds),
    distance_moved: state.minuteDistance,
    gait_stability: gaitStability,
    posture_stability: postureStability
  };

  state.minuteDistance = 0;
  state.minuteMovingMs = 0;
  state.speedSamples = [];
  state.zSamples = [];
  state.lastSummaryAt = nowMs;

  return summary;
}
