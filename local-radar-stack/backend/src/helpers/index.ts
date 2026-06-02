import { z } from "zod";
import {
  ZoneConfig,
  ZoneRoomModel,
  ZonePriority,
  ReplayAnnotation,
  ReplayBookmark,
  zoneConfigArraySchema,
  zoneRoomModelSchema,
  replayAnnotationStoredSchema,
  replayBookmarkStoredSchema,
} from "../schemas/index.js";

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

import { logger } from "../logger.js";

export function parseZones(value: unknown, logId?: string): ZoneConfig[] {
  const parsed = zoneConfigArraySchema.safeParse(value);
  if (parsed.success) return parsed.data;
  
  if (value && Array.isArray(value) && value.length > 0) {
    logger.warn({ error: parsed.error.flatten(), logId }, "Invalid zone configuration dropped");
  }
  return [];
}

export function parseZoneRoomModel(value: unknown): ZoneRoomModel {
  const parsed = zoneRoomModelSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return {
    roomWidthMeters: 12,
    roomDepthMeters: 12,
    originX: 0,
    originY: 0,
  };
}

export function parseReplayAnnotations(metadata: Record<string, unknown>): ReplayAnnotation[] {
  const parsed = z.array(replayAnnotationStoredSchema).safeParse(metadata.replay_annotations);
  return parsed.success ? parsed.data : [];
}

export function parseReplayBookmarks(metadata: Record<string, unknown>): ReplayBookmark[] {
  const parsed = z.array(replayBookmarkStoredSchema).safeParse(metadata.replay_bookmarks);
  return parsed.success ? parsed.data : [];
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function pickZonePriority(zone: ZoneConfig, eventType: string): ZonePriority {
  if (zone.priority) return zone.priority;
  if (eventType === "fall" && zone.type === "bathroom") return "high";
  if (eventType === "fall" && zone.type === "doorway") return "medium";
  if (eventType === "anomaly" && zone.type === "bedside") return "low";
  return "medium";
}
