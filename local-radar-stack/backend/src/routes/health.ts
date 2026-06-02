import express from "express";
import { RadarRepository } from "../db/repository.js";
import { RateMonitor } from "../services/rateMonitor.js";
import { IngestLagTracker } from "../services/ingestLagTracker.js";
import { MqttTelemetryClient } from "../mqtt/client.js";

export interface HealthRouterDeps {
  repository: RadarRepository;
  rateMonitor: RateMonitor;
  ingestLagTracker: IngestLagTracker;
  mqttClient: MqttTelemetryClient;
}

export function createHealthRouter(deps: HealthRouterDeps): express.Router {
  const { repository, rateMonitor, ingestLagTracker, mqttClient } = deps;
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/monitor/health", async (_req, res) => {
    const queueDepth = repository.getQueueDepth();
    const flushMetrics = repository.getFlushMetrics();
    const heartbeat = await repository.getHeartbeatHealth();
    const messageRates = rateMonitor.snapshot();
    const ingestLag = ingestLagTracker.snapshot();

    res.json({
      ok: true,
      mqttConnected: mqttClient.isConnected(),
      queueDepth,
      flush: flushMetrics,
      heartbeat,
      messageRates,
      ingestLag,
      generatedAt: new Date().toISOString(),
    });
  });

  return router;
}
