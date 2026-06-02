import express from "express";
import { EventEmitter } from "events";
import type { Pool } from "pg";
import { RadarRepository } from "../db/repository.js";
import { riskProfileService } from "../services/riskProfileService.js";
import { asRecord, toFiniteNumber } from "../helpers/index.js";
import { logger } from "../logger.js";
import { requireFeature } from "../middleware/auth.js";

export interface MonitorRouterDeps {
  repository: RadarRepository;
  pool: Pool;
  frameStream: EventEmitter;
}

export function createMonitorRouter(deps: MonitorRouterDeps): express.Router {
  const { repository, pool, frameStream } = deps;
  const router = express.Router();
  const slaEventTypes = ["fall", "anomaly", "departure", "arrival", "transition", "dwell"];

  const resolveOwnerId = (req: express.Request) => {
    if (req.user?.role === "admin") return undefined;
    return req.user?.id;
  };

  router.get("/monitor/rooms", async (req, res) => {
    const ownerId = resolveOwnerId(req);
    const [rooms, stats] = await Promise.all([
      repository.getRooms(ownerId),
      repository.getDailyStats(1, ownerId)
    ]);
    const [latestSummariesRow, activeEventsRow] = await Promise.all([
      repository.getLatestSummaries(ownerId),
      repository.getActiveAlerts(ownerId)
    ]);
    const latestSummaries = (latestSummariesRow || []) as any[];
    const activeEvents = (activeEventsRow || []) as any[];
    const enrichedRooms = (rooms as any[]).map(room => {
      const summary = latestSummaries.find((s: any) => s.radar_id === room.radar_id);
      const isOnline = room.radar_status === "online";
      const hasActiveFall = activeEvents.some((e: any) => e.radar_id === room.radar_id);
      let safetyState = "normal";
      const occupied = summary ? parseFloat(summary.active_targets) > 0.5 : false;
      const lastSeenSec = summary ? (Date.now() - new Date(summary.timestamp).getTime()) / 1000 : 999999;
      if (!isOnline || lastSeenSec > 300) {
        safetyState = "offline";
      } else if (hasActiveFall) {
        safetyState = "urgent";
      } else if (occupied && summary.distance_moved < 0.1 && lastSeenSec > 120) {
        safetyState = "watch";
      }
      return {
        ...room,
        safety_state: safetyState,
        occupancy: occupied ? Math.ceil(parseFloat(summary.active_targets)) : 0,
        last_activity_sec: Math.round(lastSeenSec),
        distance_moved_recent: summary ? parseFloat(summary.distance_moved) : 0
      };
    });
    res.json({ rooms: enrichedRooms, stats });
  });

  router.get("/monitor/patients/:id", requireFeature("patient_detail"), async (req, res) => {
    const patientId = Number(req.params.id);
    if (!Number.isInteger(patientId)) {
      res.status(400).json({ error: "Invalid patient id" });
      return;
    }
    const ownerId = resolveOwnerId(req);
    const [patients, events, daily] = await Promise.all([
      repository.getPatients(ownerId),
      repository.getEvents({ limit: 400, ownerId }),
      repository.getDailyStats(30, ownerId)
    ]);
    const patient = (patients as Array<Record<string, unknown>>).find((p) => p.id === patientId);
    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }
    const patientRoomId = Number(patient.room_id);
    const patientEvents = (events as Array<Record<string, unknown>>).filter((e) => e.patient_id === patientId);
    const patientStats = (daily as Array<Record<string, unknown>>).filter((d) => d.room_id === patientRoomId);
    let zones: any[] = [];
    let room: any = null;
    let radar_id: string | null = null;
    if (patientRoomId) {
      const roomValues: unknown[] = [patientRoomId];
      let roomOwnerClause = "";
      if (Number.isInteger(ownerId)) {
        roomValues.push(ownerId);
        roomOwnerClause = ` AND owner_id = $${roomValues.length}`;
      }
      const { rows: roomRows } = await pool.query(`SELECT * FROM rooms WHERE id = $1${roomOwnerClause}`, roomValues);
      if (roomRows.length > 0) {
        room = roomRows[0];
        const radarValues: unknown[] = [patientRoomId];
        let radarOwnerClause = "";
        if (Number.isInteger(ownerId)) {
          radarValues.push(ownerId);
          radarOwnerClause = ` AND owner_id = $${radarValues.length}`;
        }
        const { rows: radarRows } = await pool.query(
          `SELECT id, metadata FROM radar_devices WHERE room_id = $1${radarOwnerClause}`,
          radarValues
        );
        if (radarRows.length > 0) {
          radar_id = radarRows[0].id;
          const metadata = asRecord(radarRows[0].metadata);
          if (Array.isArray(metadata.zones)) {
            zones = metadata.zones;
          }
        }
      }
    }
    res.json({ patient, events: patientEvents, dailyStats: patientStats, zones, room: room ? { ...room, radar_id } : null });
  });

  router.get("/monitor/watchlist", async (_req, res) => {
    try {
      const ownerId = resolveOwnerId(_req);
      const ownerFilter = Number.isInteger(ownerId) ? "WHERE p.owner_id = $1" : "";
      const ownerValues = Number.isInteger(ownerId) ? [ownerId] : [];
      const [patientsRows, eventAggRows, stabilityRows] = await Promise.all([
        pool.query(
          `SELECT p.id AS patient_id, p.name AS patient_name, p.metadata,
                  r.name AS room_name, d.id AS radar_id
           FROM patients p
           LEFT JOIN rooms r ON r.id = p.room_id AND r.owner_id = p.owner_id
           LEFT JOIN radar_devices d ON d.room_id = p.room_id AND d.owner_id = p.owner_id
           ${ownerFilter}
           ORDER BY p.name ASC`,
          ownerValues
        ),
        pool.query(
          `SELECT p.id AS patient_id,
                  COUNT(*) FILTER (WHERE e.type = 'fall' AND e.timestamp >= NOW() - INTERVAL '30 days')::int AS falls_30d,
                  COUNT(*) FILTER (WHERE e.type = 'anomaly' AND e.timestamp >= NOW() - INTERVAL '14 days')::int AS anomalies_14d,
                  MAX(e.timestamp) FILTER (WHERE e.type = 'fall') AS last_fall_at,
                  MAX(e.timestamp) FILTER (WHERE e.type = 'anomaly') AS last_anomaly_at
           FROM patients p
           LEFT JOIN rooms r ON r.id = p.room_id AND r.owner_id = p.owner_id
           LEFT JOIN radar_devices d ON d.room_id = r.id AND d.owner_id = p.owner_id
           LEFT JOIN events e ON e.radar_id = d.id AND e.owner_id = p.owner_id
           ${ownerFilter}
           GROUP BY p.id`,
          ownerValues
        ),
        pool.query(
          `SELECT p.id AS patient_id,
                  AVG(ds.avg_gait_stability) FILTER (WHERE ds.date >= CURRENT_DATE - 7) AS gait_7d,
                  AVG(ds.avg_posture_stability) FILTER (WHERE ds.date >= CURRENT_DATE - 7) AS posture_7d
           FROM patients p
           LEFT JOIN rooms r ON r.id = p.room_id AND r.owner_id = p.owner_id
           LEFT JOIN radar_devices d ON d.room_id = r.id AND d.owner_id = p.owner_id
           LEFT JOIN daily_stats ds ON ds.radar_id = d.id AND ds.owner_id = p.owner_id
           ${ownerFilter}
           GROUP BY p.id`,
          ownerValues
        ),
      ]);
      const eventMap = new Map<number, Record<string, unknown>>();
      eventAggRows.rows.forEach((row) => {
        eventMap.set(Number(row.patient_id), row as Record<string, unknown>);
      });
      const stabilityMap = new Map<number, Record<string, unknown>>();
      stabilityRows.rows.forEach((row) => {
        stabilityMap.set(Number(row.patient_id), row as Record<string, unknown>);
      });
      const riskBase: Record<string, number> = { low: 10, medium: 22, high: 38, critical: 52 };
      const watchlist = patientsRows.rows.map((row) => {
        const patientId = Number(row.patient_id);
        const patientMetadata = asRecord(row.metadata);
        const profile = riskProfileService.getRiskProfile(patientMetadata);
        const eventsAgg = eventMap.get(patientId) ?? {};
        const stabilityAgg = stabilityMap.get(patientId) ?? {};
        const falls30d = toFiniteNumber(eventsAgg.falls_30d, 0);
        const anomalies14d = toFiniteNumber(eventsAgg.anomalies_14d, 0);
        const gait7d = stabilityAgg.gait_7d != null && Number.isFinite(Number(stabilityAgg.gait_7d))
          ? Number(stabilityAgg.gait_7d) : null;
        const posture7d = stabilityAgg.posture_7d != null && Number.isFinite(Number(stabilityAgg.posture_7d))
          ? Number(stabilityAgg.posture_7d) : null;
        const gaitInstability = gait7d == null ? 0.18 : Math.max(0, 0.65 - gait7d);
        const postureInstability = posture7d == null ? 0.12 : Math.max(0, 0.65 - posture7d);
        const rawScore =
          (riskBase[profile.level] ?? 22) +
          falls30d * 24 + anomalies14d * 6 +
          gaitInstability * 120 + postureInstability * 90;
        const riskScore = profile.manualRiskScore != null
          ? profile.manualRiskScore
          : Math.max(0, Math.min(100, Math.round(rawScore)));
        const trend = riskScore >= 70 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 30 ? "medium" : "low";
        let proactiveChecks: string[] = [];
        if (profile.manualProactiveChecks && profile.manualProactiveChecks.length > 0) {
          proactiveChecks = profile.manualProactiveChecks;
        } else {
          if (falls30d >= 2) proactiveChecks.push("Aumentar a frequência das rondas noturnas");
          if (anomalies14d >= 3) proactiveChecks.push("Rever auxílio de mobilidade e plano de apoio à marcha");
          if (gait7d != null && gait7d < 0.55) proactiveChecks.push("Agendar avaliação de fisioterapia");
          if (posture7d != null && posture7d < 0.55) proactiveChecks.push("Adicionar supervisão de transferência durante a higiene");
          if (profile.level === "critical") proactiveChecks.push("Escalar para via de cuidados de alto risco");
          if (proactiveChecks.length === 0) proactiveChecks.push("Continuar verificações preventivas de rotina");
        }
        return {
          patient_id: patientId,
          patient_name: String(row.patient_name ?? "Desconhecido"),
          room_name: row.room_name == null ? null : String(row.room_name),
          radar_id: row.radar_id == null ? null : String(row.radar_id),
          profile_level: profile.level,
          falls_30d: falls30d, anomalies_14d: anomalies14d,
          gait_stability_7d: gait7d, posture_stability_7d: posture7d,
          risk_score: riskScore, trend,
          proactive_checks: proactiveChecks,
          manual_risk_score: profile.manualRiskScore,
          manual_proactive_checks: profile.manualProactiveChecks,
          last_fall_at: eventsAgg.last_fall_at ?? null,
          last_anomaly_at: eventsAgg.last_anomaly_at ?? null,
        };
      }).sort((a, b) => (b.risk_score - a.risk_score) || a.patient_name.localeCompare(b.patient_name));
      res.json({ watchlist, generated_at: new Date().toISOString() });
    } catch (error: unknown) {
      logger.error({ error }, "Failed to build watchlist");
      res.status(500).json({ error: "Failed to build watchlist" });
    }
  });

  router.get("/monitor/patients/:id/heatmap", async (req, res) => {
    const patientId = Number.parseInt(req.params.id, 10);
    const rawHours = req.query.hours;
    const hours = rawHours == null ? 24 : Number.parseInt(String(rawHours), 10);
    if (!Number.isInteger(patientId)) {
      res.status(400).json({ error: "Invalid patient id" });
      return;
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      res.status(400).json({ error: "hours must be an integer between 1 and 168" });
      return;
    }
    try {
      const ownerId = resolveOwnerId(req);
      const values: unknown[] = [patientId, hours];
      let ownerClause = "";
      if (Number.isInteger(ownerId)) {
        values.push(ownerId);
        ownerClause = ` AND owner_id = $${values.length}`;
      }
      const { rows } = await pool.query(`
        SELECT grid_x, grid_y, SUM(duration_seconds) as intensity
        FROM patient_spatial_stats
        WHERE patient_id = $1 AND hour_timestamp >= NOW() - ($2 || ' hours')::interval${ownerClause}
        GROUP BY grid_x, grid_y
      `, values);
      const points = rows.map(r => ({
        x: r.grid_x * 0.25 + 0.125,
        y: r.grid_y * 0.25 + 0.125,
        intensity: parseInt(r.intensity)
      }));
      res.json({ points });
    } catch (error) {
      logger.error({ error, patientId }, "Failed to fetch heatmap data");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/monitor/stream", requireFeature("live_telemetry"), (req, res) => {
    const ownerId = resolveOwnerId(req);
    let allowedRadarIds = new Set<string>();
    let refreshTimer: NodeJS.Timeout | null = null;

    const refreshAllowed = async () => {
      if (!Number.isInteger(ownerId)) return;
      const radars = await repository.getRadars({ onlyUnassigned: false, ownerId });
      allowedRadarIds = new Set(
        (radars as Array<{ id?: string; owner_id?: number | null }>)
          .filter((r) => Number(r.owner_id) === ownerId)
          .map((r) => String(r.id ?? ""))
          .filter(Boolean)
      );
    };

    void refreshAllowed();
    if (Number.isInteger(ownerId)) {
      refreshTimer = setInterval(() => void refreshAllowed(), 30_000);
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    res.flushHeaders?.();
    let canWrite = true;
    res.on("drain", () => {
      canWrite = true;
    });

    const safeWrite = (payload: string) => {
      if (!canWrite) return;
      const ok = res.write(payload);
      if (!ok) canWrite = false;
    };

    safeWrite(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    const listener = (data: any) => {
      if (Number.isInteger(ownerId) && !allowedRadarIds.has(String(data?.radarId ?? ""))) return;
      safeWrite(`data: ${JSON.stringify(data)}\n\n`);
    };
    const heartbeat = setInterval(() => {
      safeWrite(`: keepalive ${Date.now()}\n\n`);
    }, 15000);
    const eventListener = (event: any) => {
      if (Number.isInteger(ownerId) && !allowedRadarIds.has(String(event?.radar_id ?? ""))) return;
      safeWrite(`event: alert\ndata: ${JSON.stringify(event)}\n\n`);
    };
    frameStream.on("frame", listener);
    frameStream.on("event", eventListener);
    req.on("close", () => {
      clearInterval(heartbeat);
      if (refreshTimer) clearInterval(refreshTimer);
      frameStream.off("frame", listener);
      frameStream.off("event", eventListener);
    });
  });

  router.get("/monitor/sla", requireFeature("sla_metrics"), async (_req, res) => {
    try {
      const ownerId = resolveOwnerId(_req);
      const values: unknown[] = [slaEventTypes];
      let ownerClause = "";
      if (Number.isInteger(ownerId)) {
        values.push(ownerId);
        ownerClause = ` AND owner_id = $${values.length}`;
      }
      const { rows } = await pool.query(
        `SELECT id, timestamp, metadata->>'alert_status' as status,
            (metadata->>'acknowledged_at')::timestamptz as ack_time,
            (metadata->>'resolved_at')::timestamptz as res_time
         FROM events
         WHERE type = ANY($1)${ownerClause}
         ORDER BY timestamp DESC
         LIMIT 500`,
        values
      );
      let totalAckTime = 0, ackCount = 0;
      let totalResTime = 0, resCount = 0;
      const incidents = rows.map((r: any) => {
        const start = new Date(r.timestamp).getTime();
        const ack = r.ack_time ? new Date(r.ack_time).getTime() : null;
        const resTime = r.res_time ? new Date(r.res_time).getTime() : null;
        let ackDelaySec = null;
        if (ack) { ackDelaySec = (ack - start) / 1000; totalAckTime += ackDelaySec; ackCount++; }
        let resDelaySec = null;
        if (resTime) { resDelaySec = (resTime - start) / 1000; totalResTime += resDelaySec; resCount++; }
        return { id: r.id, ackDelaySec, resDelaySec };
      });
      res.json({
        avgAckTimeSec: ackCount > 0 ? totalAckTime / ackCount : 0,
        avgResTimeSec: resCount > 0 ? totalResTime / resCount : 0,
        incidents
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to calculate SLA" });
    }
  });

  router.get("/monitor/fleet", requireFeature("fleet_metrics"), async (_req, res) => {
    try {
      const ownerId = resolveOwnerId(_req);
      const values: unknown[] = [];
      let whereSql = "";
      if (Number.isInteger(ownerId)) {
        values.push(ownerId);
        whereSql = `WHERE d.owner_id = $${values.length}`;
      }
      const { rows } = await pool.query(
        `SELECT d.id, d.room_id, r.name as room_name, d.last_seen, d.status, d.metadata
         FROM radar_devices d LEFT JOIN rooms r ON r.id = d.room_id
         ${whereSql}
         ORDER BY d.last_seen DESC`,
        values
      );
      const fleet = rows.map((d: any) => {
        const lastSeen = new Date(d.last_seen).getTime();
        const offlineSec = (Date.now() - lastSeen) / 1000;
        let computedStatus = "online";
        if (offlineSec > 300) computedStatus = "offline";
        else if (offlineSec > 60 || (d.metadata?.packet_loss && d.metadata.packet_loss > 0.1)) computedStatus = "degraded";
        return {
          ...d, offline_sec: offlineSec, computed_status: computedStatus,
          packet_loss: d.metadata?.packet_loss || 0, drift_ms: d.metadata?.clock_drift || 0
        };
      });
      res.json({ fleet });
    } catch (error: any) {
      console.error(error); res.status(500).json({ error: "Failed to fetch fleet status", details: error.message });
    }
  });

  return router;
}
