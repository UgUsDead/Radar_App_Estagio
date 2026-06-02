import { config } from "../config.js";
import { logger } from "../logger.js";
import type { DailyStatsRecord, EventRecord, SummaryRecord } from "../types.js";
import type { Pool } from "pg";

interface EventQueryOptions {
  limit?: number;
  type?: string;
  status?: "new" | "acknowledged" | "resolved" | "closed";
  from?: string;
  to?: string;
  priority?: "low" | "medium" | "high";
  hourStart?: number;
  hourEnd?: number;
  ownerId?: number;
}

export class RadarRepository {
  private eventQueue: EventRecord[] = [];
  private summaryQueue: SummaryRecord[] = [];
  private flushing = false;
  private lastFlushDurationMs = 0;
  private lastFlushAt: string | null = null;
  private lastFlushEventCount = 0;
  private lastFlushSummaryCount = 0;
  private totalFlushes = 0;
  private totalFlushedEvents = 0;
  private totalFlushedSummaries = 0;

  public constructor(public readonly pool: Pool) {}

  public async initialize(): Promise<void> {
    await this.pool.query("SELECT 1");
    await this.ensureBaseSchema();
    // Simple migrations to support room/radar config without console access
    await this.pool.query("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'");
    await this.pool.query("ALTER TABLE radar_devices ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'");

    // Tenant ownership columns
    await this.pool.query("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)");
    await this.pool.query("ALTER TABLE patients ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)");
    await this.pool.query("ALTER TABLE radar_devices ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)");
    await this.pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)");
    await this.pool.query("ALTER TABLE summaries ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)");
    await this.pool.query("ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)");

    // Tenant-scoped tables used by services
    await this.pool.query("CREATE TABLE IF NOT EXISTS device_tokens (id SERIAL PRIMARY KEY)");
    await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)");
    await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS token TEXT UNIQUE NOT NULL");
    await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS device_id TEXT");
    await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS label TEXT");
    await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()");
    await this.pool.query("ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()");

    await this.pool.query("CREATE TABLE IF NOT EXISTS patient_spatial_stats (id BIGSERIAL PRIMARY KEY)");
    await this.pool.query("ALTER TABLE patient_spatial_stats ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)");
    await this.pool.query("ALTER TABLE patient_spatial_stats ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE");
    await this.pool.query("ALTER TABLE patient_spatial_stats ADD COLUMN IF NOT EXISTS hour_timestamp TIMESTAMPTZ NOT NULL");
    await this.pool.query("ALTER TABLE patient_spatial_stats ADD COLUMN IF NOT EXISTS grid_x INTEGER NOT NULL");
    await this.pool.query("ALTER TABLE patient_spatial_stats ADD COLUMN IF NOT EXISTS grid_y INTEGER NOT NULL");
    await this.pool.query("ALTER TABLE patient_spatial_stats ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 0");

    // Room uniqueness migration: Move from global UNIQUE(name) to UNIQUE(owner_id, name)
    try {
      // Check if old constraint exists
      const { rows } = await this.pool.query("SELECT conname FROM pg_constraint WHERE conname = 'rooms_name_key'");
      if (rows.length > 0) {
        logger.info("Migrating rooms unique constraint to tenant-aware version");
        await this.pool.query("ALTER TABLE rooms DROP CONSTRAINT rooms_name_key");
        await this.pool.query("ALTER TABLE rooms ADD CONSTRAINT rooms_owner_id_name_key UNIQUE (owner_id, name)");
      }
    } catch (err) {
      logger.error({ err }, "Failed to migrate room uniqueness constraint");
    }

    // Indexes for tenant filters
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON rooms (owner_id)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_patients_owner_id ON patients (owner_id)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_radar_devices_owner_id ON radar_devices (owner_id)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_events_owner_id ON events (owner_id)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_summaries_owner_id ON summaries (owner_id)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_daily_stats_owner_id ON daily_stats (owner_id)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_device_tokens_owner_id ON device_tokens (owner_id)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_patient_spatial_stats_owner_id ON patient_spatial_stats (owner_id)");
  }

  private async ensureBaseSchema(): Promise<void> {
    const schemaSql = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
        permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        floor INTEGER NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (owner_id, name)
      );

      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS radar_devices (
        id TEXT PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL DEFAULT 'online',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        radar_id TEXT NOT NULL REFERENCES radar_devices(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('fall', 'anomaly', 'departure', 'arrival', 'transition', 'staff_entry', 'dwell')),
        timestamp TIMESTAMPTZ NOT NULL,
        duration INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE TABLE IF NOT EXISTS summaries (
        id BIGSERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        radar_id TEXT NOT NULL REFERENCES radar_devices(id) ON DELETE CASCADE,
        timestamp TIMESTAMPTZ NOT NULL,
        avg_height DOUBLE PRECISION NOT NULL,
        movement_level DOUBLE PRECISION NOT NULL,
        active_targets INTEGER NOT NULL,
        avg_walking_speed DOUBLE PRECISION NOT NULL,
        distance_moved DOUBLE PRECISION NOT NULL,
        gait_stability DOUBLE PRECISION NOT NULL,
        posture_stability DOUBLE PRECISION NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_stats (
        id BIGSERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        radar_id TEXT NOT NULL REFERENCES radar_devices(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        total_distance DOUBLE PRECISION NOT NULL DEFAULT 0,
        time_moving INTEGER NOT NULL DEFAULT 0,
        falls_count INTEGER NOT NULL DEFAULT 0,
        alerts_count INTEGER NOT NULL DEFAULT 0,
        avg_walking_speed DOUBLE PRECISION NOT NULL DEFAULT 0,
        avg_gait_stability DOUBLE PRECISION NOT NULL DEFAULT 0,
        avg_posture_stability DOUBLE PRECISION NOT NULL DEFAULT 0,
        UNIQUE (radar_id, date)
      );

      CREATE TABLE IF NOT EXISTS device_tokens (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        token TEXT UNIQUE NOT NULL,
        device_id TEXT,
        label TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS patient_spatial_stats (
        id BIGSERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        hour_timestamp TIMESTAMPTZ NOT NULL,
        grid_x INTEGER NOT NULL,
        grid_y INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        UNIQUE (patient_id, hour_timestamp, grid_x, grid_y)
      );

      CREATE INDEX IF NOT EXISTS idx_events_radar_timestamp ON events (radar_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_summaries_radar_timestamp ON summaries (radar_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_daily_stats_radar_date ON daily_stats (radar_id, date DESC);

      CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON rooms (owner_id);
      CREATE INDEX IF NOT EXISTS idx_patients_owner_id ON patients (owner_id);
      CREATE INDEX IF NOT EXISTS idx_radar_devices_owner_id ON radar_devices (owner_id);
      CREATE INDEX IF NOT EXISTS idx_events_owner_id ON events (owner_id);
      CREATE INDEX IF NOT EXISTS idx_summaries_owner_id ON summaries (owner_id);
      CREATE INDEX IF NOT EXISTS idx_daily_stats_owner_id ON daily_stats (owner_id);
      CREATE INDEX IF NOT EXISTS idx_device_tokens_owner_id ON device_tokens (owner_id);
      CREATE INDEX IF NOT EXISTS idx_patient_spatial_stats_owner_id ON patient_spatial_stats (owner_id);

      ALTER TABLE radar_devices ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS telemetry_snapshot JSONB;

      ALTER TABLE events DROP CONSTRAINT IF EXISTS events_type_check;
      ALTER TABLE events
        ADD CONSTRAINT events_type_check
        CHECK (type IN ('fall', 'anomaly', 'departure', 'arrival', 'transition', 'staff_entry', 'dwell'));
    `;

    await this.pool.query(schemaSql);

    // Securely bootstrap admin user if no users exist
    const { rows } = await this.pool.query("SELECT 1 FROM users LIMIT 1");
    if (rows.length === 0) {
      const envPassword = process.env.ADMIN_PASSWORD?.trim();
      if (!envPassword) {
        logger.error("CRITICAL: No users found and ADMIN_PASSWORD is not set. Startup failing.");
        throw new Error("Admin bootstrap required. Set ADMIN_PASSWORD environment variable.");
      }

      let hash = "";
      if (envPassword) {
        const bcrypt = await import("bcrypt");
        hash = await bcrypt.default.hash(envPassword, 10);
        logger.info("Admin user bootstrapped using ADMIN_PASSWORD from environment.");
      }
      await this.pool.query(
        "INSERT INTO users (username, password_hash, role, permissions) VALUES ($1, $2, $3, $4)",
        ["admin", hash, "admin", "[]"]
      );
    }
  }

  public enqueueEvent(event: EventRecord): void {
    if (this.eventQueue.length >= 50000) {
      logger.error('Event queue overflow, dropping event');
      return;
    }
    this.eventQueue.push(event);
  }

  public enqueueSummary(summary: SummaryRecord): void {
    if (this.summaryQueue.length >= 50000) {
      logger.error('Summary queue overflow, dropping summary');
      return;
    }
    this.summaryQueue.push(summary);
  }

  public getQueueDepth(): { events: number; summaries: number } {
    return {
      events: this.eventQueue.length,
      summaries: this.summaryQueue.length,
    };
  }

  public getFlushMetrics(): {
    lastFlushDurationMs: number;
    lastFlushAt: string | null;
    lastFlushEventCount: number;
    lastFlushSummaryCount: number;
    totalFlushes: number;
    totalFlushedEvents: number;
    totalFlushedSummaries: number;
  } {
    return {
      lastFlushDurationMs: this.lastFlushDurationMs,
      lastFlushAt: this.lastFlushAt,
      lastFlushEventCount: this.lastFlushEventCount,
      lastFlushSummaryCount: this.lastFlushSummaryCount,
      totalFlushes: this.totalFlushes,
      totalFlushedEvents: this.totalFlushedEvents,
      totalFlushedSummaries: this.totalFlushedSummaries,
    };
  }

  public async touchRadar(radarId: string, lastSeenIso: string, ownerId?: number): Promise<void> {
    const ownerValue = Number.isInteger(ownerId) ? ownerId : null;
    logger.debug({ radarId, ownerValue }, "touchRadar operation");
    await this.pool.query(
      `INSERT INTO radar_devices (id, owner_id, last_seen, status)
       VALUES ($1, $2, $3, 'online')
       ON CONFLICT (id)
       DO UPDATE SET
         last_seen = EXCLUDED.last_seen,
         status = 'online',
         owner_id = COALESCE(radar_devices.owner_id, EXCLUDED.owner_id),
         updated_at = NOW()`,
      [radarId, ownerValue, lastSeenIso]
    );
  }

  public async upsertDailyStats(stats: DailyStatsRecord): Promise<void> {
    const ownerValue = Number.isInteger(stats.owner_id) ? stats.owner_id : null;
    await this.pool.query(
      `INSERT INTO daily_stats (
        owner_id, radar_id, date, total_distance, time_moving,
        falls_count, alerts_count,
        avg_walking_speed, avg_gait_stability, avg_posture_stability
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (radar_id, date)
      DO UPDATE SET
        owner_id = COALESCE(daily_stats.owner_id, EXCLUDED.owner_id),
        total_distance = EXCLUDED.total_distance,
        time_moving = EXCLUDED.time_moving,
        falls_count = EXCLUDED.falls_count,
        alerts_count = EXCLUDED.alerts_count,
        avg_walking_speed = EXCLUDED.avg_walking_speed,
        avg_gait_stability = EXCLUDED.avg_gait_stability,
        avg_posture_stability = EXCLUDED.avg_posture_stability`,
      [
        ownerValue,
        stats.radar_id,
        stats.date,
        stats.total_distance,
        stats.time_moving,
        stats.falls_count,
        stats.alerts_count,
        stats.avg_walking_speed,
        stats.avg_gait_stability,
        stats.avg_posture_stability
      ]
    );
  }

  public async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    
    try {
      const startedAt = Date.now();
      const [eventsFlushed, summariesFlushed] = await Promise.all([
        this.flushEvents(),
        this.flushSummaries(),
      ]);

      this.lastFlushDurationMs = Date.now() - startedAt;
      this.lastFlushAt = new Date().toISOString();
      this.lastFlushEventCount = eventsFlushed;
      this.lastFlushSummaryCount = summariesFlushed;
      this.totalFlushes += 1;
      this.totalFlushedEvents += eventsFlushed;
      this.totalFlushedSummaries += summariesFlushed;
    } finally {
      this.flushing = false;
    }
  }

  public async markOfflineDevices(): Promise<number> {
    const threshold = `${Math.max(1, config.mqtt.offlineSeconds)} seconds`;
    const result = await this.pool.query(
      `UPDATE radar_devices
       SET status = 'offline', updated_at = NOW()
       WHERE status != 'offline' AND last_seen < NOW() - $1::interval`,
      [threshold]
    );
    return result.rowCount ?? 0;
  }

  public async getHeartbeatHealth(): Promise<{
    online: number;
    offline: number;
    total: number;
    oldestLastSeenSeconds: number | null;
    newestLastSeenSeconds: number | null;
  }> {
    const { rows } = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'online')::int AS online,
         COUNT(*) FILTER (WHERE status != 'online')::int AS offline,
         COUNT(*)::int AS total,
         MAX(EXTRACT(EPOCH FROM (NOW() - last_seen)))::int AS oldest_last_seen_seconds,
         MIN(EXTRACT(EPOCH FROM (NOW() - last_seen)))::int AS newest_last_seen_seconds
       FROM radar_devices`
    );

    const row = rows[0] ?? {};
    return {
      online: Number(row.online ?? 0),
      offline: Number(row.offline ?? 0),
      total: Number(row.total ?? 0),
      oldestLastSeenSeconds:
        row.oldest_last_seen_seconds === null ? null : Number(row.oldest_last_seen_seconds),
      newestLastSeenSeconds:
        row.newest_last_seen_seconds === null ? null : Number(row.newest_last_seen_seconds),
    };
  }

  public async getRadars(options: { onlyUnassigned?: boolean; ownerId?: number; onlyUnowned?: boolean } = {}): Promise<unknown[]> {
    const { onlyUnassigned = false, ownerId, onlyUnowned = false } = options;
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (onlyUnowned) {
      whereClauses.push("d.owner_id IS NULL");
    } else if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      // For a specific hospital user: 
      // They see their own radars, AND unowned radars (for discovery/claiming)
      whereClauses.push(`(d.owner_id = $${values.length} OR d.owner_id IS NULL)`);
    } else {
      // Admin or system view: see everything
    }

    if (onlyUnassigned) {
      whereClauses.push("d.room_id IS NULL");
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    logger.info({ options, whereSql, values }, "Fetching radars with filters");
    const { rows } = await this.pool.query(
      `SELECT d.id, d.status, d.last_seen, d.room_id, r.name AS room_name, d.owner_id, u.username as owner_name
       FROM radar_devices d
       LEFT JOIN rooms r ON r.id = d.room_id
       LEFT JOIN users u ON u.id = d.owner_id
       ${whereSql}
       ORDER BY d.last_seen DESC`,
      values
    );
    logger.info({ count: rows.length }, "Radars fetched from database");
    return rows;
  }

  public async getLatestSummaries(ownerId?: number): Promise<unknown[]> {
    const values: unknown[] = [];
    let whereSql = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      whereSql = `WHERE owner_id = $${values.length}`;
    }
    const { rows } = await this.pool.query(
      `SELECT DISTINCT ON (radar_id) radar_id, active_targets, timestamp, distance_moved
       FROM summaries
       ${whereSql}
       ORDER BY radar_id, timestamp DESC`,
      values
    );
    return rows;
  }

  public async getActiveAlerts(ownerId?: number): Promise<unknown[]> {
    const whereClauses: string[] = ["type = 'fall'", "COALESCE(metadata->>'alert_status', 'new') NOT IN ('resolved', 'closed')"];
    const values: unknown[] = [];

    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      whereClauses.push(`owner_id = $${values.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT radar_id, type, metadata, timestamp
       FROM events
       ${whereSql}`,
      values
    );
    return rows;
  }

  public async getRooms(ownerId?: number): Promise<unknown[]> {
    const values: unknown[] = [];
    let whereSql = "";
    let joinClause = "";
    let radarJoinClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      whereSql = `WHERE r.owner_id = $${values.length}`;
      joinClause = ` AND p.owner_id = $${values.length}`;
      radarJoinClause = ` AND d.owner_id = $${values.length}`;
    }
    const { rows } = await this.pool.query(
      `SELECT r.id, r.name, r.floor, r.notes, r.metadata,
              p.id AS patient_id, p.name AS patient_name,
              d.id AS radar_id, d.status AS radar_status
       FROM rooms r
       LEFT JOIN patients p ON p.room_id = r.id${joinClause}
       LEFT JOIN radar_devices d ON d.room_id = r.id${radarJoinClause}
       ${whereSql}
       ORDER BY r.floor ASC, r.name ASC`,
      values
    );
    return rows;
  }

  public async getPatients(ownerId?: number): Promise<unknown[]> {
    const values: unknown[] = [];
    let whereSql = "";
    let joinClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      whereSql = `WHERE p.owner_id = $${values.length}`;
      joinClause = ` AND r.owner_id = $${values.length}`;
    }
    const { rows } = await this.pool.query(
      `SELECT p.id, p.name, p.room_id, p.metadata, r.name AS room_name
       FROM patients p
       LEFT JOIN rooms r ON r.id = p.room_id${joinClause}
       ${whereSql}
       ORDER BY p.name ASC`,
      values
    );
    return rows;
  }

  public async getPatientMetadataByRadarId(radarId: string, ownerId?: number): Promise<Record<string, unknown> | null> {
    const values: unknown[] = [radarId];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      ownerClause = `AND d.owner_id = $${values.length}`;
    }
    const { rows } = await this.pool.query(
      `SELECT p.metadata
       FROM radar_devices d
       LEFT JOIN patients p ON p.room_id = d.room_id AND p.owner_id = d.owner_id
       WHERE d.id = $1
       ${ownerClause}
       ORDER BY p.id ASC
       LIMIT 1`,
      values
    );

    if (rows.length === 0 || !rows[0]?.metadata) {
      return null;
    }

    return rows[0].metadata as Record<string, unknown>;
  }

  public async getEvents(limitOrOptions: number | EventQueryOptions = 200): Promise<unknown[]> {
    const options: EventQueryOptions =
      typeof limitOrOptions === "number" ? { limit: limitOrOptions } : (limitOrOptions ?? {});

    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (options.type) {
      values.push(options.type);
      whereClauses.push(`e.type = $${values.length}`);
    }

    if (options.status) {
      values.push(options.status);
      whereClauses.push(`COALESCE(e.metadata->>'alert_status', 'new') = $${values.length}`);
    }

    if (options.from) {
      values.push(options.from);
      whereClauses.push(`e.timestamp >= $${values.length}::timestamptz`);
    }

    if (options.to) {
      values.push(options.to);
      whereClauses.push(`e.timestamp <= $${values.length}::timestamptz`);
    }

    if (options.priority) {
      values.push(options.priority);
      whereClauses.push(
        `COALESCE(NULLIF(e.metadata->>'alert_priority', ''), NULLIF(e.metadata->'zone_context'->>'priority', ''), 'medium') = $${values.length}`
      );
    }

    if (Number.isInteger(options.ownerId)) {
      values.push(options.ownerId);
      whereClauses.push(`e.owner_id = $${values.length}`);
    }

    if (Number.isFinite(options.hourStart) && Number.isFinite(options.hourEnd)) {
      const hourStart = Math.max(0, Math.min(23, Math.trunc(Number(options.hourStart))));
      const hourEnd = Math.max(0, Math.min(23, Math.trunc(Number(options.hourEnd))));
      values.push(hourStart);
      values.push(hourEnd);
      if (hourStart <= hourEnd) {
        whereClauses.push(
          `EXTRACT(HOUR FROM e.timestamp AT TIME ZONE 'UTC') BETWEEN $${values.length - 1} AND $${values.length}`
        );
      } else {
        whereClauses.push(
          `(EXTRACT(HOUR FROM e.timestamp AT TIME ZONE 'UTC') >= $${values.length - 1} OR EXTRACT(HOUR FROM e.timestamp AT TIME ZONE 'UTC') <= $${values.length})`
        );
      }
    }

    const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(5000, Math.trunc(Number(options.limit)))) : 200;
    values.push(limit);

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT e.id, e.radar_id, e.type, e.timestamp, e.duration, e.metadata,
              COALESCE(e.metadata->>'alert_status', 'new') AS alert_status,
              COALESCE(e.metadata->>'escalation_level', 'new') AS escalation_level,
              COALESCE((e.metadata->>'is_critical')::boolean, false) AS is_critical,
              COALESCE(NULLIF(e.metadata->>'alert_priority', ''), NULLIF(e.metadata->'zone_context'->>'priority', ''), 'medium') AS alert_priority,
              r.id AS room_id, r.name AS room_name,
              p.id AS patient_id, p.name AS patient_name
       FROM events e
       LEFT JOIN radar_devices d ON d.id = e.radar_id
       LEFT JOIN rooms r ON r.id = d.room_id
       LEFT JOIN patients p ON p.room_id = r.id AND p.owner_id IS NOT DISTINCT FROM e.owner_id
       ${whereSql}
       ORDER BY e.timestamp DESC
       LIMIT $${values.length}`,
      values
    );
    return rows;
  }

  public async getEventById(eventId: number, ownerId?: number): Promise<{
    id: number;
    owner_id: number | null;
    radar_id: string;
    room_id: number | null;
    room_name: string | null;
    patient_name: string | null;
  } | null> {
    const values: unknown[] = [eventId];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      ownerClause = `AND e.owner_id = $${values.length}`;
    }
    const { rows } = await this.pool.query(
      `SELECT e.id, e.owner_id, e.radar_id,
              r.id AS room_id, r.name AS room_name,
              p.name AS patient_name
       FROM events e
       LEFT JOIN radar_devices d ON d.id = e.radar_id
       LEFT JOIN rooms r ON r.id = d.room_id
       LEFT JOIN patients p ON p.room_id = r.id AND p.owner_id IS NOT DISTINCT FROM e.owner_id
       WHERE e.id = $1
       ${ownerClause}
       LIMIT 1`,
      values
    );

    return rows[0] ?? null;
  }

  public async updateEventAlertStatus(
    eventId: number,
    status: "acknowledged" | "resolved" | "closed",
    actor?: string,
    options?: { notes?: string; outcome?: string; action_taken?: string; escalation_level?: string; intervention_type?: string; root_cause?: string },
    ownerId?: number
  ): Promise<boolean> {
    const actorValue = actor?.trim() || "dashboard";
    const timestampKey = status === "resolved" ? "resolved_at" : status === "closed" ? "closed_at" : "acknowledged_at";
    
    let extraJson: Record<string, string> = {};
    if (options?.notes) extraJson.closure_notes = options.notes;
    if (options?.outcome) extraJson.outcome = options.outcome;
    if (options?.action_taken) extraJson.action_taken = options.action_taken;
    if (options?.escalation_level) extraJson.escalation_level = options.escalation_level;
    if (options?.intervention_type) extraJson.intervention_type = options.intervention_type;
    if (options?.root_cause) extraJson.root_cause = options.root_cause;

    const values: unknown[] = [eventId, status, actorValue, extraJson];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      ownerClause = ` AND owner_id = $${values.length}`;
    }

    const result = await this.pool.query(
      `UPDATE events
       SET metadata =
         COALESCE(metadata, '{}'::jsonb) ||
         jsonb_build_object(
           'alert_status', $2::text,
           'last_updated_by', $3::text,
           '${timestampKey}', NOW()::text
         ) || $4::jsonb
       WHERE id = $1${ownerClause}`,
      values
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async clearEvents(type?: string, ownerId?: number): Promise<number> {
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (type) {
      values.push(type);
      whereClauses.push(`type = $${values.length}`);
    }

    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      whereClauses.push(`owner_id = $${values.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const { rowCount } = await this.pool.query(
      `DELETE FROM events ${whereSql}`,
      values
    );
    return rowCount ?? 0;
  }

  public async clearDatabase(): Promise<void> {
    logger.warn("EXPLICIT DATABASE WIPE REQUESTED");
    await this.pool.query("BEGIN");
    try {
      await this.pool.query(
        `TRUNCATE TABLE
          patient_spatial_stats,
          device_tokens,
          daily_stats,
          summaries,
          events,
          patients,
          radar_devices,
          rooms
         RESTART IDENTITY CASCADE`
      );
      await this.pool.query("COMMIT");
      logger.warn("DATABASE WIPE COMPLETED SUCCESSFULLY");
    } catch (error) {
      await this.pool.query("ROLLBACK");
      logger.error({ error }, "DATABASE WIPE FAILED");
      throw error;
    }
  }

  public async getDailyStats(days = 7, ownerId?: number): Promise<unknown[]> {
    const values: unknown[] = [days];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      ownerClause = ` AND ds.owner_id = $${values.length}`;
    }
    const { rows } = await this.pool.query(
      `SELECT ds.*, d.room_id, r.name AS room_name, p.name AS patient_name
       FROM daily_stats ds
       LEFT JOIN radar_devices d ON d.id = ds.radar_id
       LEFT JOIN rooms r ON r.id = d.room_id
       LEFT JOIN patients p ON p.room_id = r.id
       WHERE ds.date >= CURRENT_DATE - $1::int${ownerClause}
       ORDER BY ds.date DESC, ds.radar_id ASC`,
      values
    );
    return rows;
  }

  public async assignRadarToRoom(radarId: string, roomId: number | null, ownerId?: number): Promise<boolean> {
    const ownerValue = Number.isInteger(ownerId) ? ownerId : null;
    await this.pool.query("BEGIN");
    try {
      if (ownerValue !== null && roomId !== null) {
        const { rowCount } = await this.pool.query(
          `SELECT 1 FROM rooms WHERE id = $1 AND owner_id = $2`,
          [roomId, ownerValue]
        );
        if (!rowCount) {
          await this.pool.query("ROLLBACK");
          return false;
        }
      }

      if (roomId !== null) {
        const unassignValues: unknown[] = [roomId, radarId];
        let ownerClause = "";
        if (ownerValue !== null) {
          unassignValues.push(ownerValue);
          ownerClause = ` AND owner_id = $${unassignValues.length}`;
        }
        await this.pool.query(
          `UPDATE radar_devices
           SET room_id = NULL, updated_at = NOW()
           WHERE room_id = $1 AND id != $2${ownerClause}`,
          unassignValues
        );
      }
      const updateValues: unknown[] = [radarId, roomId];
      let updateOwnerClause = "";
      if (ownerValue !== null) {
        updateValues.push(ownerValue);
        updateOwnerClause = ` AND owner_id = $${updateValues.length}`;
      }
      const result = await this.pool.query(
        `UPDATE radar_devices
         SET room_id = $2, updated_at = NOW()
         WHERE id = $1${updateOwnerClause}`,
        updateValues
      );
      const updated = (result.rowCount ?? 0) > 0;
      await this.pool.query("COMMIT");
      if (updated) {
        logger.info({ radarId, roomId }, "Device assignment updated");
      }
      return updated;
    } catch (error) {
      await this.pool.query("ROLLBACK");
      throw error;
    }
  }

  public async deleteRadar(radarId: string, ownerId?: number): Promise<boolean> {
    const values: unknown[] = [radarId];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      ownerClause = ` AND owner_id = $${values.length}`;
    }
    const result = await this.pool.query(
      `DELETE FROM radar_devices WHERE id = $1${ownerClause}`,
      values
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async createRoom(
    name: string,
    floor: number,
    notes: string | null,
    metadata: Record<string, unknown> = {},
    ownerId?: number
  ): Promise<unknown> {
    const ownerValue = Number.isInteger(ownerId) ? ownerId : null;
    const { rows } = await this.pool.query(
      `INSERT INTO rooms (owner_id, name, floor, notes, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [ownerValue, name, floor, notes, JSON.stringify(metadata)]
    );
    return rows[0];
  }

  public async updateRoom(
    id: number,
    name: string,
    floor: number,
    notes: string | null,
    metadata: Record<string, unknown> = {},
    ownerId?: number
  ): Promise<void> {
    const values: unknown[] = [id, name, floor, notes, JSON.stringify(metadata)];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      ownerClause = ` AND owner_id = $${values.length}`;
    }
    await this.pool.query(
      `UPDATE rooms
       SET name = $2, floor = $3, notes = $4, metadata = $5::jsonb, updated_at = NOW()
       WHERE id = $1${ownerClause}`,
      values
    );
  }

  public async deleteRoom(id: number, ownerId?: number): Promise<void> {
    const values: unknown[] = [id];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      ownerClause = ` AND owner_id = $${values.length}`;
    }
    await this.pool.query(`DELETE FROM rooms WHERE id = $1${ownerClause}`, values);
  }

  public async createPatient(
    name: string,
    roomId: number | null,
    metadata: Record<string, unknown>,
    ownerId?: number
  ): Promise<unknown> {
    const ownerValue = Number.isInteger(ownerId) ? ownerId : null;
    const { rows } = await this.pool.query(
      `INSERT INTO patients (owner_id, name, room_id, metadata)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING *`,
      [ownerValue, name, roomId, JSON.stringify(metadata)]
    );
    return rows[0];
  }

  public async assignPatientRoom(patientId: number, roomId: number | null, ownerId?: number): Promise<void> {
    const ownerValue = Number.isInteger(ownerId) ? ownerId : null;
    if (ownerValue !== null && roomId !== null) {
      const { rowCount } = await this.pool.query(
        `SELECT 1 FROM rooms WHERE id = $1 AND owner_id = $2`,
        [roomId, ownerValue]
      );
      if (!rowCount) return;
    }
    const values: unknown[] = [patientId, roomId];
    let ownerClause = "";
    if (ownerValue !== null) {
      values.push(ownerValue);
      ownerClause = ` AND owner_id = $${values.length}`;
    }
    await this.pool.query(
      `UPDATE patients SET room_id = $2, updated_at = NOW() WHERE id = $1${ownerClause}`,
      values
    );
  }

  public async updatePatient(
    id: number,
    payload: { name?: string; roomId?: number | null; metadata?: Record<string, unknown> },
    ownerId?: number
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (payload.name !== undefined) {
      fields.push(`name = $${fields.length + 1}`);
      values.push(payload.name);
    }
    if (payload.roomId !== undefined) {
      fields.push(`room_id = $${fields.length + 1}`);
      values.push(payload.roomId);
    }
    if (payload.metadata !== undefined) {
      fields.push(`metadata = $${fields.length + 1}::jsonb`);
      values.push(JSON.stringify(payload.metadata));
    }

    if (fields.length === 0) return;
    const idParamIndex = values.length + 1;
    fields.push(`updated_at = NOW()`);
    const updateValues: unknown[] = [...values, id];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      updateValues.push(ownerId);
      ownerClause = ` AND owner_id = $${updateValues.length}`;
    }
    await this.pool.query(
      `UPDATE patients SET ${fields.join(", ")} WHERE id = $${idParamIndex}${ownerClause}`,
      updateValues
    );
  }

  public async deletePatient(id: number, ownerId?: number): Promise<boolean> {
    const values: unknown[] = [id];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      ownerClause = ` AND owner_id = $${values.length}`;
    }
    const result = await this.pool.query(
      `DELETE FROM patients WHERE id = $1${ownerClause}`,
      values
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async flushEventsNow(): Promise<void> {
    await this.flushEvents();
  }

  public async finalizeEventTelemetry(eventUuid: string, telemetry: unknown[]): Promise<void> {
    await this.pool.query(
      `UPDATE events
       SET telemetry_snapshot = $2::jsonb,
           metadata = metadata - 'is_collecting'
       WHERE metadata->>'collecting_uuid' = $1`,
      [eventUuid, JSON.stringify(telemetry)]
    );
    logger.info({ eventUuid, frameCount: telemetry.length }, "Finalized event telemetry snapshot");
  }

  private async flushEvents(): Promise<number> {
    let flushed = 0;
    while (this.eventQueue.length > 0) {
      const batch = this.eventQueue.slice(0, config.db.batchSize);
      const placeholders: string[] = [];
      const values: unknown[] = [];

      batch.forEach((event, index) => {
        const offset = index * 7;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}::jsonb, $${offset + 7}::jsonb)`);
        values.push(
          Number.isInteger(event.owner_id) ? event.owner_id : null,
          event.radar_id,
          event.type,
          event.timestamp,
          Math.max(1, Math.round(Number(event.duration) || 0)),
          JSON.stringify(event.metadata),
          event.telemetry_snapshot ? JSON.stringify(event.telemetry_snapshot) : null
        );
      });

      try {
        await this.pool.query(
          `INSERT INTO events (owner_id, radar_id, type, timestamp, duration, metadata, telemetry_snapshot)
           VALUES ${placeholders.join(",")}`,
          values
        );
      } catch (error) {
        logger.error({ error, count: batch.length }, "Failed to flush events batch");
        throw error;
      }

      this.eventQueue.splice(0, batch.length);
      flushed += batch.length;
      logger.info({ count: batch.length }, "Flushed events batch");
    }
    return flushed;
  }

  private async flushSummaries(): Promise<number> {
    let flushed = 0;
    while (this.summaryQueue.length > 0) {
      const batch = this.summaryQueue.slice(0, config.db.batchSize);
      const placeholders: string[] = [];
      const values: unknown[] = [];

      batch.forEach((summary, index) => {
        const offset = index * 10;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
        );
        values.push(
          Number.isInteger(summary.owner_id) ? summary.owner_id : null,
          summary.radar_id,
          summary.timestamp,
          summary.avg_height,
          summary.movement_level,
          summary.active_targets,
          summary.avg_walking_speed,
          summary.distance_moved,
          summary.gait_stability,
          summary.posture_stability
        );
      });

      try {
        await this.pool.query(
          `INSERT INTO summaries (
            owner_id, radar_id, timestamp, avg_height, movement_level, active_targets,
            avg_walking_speed, distance_moved, gait_stability, posture_stability
          ) VALUES ${placeholders.join(",")}`,
          values
        );
      } catch (error) {
        logger.error({ error, count: batch.length }, "Failed to flush summaries batch");
        throw error;
      }

      this.summaryQueue.splice(0, batch.length);
      flushed += batch.length;
      logger.info({ count: batch.length }, "Flushed summaries batch");
    }
    return flushed;
  }
}
