import { EventEmitter } from "events";
import { config } from "./config.js";
import { createPgPool } from "./db/postgres.js";
import { RadarRepository } from "./db/repository.js";
import { logger } from "./logger.js";
import { createMqttTelemetryClient } from "./mqtt/client.js";
import { decodePayload } from "./processor/decoder.js";
import { RadarPipeline } from "./processor/pipeline.js";
import { validateFrame } from "./processor/validation.js";
import { RateMonitor } from "./services/rateMonitor.js";
import { escalationService } from "./services/alertEscalationService.js";
import { HeatmapAggregationService } from "./services/heatmapService.js";
import { IngestLagTracker } from "./services/ingestLagTracker.js";
import { ZoneCacheService } from "./services/zoneCacheService.js";
import { ReplayService } from "./services/replayService.js";
import { PushNotificationService } from "./services/pushNotificationService.js";
import { createApp } from "./app.js";
import { MqttTelemetryClient } from "./mqtt/client.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

async function main(): Promise<void> {
  const pool = createPgPool();
  const repository = new RadarRepository(pool);
  await repository.initialize();

  const frameStream = new EventEmitter();
  const rateMonitor = new RateMonitor();
  const ingestLagTracker = new IngestLagTracker();
  const zoneCacheService = new ZoneCacheService(pool);
  const replayService = new ReplayService(pool);
  const heatmapService = new HeatmapAggregationService(pool);

  // Push notifications
  const pushNotificationService = new PushNotificationService(pool);
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const serviceAccountPath = resolve(__dirname, "../firebase-service-account.json");
  await pushNotificationService.initialize(serviceAccountPath);

  const pipeline = new RadarPipeline(repository, heatmapService, frameStream, pushNotificationService);

  // MQTT telemetry ingestion
  const mqttClient = createMqttTelemetryClient(async (radarId, payload) => {
    rateMonitor.mark(radarId);

    const decoded = decodePayload(radarId, payload);
    if (!decoded) {
      pipeline.countDrop(radarId);
      logger.warn(
        { radarId, payloadBytes: payload.length, payloadHexPrefix: payload.subarray(0, 24).toString("hex") },
        "Dropped frame: decode failed"
      );
      return;
    }

    const valid = validateFrame(decoded);
    if (!valid) {
      pipeline.countDrop(radarId);
      logger.warn({ radarId }, "Dropped frame: invalid values");
      return;
    }

    ingestLagTracker.record(radarId, valid.timestamp);

    const zones = await zoneCacheService.loadRadarZones(radarId);

    frameStream.emit("frame", {
      radarId,
      frame: { timestamp: valid.timestamp, sequenceId: valid.timestamp, targets: valid.targets },
      zones,
    });

    await pipeline.ingest(valid);
  });

  // Create and start Express app
  const app = createApp({
    pool,
    repository,
    rateMonitor,
    ingestLagTracker,
    zoneCacheService,
    replayService,
    pushNotificationService,
    frameStream,
    mqttClient,
    pipeline,
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "API server listening");
  });

  rateMonitor.start();
  await mqttClient.start();

  // Background jobs
  const escalationBackgroundJob = setInterval(async () => {
    try {
      const activeEvents = await repository.getEvents(100);
      for (const e of activeEvents as any[]) {
        const alertStatus = e.alert_status ?? "new";
        if (alertStatus === "resolved" || alertStatus === "closed") continue;

        const acknowledgedAt = e.metadata?.acknowledged_at;
        const currentEscalation = e.metadata?.escalation_level ?? "new";
        const newEscalation = escalationService.determineEscalationLevel(
          e.timestamp, new Date(),
          alertStatus === "acknowledged" ? acknowledgedAt : undefined
        );

        if (newEscalation !== currentEscalation && newEscalation !== "new") {
          await repository.updateEventAlertStatus(e.id, alertStatus, "system-escalation", {
            escalation_level: newEscalation
          });
          logger.info({ eventId: e.id, newEscalation }, "Escalated event automatically");
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed during escalation background job");
    }
  }, 60 * 1000);

  const flushTimer = setInterval(() => {
    void repository.flush().catch((error) => {
      logger.error({ error }, "DB flush failed");
    });
  }, config.db.flushIntervalMs);

  const offlineTimer = setInterval(() => {
    void repository.markOfflineDevices().then((count) => {
      if (count > 0) {
        logger.warn({ count }, "Devices marked offline");
      }
    }).catch((error) => {
      logger.error({ error }, "Offline detection failed");
    });
  }, 5_000);

  // Graceful shutdown
  const shutdown = async () => {
    clearInterval(escalationBackgroundJob);
    clearInterval(flushTimer);
    clearInterval(offlineTimer);
    heatmapService.stop();
    rateMonitor.stop();
    await repository.flush();
    await mqttClient.stop();
    await pool.end();
    server.close(() => {
      logger.info("Backend shutdown complete");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : error }, "Fatal startup error");
  process.exit(1);
});
