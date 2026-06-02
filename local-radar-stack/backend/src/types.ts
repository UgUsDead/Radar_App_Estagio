export type Endianness = "little" | "big";

export interface RadarTarget {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  snr?: number;
}

export interface DecodedFrame {
  radarId: string;
  timestamp: number;
  endianness: Endianness;
  targets: RadarTarget[];
}

export interface EventRecord {
  owner_id?: number;
  radar_id: string;
  type: "fall" | "anomaly" | "departure" | "arrival" | "transition" | "staff_entry" | "dwell";
  timestamp: string;
  duration: number;
  metadata: Record<string, unknown>;
  room_id?: number;
  room_name?: string;
  patient_name?: string;
  telemetry_snapshot?: unknown[];
}

export interface SummaryRecord {
  owner_id?: number;
  radar_id: string;
  timestamp: string;
  avg_height: number;
  movement_level: number;
  active_targets: number;
  avg_walking_speed: number;
  distance_moved: number;
  gait_stability: number;
  posture_stability: number;
}

export interface DailyStatsRecord {
  owner_id?: number;
  radar_id: string;
  date: string;
  total_distance: number;
  time_moving: number;
  falls_count: number;
  alerts_count: number;
  avg_walking_speed: number;
  avg_gait_stability: number;
  avg_posture_stability: number;
}

export interface FrameStats {
  droppedFrames: number;
  processedFrames: number;
}

export interface BehaviorZoneState {
  /** The zone the target has been confirmed to be inside (after passing the confirmation threshold) */
  confirmedZoneId: string | null;
  confirmedZoneBehavior: "none" | "departure" | "arrival" | "transition" | "dwell" | null;
  confirmedSince: number | null;
  /** Whether the entry alert has already been sent for this confirmed zone visit */
  entryAlertFired: boolean;
  /** Whether the dwell alert has already been sent for this confirmed zone visit */
  dwellAlertFired: boolean;
  /** The zone the target is currently being observed in (not yet confirmed) */
  pendingZoneId: string | null;
  pendingSince: number;
  /** Timestamp after which a jitter blip is forgiven (prevents reset on brief flickers) */
  jitterGraceUntil: number;
  /** Timestamp of the last event emitted for this target (for suppression) */
  lastEventAt: number;
}

export interface RadarRuntimeState extends FrameStats {
  radarId: string;
  frameBuffer: DecodedFrame[];
  lastSummaryAt: number;
  lastDownsampleAt: number;
  lastCentroid?: { x: number; y: number; z: number; t: number };
  minuteDistance: number;
  dayDistance: number;
  minuteMovingMs: number;
  dayMovingMs: number;
  speedSamples: number[];
  zSamples: number[];
  gaitBaseline: number;
  postureBaseline: number;
  fallCooldownUntil: number;
  fallCooldownByTarget: Record<string, number>;
  anomalyCooldownUntil: number;
  dailySpeedSamples: number[];
  dailyGaitSamples: number[];
  dailyPostureSamples: number[];
  dayFalls: number;
  dayAlerts: number;
  dayDate: string;
  behavioralState: Record<number, BehaviorZoneState>;
}

export interface EventRowResponse {
  id: number;
  radar_id: string;
  type: string;
  timestamp: string;
  room_name: string | null;
  patient_name: string | null;
  metadata?: Record<string, unknown>;
  alert_status: "new" | "acknowledged" | "resolved" | "closed";
  escalation_level: "new" | "level_1" | "level_2" | "level_3";
  is_critical: boolean;
  alert_priority: "low" | "medium" | "high";
}

export interface MonitorHealthResponse {
  ok: boolean;
  queueDepth: { events: number; summaries: number };
  flush: {
    lastFlushDurationMs: number;
    lastFlushAt: string | null;
    lastFlushEventCount: number;
    lastFlushSummaryCount: number;
    totalFlushes: number;
    totalFlushedEvents: number;
    totalFlushedSummaries: number;
  };
  heartbeat: {
    online: number;
    offline: number;
    total: number;
    oldestLastSeenSeconds: number | null;
    newestLastSeenSeconds: number | null;
  };
  messageRates: {
    totalMessages: number;
    totalBytes: number;
    msgsPerSecond: number;
    bytesPerSecond: number;
  };
  ingestLag: Array<{ radarId: string; latestMs: number; averageMs: number; maxMs: number; samples: number }>;
  generatedAt: string;
}
