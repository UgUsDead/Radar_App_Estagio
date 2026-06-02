import type { Pool } from "pg";
import { ZoneConfig } from "../schemas/index.js";
import { asRecord, parseZones } from "../helpers/index.js";

export class ReplayService {
  constructor(private pool: Pool) {}

  async getReplayEvent(eventId: number, ownerId?: number): Promise<{
    event: Record<string, unknown>;
    metadata: Record<string, unknown>;
    telemetry: unknown[];
    zones: ZoneConfig[];
  } | null> {
    const values: unknown[] = [eventId];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      ownerClause = ` AND e.owner_id = $${values.length}`;
    }
    const { rows } = await this.pool.query(
      `SELECT e.*, d.metadata AS radar_metadata
       FROM events e
       LEFT JOIN radar_devices d ON d.id = e.radar_id
       WHERE e.id = $1${ownerClause}`,
      values
    );

    if (rows.length === 0) return null;

    const row = rows[0] as Record<string, unknown>;
    const metadata = asRecord(row.metadata);
    const telemetry = Array.isArray(row.telemetry_snapshot) ? row.telemetry_snapshot : [];
    const zones = parseZones(asRecord(row.radar_metadata).zones);

    return {
      event: {
        id: row.id,
        radar_id: row.radar_id,
        type: row.type,
        timestamp: row.timestamp,
        duration: row.duration,
        metadata,
      },
      metadata,
      telemetry,
      zones,
    };
  }

  async persistEventMetadata(eventId: number, metadata: Record<string, unknown>, ownerId?: number): Promise<void> {
    const values: unknown[] = [eventId, JSON.stringify(metadata)];
    let ownerClause = "";
    if (Number.isInteger(ownerId)) {
      values.push(ownerId);
      ownerClause = ` AND owner_id = $${values.length}`;
    }
    await this.pool.query(
      `UPDATE events SET metadata = $2::jsonb WHERE id = $1${ownerClause}`,
      values
    );
  }
}
