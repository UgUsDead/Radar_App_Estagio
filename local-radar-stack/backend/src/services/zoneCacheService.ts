import type { Pool } from "pg";
import { ZoneConfig, ZoneRoomModel } from "../schemas/index.js";
import { asRecord, parseZones, parseZoneRoomModel } from "../helpers/index.js";

const ZONE_CACHE_TTL_MS = 30_000;

export class ZoneCacheService {
  private cache = new Map<string, { zones: ZoneConfig[]; roomModel: ZoneRoomModel; fetchedAt: number }>();

  constructor(private pool: Pool) {}

  async loadRadarZoneConfig(radarId: string): Promise<{ zones: ZoneConfig[]; roomModel: ZoneRoomModel }> {
    const now = Date.now();
    const cached = this.cache.get(radarId);
    if (cached && now - cached.fetchedAt < ZONE_CACHE_TTL_MS) {
      return { zones: cached.zones, roomModel: cached.roomModel };
    }

    const { rows } = await this.pool.query(
      "SELECT metadata FROM radar_devices WHERE id = $1",
      [radarId]
    );

    if (rows.length === 0) {
      const roomModel = parseZoneRoomModel(undefined);
      this.cache.set(radarId, { zones: [], roomModel, fetchedAt: now });
      return { zones: [], roomModel };
    }

    const metadata = asRecord(rows[0]?.metadata);
    const zones = parseZones(metadata.zones);
    const roomModel = parseZoneRoomModel(metadata.zone_room_model);
    this.cache.set(radarId, { zones, roomModel, fetchedAt: now });
    return { zones, roomModel };
  }

  async loadRadarZones(radarId: string): Promise<ZoneConfig[]> {
    const config = await this.loadRadarZoneConfig(radarId);
    return config.zones;
  }

  async upsertRadarZones(
    radarId: string,
    zones: ZoneConfig[],
    roomModel?: ZoneRoomModel
  ): Promise<boolean> {
    const { rows } = await this.pool.query(
      "SELECT metadata FROM radar_devices WHERE id = $1",
      [radarId]
    );
    if (rows.length === 0) return false;

    const metadata = asRecord(rows[0]?.metadata);
    const nextRoomModel = roomModel ?? parseZoneRoomModel(metadata.zone_room_model);
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      zones,
      zone_room_model: nextRoomModel,
      zones_updated_at: new Date().toISOString(),
    };

    await this.pool.query(
      "UPDATE radar_devices SET metadata = $2::jsonb, updated_at = NOW() WHERE id = $1",
      [radarId, JSON.stringify(nextMetadata)]
    );

    this.cache.set(radarId, { zones, roomModel: nextRoomModel, fetchedAt: Date.now() });
    return true;
  }

  invalidate(radarId: string): void {
    this.cache.delete(radarId);
  }
}
