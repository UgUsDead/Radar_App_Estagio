import "dotenv/config";
import { z } from "zod";
import { randomUUID } from "node:crypto";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DEBUG_FRAMES: z.string().default("false"),
  DEBUG_MODE: z.string().default("false"),
  LOG_LEVEL: z.string().default("info"),

  MQTT_URL: z.string().min(1),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_CLIENT_ID: z.string().default("radar-backend"),
  MQTT_TOPIC: z.string().default("linovt/+/telemetry"),
  MQTT_RECONNECT_PERIOD_MS: z.coerce.number().default(2000),
  RADAR_OFFLINE_SECONDS: z.coerce.number().default(20),

  RADAR_PAYLOAD_MODE: z.enum(["auto", "binary", "json"]).default("auto"),

  FRAME_WINDOW_SECONDS: z.coerce.number().default(30),
  SUMMARY_INTERVAL_SECONDS: z.coerce.number().default(60),
  DOWNSAMPLE_HZ: z.coerce.number().default(1),
  JITTER_METERS: z.coerce.number().default(0.08),
  MAX_ABS_POSITION_METERS: z.coerce.number().default(25),
  MAX_ABS_VELOCITY_MPS: z.coerce.number().default(6),

  DATABASE_URL: z.string().min(1),
  DB_BATCH_SIZE: z.coerce.number().default(100),
  DB_FLUSH_INTERVAL_MS: z.coerce.number().default(2000),
  DB_MAX_RETRIES: z.coerce.number().default(5)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

const env = parsed.data;
const mqttClientId = process.env.MQTT_CLIENT_ID
  ? env.MQTT_CLIENT_ID
  : `radar-backend-${randomUUID().slice(0, 8)}`;

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  debugFrames: env.DEBUG_FRAMES === "true",
  debugMode: env.DEBUG_MODE === "true",
  logLevel: env.LOG_LEVEL,
  mqtt: {
    url: env.MQTT_URL,
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    clientId: mqttClientId,
    subTopic: env.MQTT_TOPIC,
    reconnectPeriodMs: env.MQTT_RECONNECT_PERIOD_MS,
    offlineSeconds: env.RADAR_OFFLINE_SECONDS
  },
  decoder: {
    mode: env.RADAR_PAYLOAD_MODE
  },
  processing: {
    frameWindowMs: env.FRAME_WINDOW_SECONDS * 1000,
    summaryIntervalMs: env.SUMMARY_INTERVAL_SECONDS * 1000,
    downsampleIntervalMs: Math.max(1000 / Math.max(env.DOWNSAMPLE_HZ, 0.1), 100),
    jitterMeters: env.JITTER_METERS,
    maxAbsPositionMeters: env.MAX_ABS_POSITION_METERS,
    maxAbsVelocityMps: env.MAX_ABS_VELOCITY_MPS
  },
  db: {
    databaseUrl: env.DATABASE_URL,
    batchSize: env.DB_BATCH_SIZE,
    flushIntervalMs: env.DB_FLUSH_INTERVAL_MS,
    maxRetries: env.DB_MAX_RETRIES
  }
} as const;
