import type { DailyStatsRecord, RadarRuntimeState, SummaryRecord } from "../types.js";
import { average } from "../utils/math.js";
import { toDay } from "../utils/time.js";

export function buildDailyStats(state: RadarRuntimeState, summary: SummaryRecord): DailyStatsRecord {
  state.dailySpeedSamples.push(summary.avg_walking_speed);
  state.dailyGaitSamples.push(summary.gait_stability);
  state.dailyPostureSamples.push(summary.posture_stability);

  return {
    radar_id: state.radarId,
    date: state.dayDate,
    total_distance: state.dayDistance,
    time_moving: Math.round(state.dayMovingMs / 1000),
    falls_count: state.dayFalls,
    alerts_count: state.dayAlerts,
    avg_walking_speed: average(state.dailySpeedSamples),
    avg_gait_stability: average(state.dailyGaitSamples),
    avg_posture_stability: average(state.dailyPostureSamples)
  };
}

export function resetDailyIfNeeded(state: RadarRuntimeState, nowMs: number): void {
  const day = toDay(nowMs);
  if (state.dayDate === day) return;

  state.dayDate = day;
  state.dayDistance = 0;
  state.dayMovingMs = 0;
  state.dayFalls = 0;
  state.dayAlerts = 0;
  state.dailySpeedSamples = [];
  state.dailyGaitSamples = [];
  state.dailyPostureSamples = [];
}
