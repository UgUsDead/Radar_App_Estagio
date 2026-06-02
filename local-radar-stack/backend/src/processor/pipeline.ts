import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { config } from "../config.js";
import { detectBehavior } from "../detectors/behaviorDetector.js";
import { detectAnomaly } from "../detectors/anomalyDetector.js";
import { detectFall } from "../detectors/fallDetector.js";
import { logger } from "../logger.js";
import { buildDailyStats, resetDailyIfNeeded } from "../services/dailyStatsService.js";
import { riskProfileService } from "../services/riskProfileService.js";
import { createSummaryIfDue } from "../services/summaryService.js";
import type { RadarRepository } from "../db/repository.js";
import type { DecodedFrame, EventRecord, RadarRuntimeState } from "../types.js";
import type { PushNotificationService } from "../services/pushNotificationService.js";
import { average, distance3d } from "../utils/math.js";
import { toDay, toIso } from "../utils/time.js";
import { HeatmapAggregationService } from "../services/heatmapService.js";

const RISK_PROFILE_CACHE_TTL_MS = 30_000;
const ZONE_CACHE_TTL_MS = 10_000;
const SNAPSHOT_BEFORE_SEC = 10;
const SNAPSHOT_AFTER_SEC = 5;

type ZoneType = "bedside" | "bathroom" | "doorway" | "custom";
type ZonePriority = "low" | "medium" | "high";

interface ZonePoint {
  x: number;
  y: number;
}

interface ZoneConfig {
  id: string;
  name: string;
  type: ZoneType;
  behavior: "none" | "departure" | "arrival" | "transition" | "dwell";
  polygon: ZonePoint[];
  priority: ZonePriority;
  triggersAlert: boolean;
  color?: string;
  dwellMinutes?: number;
  alertSchedule?: {
    startHour: number;
    endHour: number;
  };
}

interface CachedZones {
  zones: ZoneConfig[];
  fetchedAt: number;
}

interface CachedRiskSensitivity {
  ownerId: number | null;
  thresholdMultiplier: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  isAssigned: boolean;
  patientId: number | null;
  patientName?: string;
  roomId: number | null;
  roomName?: string;
  radarHeightMeters: number;
  fetchedAt: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseZones(value: unknown): ZoneConfig[] {
  if (!Array.isArray(value)) return [];

  const zones: ZoneConfig[] = [];
  for (const item of value) {
    const zone = asRecord(item);
    const id = typeof zone.id === "string" ? zone.id.trim() : "";
    const name = typeof zone.name === "string" ? zone.name.trim() : "";
    const typeRaw = typeof zone.type === "string" ? zone.type : "custom";
    const type: ZoneType = ["bedside", "bathroom", "doorway", "custom"].includes(typeRaw)
      ? (typeRaw as ZoneType)
      : "custom";

    if (!id || !name || !Array.isArray(zone.polygon)) continue;

    const polygon = zone.polygon
      .map((point) => {
        const parsed = asRecord(point);
        const x = Number(parsed.x);
        const y = Number(parsed.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
      })
      .filter((point): point is ZonePoint => point !== null);

    if (polygon.length < 3) continue;

    const priorityRaw = typeof zone.priority === "string" ? zone.priority : "medium";
    const priority: ZonePriority =
      priorityRaw === "low" || priorityRaw === "medium" || priorityRaw === "high"
        ? (priorityRaw as ZonePriority)
        : "medium";

    const triggersAlert = typeof zone.triggersAlert === "boolean" ? zone.triggersAlert : true;
    const color = typeof zone.color === "string" ? zone.color : undefined;
    
    let alertSchedule: ZoneConfig["alertSchedule"];
    const sched = asRecord(zone.alertSchedule);
    if (typeof sched.startHour === "number" && typeof sched.endHour === "number") {
      alertSchedule = {
        startHour: Math.max(0, Math.min(23, sched.startHour)),
        endHour: Math.max(0, Math.min(23, sched.endHour))
      };
    }

    const behaviorRaw = typeof zone.behavior === "string" ? zone.behavior : "none";
     const behavior: ZoneConfig["behavior"] =
      behaviorRaw === "none" || behaviorRaw === "departure" || behaviorRaw === "arrival" || behaviorRaw === "transition" || behaviorRaw === "dwell"
        ? (behaviorRaw as any)
        : "none";

    const dwellMinutes = typeof zone.dwellMinutes === "number" ? zone.dwellMinutes : 5;

    zones.push({ id, name, type, behavior, polygon, priority, triggersAlert, color, alertSchedule, dwellMinutes });
  }

  return zones;
}

function pointInPolygon(x: number, y: number, polygon: ZonePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function defaultPriorityForZone(zoneType: ZoneType, eventType: EventRecord["type"]): ZonePriority {
  if (eventType === "fall") return "high";
  return "medium";
}

function ensureState(map: Map<string, RadarRuntimeState>, radarId: string, now: number): RadarRuntimeState {
  let state = map.get(radarId);
  if (!state) {
    state = {
      radarId,
      frameBuffer: [],
      droppedFrames: 0,
      processedFrames: 0,
      lastSummaryAt: now,
      lastDownsampleAt: 0,
      minuteDistance: 0,
      dayDistance: 0,
      minuteMovingMs: 0,
      dayMovingMs: 0,
      speedSamples: [],
      zSamples: [],
      gaitBaseline: 0,
      postureBaseline: 0,
      fallCooldownUntil: 0,
      fallCooldownByTarget: {},
      anomalyCooldownUntil: 0,
      dailySpeedSamples: [],
      dailyGaitSamples: [],
      dailyPostureSamples: [],
      dayFalls: 0,
      dayAlerts: 0,
      dayDate: toDay(now),
      behavioralState: {}
    };
    map.set(radarId, state);
  }
  return state;
}

function centroid(frame: DecodedFrame): { x: number; y: number; z: number } {
  const count = frame.targets.length;
  const sum = frame.targets.reduce(
    (acc, target) => {
      acc.x += target.x;
      acc.y += target.y;
      acc.z += target.z;
      return acc;
    },
    { x: 0, y: 0, z: 0 }
  );

  return {
    x: sum.x / count,
    y: sum.y / count,
    z: sum.z / count
  };
}

function pruneBuffer(state: RadarRuntimeState, now: number): void {
  const start = now - config.processing.frameWindowMs;
  state.frameBuffer = state.frameBuffer.filter((frame) => frame.timestamp >= start);
}

function downsampleAndAccumulate(state: RadarRuntimeState, frame: DecodedFrame): void {
  if (frame.timestamp - state.lastDownsampleAt < config.processing.downsampleIntervalMs) return;

  const c = centroid(frame);
  state.zSamples.push(c.z);
  state.lastDownsampleAt = frame.timestamp;

  if (!state.lastCentroid) {
    state.lastCentroid = { ...c, t: frame.timestamp };
    return;
  }

  const dtMs = frame.timestamp - state.lastCentroid.t;
  if (dtMs <= 0) {
    state.lastCentroid = { ...c, t: frame.timestamp };
    return;
  }

  const distance = distance3d(c, state.lastCentroid);
  if (distance < config.processing.jitterMeters) {
    state.lastCentroid = { ...c, t: frame.timestamp };
    return;
  }

  const dtSec = dtMs / 1000;
  const speed = distance / dtSec;

  if (speed <= config.processing.maxAbsVelocityMps) {
    state.minuteDistance += distance;
    state.dayDistance += distance;
    state.minuteMovingMs += dtMs;
    state.dayMovingMs += dtMs;
    state.speedSamples.push(speed);
  }

  state.lastCentroid = { ...c, t: frame.timestamp };
}

export class RadarPipeline {
  private readonly states = new Map<string, RadarRuntimeState>();
  private readonly riskSensitivityCache = new Map<string, CachedRiskSensitivity>();
  private readonly zoneCache = new Map<string, CachedZones>();
  private readonly collectingEvents = new Map<string, { uuid: string; radarId: string; frames: any[]; stopAt: number }>();
  private readonly activeIncidents = new Map<string, { eventTimestamp: number; eventUuid?: string }>();
  private currentGeneration = 0;

  public constructor(
    private readonly repository: RadarRepository,
    private readonly heatmapService?: HeatmapAggregationService,
    private readonly eventEmitter?: EventEmitter,
    private readonly pushNotificationService?: PushNotificationService,
  ) { }

  public reset() {
    this.currentGeneration++;
    this.states.clear();
    this.riskSensitivityCache.clear();
    this.zoneCache.clear();
    this.collectingEvents.clear();
    this.activeIncidents.clear();
    logger.info({ generation: this.currentGeneration }, "Radar pipeline state reset");
  }

  private async triggerMedicalEvent(event: EventRecord, zones: ZoneConfig[], frame: DecodedFrame, state: RadarRuntimeState) {
    const enriched = this.applyZoneContext(event, zones);
    const eventUuid = randomUUID();
    const now = frame.timestamp;

    // Tag for collection
    enriched.metadata.collecting_uuid = eventUuid;
    enriched.metadata.is_collecting = true;

    // Initialize frames with either pre-populated snapshot (falls) or history from buffer
    let initialFrames: any[] = enriched.telemetry_snapshot || [];
    if (initialFrames.length === 0) {
      // For zone/behavior alerts, we want context around the transition.
      // We take up to SNAPSHOT_BEFORE_SEC (10s) before the behavior started, 
      // but we cap it to 15s before the trigger to avoid massive snapshots.
      const behaviorStart = (enriched.metadata.behavior_start_timestamp as number) || now;
      const maxHistory = now - 15000; 
      const historyStart = Math.max(behaviorStart - (SNAPSHOT_BEFORE_SEC * 1000), maxHistory);
      
      initialFrames = state.frameBuffer.filter(f => f.timestamp >= historyStart && f.timestamp <= now);
    }

    this.collectingEvents.set(eventUuid, {
      uuid: eventUuid,
      radarId: frame.radarId,
      frames: initialFrames,
      stopAt: now + (SNAPSHOT_AFTER_SEC * 1000)
    });

    this.repository.enqueueEvent(enriched);
    
    // Immediate persistence for critical events
    void this.repository.flushEventsNow().catch(err => {
      logger.error({ err, eventUuid }, "Failed to perform immediate event flush");
    });

    // Real-time broadcast if emitter is present
    if (this.eventEmitter) {
      this.eventEmitter.emit("event", enriched);
    }

    // Send push notification for fall events
    if (enriched.type === "fall" && this.pushNotificationService) {
      void this.pushNotificationService.sendFallAlert(enriched).catch((err) => {
        logger.error({ err }, "Failed to send fall push notification");
      });
    }

    this.activeIncidents.set(frame.radarId, { eventTimestamp: now, eventUuid });
    logger.warn({ radarId: frame.radarId, type: event.type }, `${event.type.toUpperCase()} triggered - capturing replay`);
  }

  public async ingest(frame: DecodedFrame): Promise<void> {
    const generationAtStart = this.currentGeneration;
    const now = frame.timestamp;
    const state = ensureState(this.states, frame.radarId, now);

    resetDailyIfNeeded(state, now);

    const sensitivity = await this.getRiskSensitivity(frame.radarId);
    const ownerId = sensitivity.ownerId;
    if (ownerId === null) {
      if (this.currentGeneration === generationAtStart) {
        await this.repository.touchRadar(frame.radarId, toIso(now));
      }
      return;
    }


    state.frameBuffer.push(frame);
    pruneBuffer(state, now);
    state.processedFrames += 1;
    downsampleAndAccumulate(state, frame);

    if (sensitivity.patientId && this.heatmapService && frame.targets.length > 0) {
      // Track movement for heatmap. Use a 0.1s default frame duration if not provided.
      const target = frame.targets[0];
      this.heatmapService.track(ownerId, sensitivity.patientId, target.x, target.y, 0.1);
    }

    const zones = await this.getZones(frame.radarId);

    let eventTriggered = false;
    
    // Only run detections if the radar is assigned to a room
    if (sensitivity.isAssigned) {
      const fallEvent = detectFall(state, {
        thresholdMultiplier: sensitivity.thresholdMultiplier,
        riskLevel: sensitivity.riskLevel,
      });
      if (fallEvent) {
        fallEvent.owner_id = ownerId;
        fallEvent.room_id = sensitivity.roomId ?? undefined;
        fallEvent.room_name = sensitivity.roomName;
        fallEvent.patient_name = sensitivity.patientName;
        this.triggerMedicalEvent(fallEvent, zones, frame, state);
        eventTriggered = true;
      }

      const behaviorEvents = detectBehavior(state, frame, zones, { riskLevel: sensitivity.riskLevel });
      for (const bEvent of behaviorEvents) {
        bEvent.owner_id = ownerId;
        bEvent.room_id = sensitivity.roomId ?? undefined;
        bEvent.room_name = sensitivity.roomName;
        bEvent.patient_name = sensitivity.patientName;
        this.triggerMedicalEvent(bEvent, zones, frame, state);
        eventTriggered = true;
      }

      // Only run anomaly detection if no specific medical/behavior event was triggered
      if (!eventTriggered) {
        const anomalyEvent = detectAnomaly(state);
        if (anomalyEvent) {
          anomalyEvent.owner_id = ownerId;
          anomalyEvent.room_id = sensitivity.roomId ?? undefined;
          anomalyEvent.room_name = sensitivity.roomName;
          anomalyEvent.patient_name = sensitivity.patientName;
          this.triggerMedicalEvent(anomalyEvent, zones, frame, state);
        }
      }
    }

    // Staff Presence Detection
    const incident = this.activeIncidents.get(frame.radarId);
    if (incident && frame.targets.length > 1) {
      const responseTimeMs = now - incident.eventTimestamp;
      // Only log if it's been at least 2 seconds (to avoid phantom multi-targets during fall)
      if (responseTimeMs > 2000) {
        const staffEvent: EventRecord = {
          owner_id: ownerId,
          radar_id: frame.radarId,
          type: "staff_entry",
          timestamp: toIso(now),
          duration: 0,
          metadata: {
            response_time_ms: responseTimeMs,
            trigger_event_uuid: incident.eventUuid,
            clinical_note: `Funcionário chegou ${Math.round(responseTimeMs / 1000)}s após o incidente.`
          }
        };
        this.repository.enqueueEvent(staffEvent);
        this.activeIncidents.delete(frame.radarId); // Incident "responded to"
        logger.info({ radarId: frame.radarId, responseTimeMs }, "Staff presence detected - Incident cleared from active monitor");
      }
    }

    const summary = createSummaryIfDue(state, now);
    if (summary) {
      summary.owner_id = ownerId;
      this.repository.enqueueSummary(summary);
      const daily = buildDailyStats(state, summary);
      daily.owner_id = ownerId;
      await this.repository.upsertDailyStats(daily);
      logger.info(
        {
          radarId: frame.radarId,
          avgSpeed: Number(average(state.speedSamples).toFixed(3)),
          summaryAt: toIso(now)
        },
        "Summary generated"
      );
    }

    if (this.currentGeneration !== generationAtStart) {
      logger.debug({ radarId: frame.radarId }, "Aborting touchRadar due to pipeline reset during ingestion");
      return;
    }

    await this.repository.touchRadar(frame.radarId, toIso(now), ownerId);

    // Process collecting events
    for (const [uuid, coll] of this.collectingEvents.entries()) {
      if (coll.radarId === frame.radarId) {
        coll.frames.push(frame);
      }
      if (now >= coll.stopAt) {
        // Window closed, finalize in DB
        void this.repository.finalizeEventTelemetry(uuid, coll.frames);
        this.collectingEvents.delete(uuid);
      }
    }
  }

  public countDrop(radarId: string): void {
    const state = ensureState(this.states, radarId, Date.now());
    state.droppedFrames += 1;
  }

  private async getRiskSensitivity(radarId: string): Promise<CachedRiskSensitivity> {
    const now = Date.now();
    const cached = this.riskSensitivityCache.get(radarId);
    if (cached && now - cached.fetchedAt < RISK_PROFILE_CACHE_TTL_MS) {
      return cached;
    }

    const { rows } = await this.repository.pool.query(
      `SELECT d.owner_id, d.room_id, r.name as room_name, d.metadata as device_metadata, 
              r.metadata as room_metadata, p.id as patient_id, p.name as patient_name, p.metadata as patient_metadata
       FROM radar_devices d
       LEFT JOIN rooms r ON r.id = d.room_id
       LEFT JOIN patients p ON p.room_id = d.room_id
       WHERE d.id = $1`,
      [radarId]
    );

    const ownerId = rows.length > 0 && rows[0].owner_id !== null ? Number(rows[0].owner_id) : null;
    const isAssigned = ownerId !== null && rows.length > 0 && rows[0].room_id !== null;
    const patientMetadata = rows.length > 0 ? asRecord(rows[0].patient_metadata) : {};
    const roomMetadata = rows.length > 0 ? asRecord(rows[0].room_metadata) : {};
    const roomModel = asRecord(roomMetadata.zone_room_model ?? roomMetadata);

    const profile = riskProfileService.getRiskProfile(patientMetadata);
    
    // Use radarHeight from room metadata, default to 2.5
    const radarHeightMeters = Number(roomModel.radarHeightMeters) || 2.5;

    const resolved: CachedRiskSensitivity = {
      ownerId,
      thresholdMultiplier: Math.min(2, Math.max(0.5, profile.fallThresholdMultiplier)),
      riskLevel: profile.level,
      isAssigned,
      patientId: rows.length > 0 ? rows[0].patient_id : null,
      patientName: rows.length > 0 ? rows[0].patient_name : undefined,
      roomId: rows.length > 0 && rows[0].room_id !== null ? Number(rows[0].room_id) : null,
      roomName: rows.length > 0 ? rows[0].room_name : undefined,
      radarHeightMeters,
      fetchedAt: now,
    };

    this.riskSensitivityCache.set(radarId, resolved);
    return resolved;
  }

  private async getZones(radarId: string): Promise<ZoneConfig[]> {
    const now = Date.now();
    const cached = this.zoneCache.get(radarId);
    if (cached && now - cached.fetchedAt < ZONE_CACHE_TTL_MS) {
      return cached.zones;
    }

    const { rows } = await this.repository.pool.query(
      "SELECT metadata FROM radar_devices WHERE id = $1",
      [radarId]
    );

    const metadata = rows.length > 0 ? asRecord(rows[0]?.metadata) : {};
    const zones = parseZones(metadata.zones);
    this.zoneCache.set(radarId, { zones, fetchedAt: now });
    return zones;
  }

  private applyZoneContext(event: EventRecord, zones: ZoneConfig[]): EventRecord {
    if (zones.length === 0) return event;

    const location = asRecord(event.metadata.location);
    const x = Number(location.x);
    const y = Number(location.y);
    const z = Number(location.z);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return event;

    const matchedZone = zones.find((zone) => pointInPolygon(x, y, zone.polygon));
    if (!matchedZone) {
      return {
        ...event,
        metadata: {
          ...event.metadata,
          alert_priority: event.metadata.alert_priority ?? "medium",
        },
      };
    }

    const priority = matchedZone.priority ?? defaultPriorityForZone(matchedZone.type, event.type);

    return {
      ...event,
      metadata: {
        ...event.metadata,
        alert_priority: priority,
        zone_context: {
          id: matchedZone.id,
          name: matchedZone.name,
          type: matchedZone.type,
          priority,
        },
        location: {
          x,
          y,
          z: Number.isFinite(z) ? z : 0,
        },
      },
    };
  }
}
