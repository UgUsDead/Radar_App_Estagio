import { z } from "zod";

export const assignRadarSchema = z.object({
  radarId: z.string().min(1),
  roomId: z.number().int().nullable()
});

export const roomSchema = z.object({
  name: z.string().min(1),
  floor: z.number().int(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const patientSchema = z.object({
  name: z.string().min(1),
  roomId: z.number().int().nullable(),
  metadata: z.record(z.unknown()).optional().default({})
});

export const updatePatientSchema = z.object({
  name: z.string().min(1).optional(),
  roomId: z.number().int().nullable().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const assignPatientSchema = z.object({
  patientId: z.number().int(),
  roomId: z.number().int().nullable()
});

export const eventActionSchema = z.object({
  actor: z.string().min(1).optional(),
  notes: z.string().optional(),
  outcome: z.string().optional(),
  action_taken: z.string().optional(),
  intervention_type: z.string().optional(),
  root_cause: z.string().optional()
});

export type ZoneType = "bedside" | "bathroom" | "doorway" | "custom";
export type ZonePriority = "low" | "medium" | "high";

export interface ZonePoint {
  x: number;
  y: number;
}

export interface ZoneConfig {
  id: string;
  name: string;
  type: ZoneType;
  behavior: "none" | "departure" | "arrival" | "transition" | "dwell";
  polygon: ZonePoint[];
  priority?: ZonePriority;
  triggersAlert?: boolean;
  color?: string;
  dwellMinutes?: number;
  alertSchedule?: {
    startHour: number;
    endHour: number;
  };
}

export interface ZoneRoomModel {
  roomWidthMeters: number;
  roomDepthMeters: number;
  originX: number;
  originY: number;
}

export interface ReplayAnnotation {
  id: string;
  frameIndex: number;
  timestampMs: number;
  comment: string;
  createdAt: string;
}

export interface ReplayBookmark {
  id: string;
  frameIndex: number;
  timestampMs: number;
  label: string;
  createdAt: string;
}

export const zonePointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const zoneConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["bedside", "bathroom", "doorway", "custom"]),
  behavior: z.enum(["none", "departure", "arrival", "transition", "dwell"]).optional().default("none"),
  polygon: z.array(zonePointSchema).min(3),
  priority: z.enum(["low", "medium", "high"]).optional(),
  triggersAlert: z.boolean().optional().default(true),
  color: z.string().optional(),
  dwellMinutes: z.number().finite().min(1).max(180).optional(),
  alertSchedule: z
    .object({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
    })
    .optional(),
});

export const zoneConfigArraySchema = z.array(zoneConfigSchema).max(20);

export const zoneRoomModelSchema = z.object({
  roomWidthMeters: z.number().finite().min(2).max(40),
  roomDepthMeters: z.number().finite().min(2).max(40),
  originX: z.number().finite().min(-20).max(20),
  originY: z.number().finite().min(-20).max(20),
});

export const replayAnnotationCreateSchema = z.object({
  frameIndex: z.number().int().min(0),
  timestampMs: z.number().finite().min(0),
  comment: z.string().trim().min(1).max(1200),
});

export const replayBookmarkCreateSchema = z.object({
  frameIndex: z.number().int().min(0),
  timestampMs: z.number().finite().min(0),
  label: z.string().trim().min(1).max(180).optional(),
});

export const replayAnnotationStoredSchema = replayAnnotationCreateSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1),
});

export const replayBookmarkStoredSchema = replayBookmarkCreateSchema.extend({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(180),
  createdAt: z.string().min(1),
});
