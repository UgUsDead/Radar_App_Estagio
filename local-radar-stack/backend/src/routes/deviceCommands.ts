/**
 * deviceCommands.ts — REST API endpoints that proxy MQTT commands to ESP32 devices.
 *
 * All endpoints use the backend's MQTT client to publish commands/configs
 * and the DeviceStateStore to return cached device state.
 */

import express from "express";
import { DeviceStateStore } from "../mqtt/deviceStateStore.js";
import { MqttTelemetryClient } from "../mqtt/client.js";
import { logger } from "../logger.js";

export interface DeviceCommandRouterDeps {
  mqttClient: MqttTelemetryClient;
}

/** Validation limits matching the firmware spec. */
const LIMITS = {
  mount: { heightM: [0.5, 6.0], azimuthTiltDeg: [-45, 45], elevationTiltDeg: [-45, 45] },
  fov: { azimuthDeg: [10, 120], elevationDeg: [10, 120] },
  roi: { x: [-10, 10], y: [-1, 12], z: [-2, 6] },
  timing: { framePeriodMs: [40, 250] },
  detection: {
    dynamicSensitivity: ["low", "normal", "high"],
    staticSensitivity: ["low", "normal", "high"],
  },
  tracking: { mode: ["stable", "balanced", "responsive"] },
} as const;

const VALID_DEVICE_CMDS = ["status", "reboot"];
const VALID_RADAR_CMDS = ["status", "restart", "reset", "radar.restart", "default_config", "factory_reset", "config_get"];

function validateRadarConfig(config: Record<string, unknown>): string | null {
  // schema
  if (config.schema !== undefined && config.schema !== 1) {
    return "schema must be 1";
  }

  // mount
  if (config.mount && typeof config.mount === "object") {
    const mount = config.mount as Record<string, unknown>;
    if (mount.heightM !== undefined) {
      const v = Number(mount.heightM);
      if (!Number.isFinite(v) || v < LIMITS.mount.heightM[0] || v > LIMITS.mount.heightM[1]) {
        return `mount.heightM must be between ${LIMITS.mount.heightM[0]} and ${LIMITS.mount.heightM[1]}`;
      }
    }
    if (mount.azimuthTiltDeg !== undefined) {
      const v = Number(mount.azimuthTiltDeg);
      if (!Number.isFinite(v) || v < LIMITS.mount.azimuthTiltDeg[0] || v > LIMITS.mount.azimuthTiltDeg[1]) {
        return `mount.azimuthTiltDeg must be between ${LIMITS.mount.azimuthTiltDeg[0]} and ${LIMITS.mount.azimuthTiltDeg[1]}`;
      }
    }
    if (mount.elevationTiltDeg !== undefined) {
      const v = Number(mount.elevationTiltDeg);
      if (!Number.isFinite(v) || v < LIMITS.mount.elevationTiltDeg[0] || v > LIMITS.mount.elevationTiltDeg[1]) {
        return `mount.elevationTiltDeg must be between ${LIMITS.mount.elevationTiltDeg[0]} and ${LIMITS.mount.elevationTiltDeg[1]}`;
      }
    }
  }

  // fov
  if (config.fov && typeof config.fov === "object") {
    const fov = config.fov as Record<string, unknown>;
    if (fov.azimuthDeg !== undefined) {
      const v = Number(fov.azimuthDeg);
      if (!Number.isFinite(v) || v < LIMITS.fov.azimuthDeg[0] || v > LIMITS.fov.azimuthDeg[1]) {
        return `fov.azimuthDeg must be between ${LIMITS.fov.azimuthDeg[0]} and ${LIMITS.fov.azimuthDeg[1]}`;
      }
    }
    if (fov.elevationDeg !== undefined) {
      const v = Number(fov.elevationDeg);
      if (!Number.isFinite(v) || v < LIMITS.fov.elevationDeg[0] || v > LIMITS.fov.elevationDeg[1]) {
        return `fov.elevationDeg must be between ${LIMITS.fov.elevationDeg[0]} and ${LIMITS.fov.elevationDeg[1]}`;
      }
    }
  }

  // roi boxes
  if (config.roi && typeof config.roi === "object") {
    const roi = config.roi as Record<string, unknown>;
    for (const boxName of ["tracking", "static", "presence"]) {
      const box = roi[boxName];
      if (box && typeof box === "object") {
        const b = box as Record<string, unknown>;
        for (const [axis, [min, max]] of Object.entries({ x: LIMITS.roi.x, y: LIMITS.roi.y, z: LIMITS.roi.z })) {
          const lo = Number(b[`${axis}Min`]);
          const hi = Number(b[`${axis}Max`]);
          if (b[`${axis}Min`] !== undefined && (!Number.isFinite(lo) || lo < min || lo > max)) {
            return `roi.${boxName}.${axis}Min must be between ${min} and ${max}`;
          }
          if (b[`${axis}Max`] !== undefined && (!Number.isFinite(hi) || hi < min || hi > max)) {
            return `roi.${boxName}.${axis}Max must be between ${min} and ${max}`;
          }
          if (b[`${axis}Min`] !== undefined && b[`${axis}Max`] !== undefined && lo >= hi) {
            return `roi.${boxName}.${axis}Min must be less than ${axis}Max`;
          }
        }
      }
    }
  }

  // detection
  if (config.detection && typeof config.detection === "object") {
    const det = config.detection as Record<string, unknown>;
    if (det.dynamicSensitivity !== undefined && !LIMITS.detection.dynamicSensitivity.includes(det.dynamicSensitivity as any)) {
      return `detection.dynamicSensitivity must be one of: ${LIMITS.detection.dynamicSensitivity.join(", ")}`;
    }
    if (det.staticSensitivity !== undefined && !LIMITS.detection.staticSensitivity.includes(det.staticSensitivity as any)) {
      return `detection.staticSensitivity must be one of: ${LIMITS.detection.staticSensitivity.join(", ")}`;
    }
    if (det.fineMotion !== undefined && typeof det.fineMotion !== "boolean") {
      return "detection.fineMotion must be a boolean";
    }
  }

  // tracking
  if (config.tracking && typeof config.tracking === "object") {
    const tracking = config.tracking as Record<string, unknown>;
    if (tracking.mode !== undefined && !LIMITS.tracking.mode.includes(tracking.mode as any)) {
      return `tracking.mode must be one of: ${LIMITS.tracking.mode.join(", ")}`;
    }
  }

  // timing
  if (config.timing && typeof config.timing === "object") {
    const timing = config.timing as Record<string, unknown>;
    if (timing.framePeriodMs !== undefined) {
      const v = Number(timing.framePeriodMs);
      if (!Number.isFinite(v) || v < LIMITS.timing.framePeriodMs[0] || v > LIMITS.timing.framePeriodMs[1]) {
        return `timing.framePeriodMs must be between ${LIMITS.timing.framePeriodMs[0]} and ${LIMITS.timing.framePeriodMs[1]}`;
      }
    }
  }

  return null;
}

export function createDeviceCommandRouter(deps: DeviceCommandRouterDeps): express.Router {
  const { mqttClient } = deps;
  const router = express.Router();

  const stateStore = mqttClient.getStateStore();

  // ── GET /devices/:id/state — Return cached device state ────────────────
  router.get("/devices/:id/state", (req, res) => {
    const deviceId = req.params.id;
    const state = stateStore.getDeviceState(deviceId);
    if (!state) {
      res.json({
        deviceId,
        availability: "unknown",
        status: null,
        lastError: null,
        radarStatus: null,
        radarConfigStatus: null,
        radarConfigState: null,
        cmdStatus: null,
        radarCmdStatus: null,
        lastSeenAt: 0,
        updatedAt: 0,
      });
      return;
    }
    res.json({ deviceId, ...state });
  });

  // ── GET /devices — List all known devices from state store ─────────────
  router.get("/devices", (_req, res) => {
    const all = stateStore.getAllDevices();
    res.json(all);
  });

  // ── POST /devices/:id/cmd — Send generic device command ────────────────
  router.post("/devices/:id/cmd", (req, res) => {
    const deviceId = req.params.id;
    const cmd = String(req.body?.cmd ?? req.body?.type ?? "").trim();

    if (!cmd) {
      res.status(400).json({ error: "Missing 'cmd' field" });
      return;
    }

    if (!VALID_DEVICE_CMDS.includes(cmd)) {
      res.status(400).json({ error: `Invalid command. Valid commands: ${VALID_DEVICE_CMDS.join(", ")}` });
      return;
    }

    if (!mqttClient.isConnected()) {
      res.status(503).json({ error: "MQTT not connected" });
      return;
    }

    const topic = `linovt/${deviceId}/cmd`;
    mqttClient.publish(topic, JSON.stringify({ cmd }));
    logger.info({ deviceId, cmd, topic }, "Device command published");
    res.json({ ok: true, deviceId, cmd, topic });
  });

  // ── POST /devices/:id/radar/cmd — Send radar command ───────────────────
  router.post("/devices/:id/radar/cmd", (req, res) => {
    const deviceId = req.params.id;
    const cmd = String(req.body?.cmd ?? req.body?.type ?? "").trim();

    if (!cmd) {
      res.status(400).json({ error: "Missing 'cmd' field" });
      return;
    }

    if (!VALID_RADAR_CMDS.includes(cmd)) {
      res.status(400).json({ error: `Invalid radar command. Valid commands: ${VALID_RADAR_CMDS.join(", ")}` });
      return;
    }

    if (!mqttClient.isConnected()) {
      res.status(503).json({ error: "MQTT not connected" });
      return;
    }

    const topic = `linovt/${deviceId}/radar/cmd`;
    mqttClient.publish(topic, JSON.stringify({ cmd }));
    logger.info({ deviceId, cmd, topic }, "Radar command published");
    res.json({ ok: true, deviceId, cmd, topic });
  });

  // ── GET /devices/:id/radar/config — Return cached radar config state ───
  router.get("/devices/:id/radar/config", (req, res) => {
    const deviceId = req.params.id;
    const state = stateStore.getDeviceState(deviceId);
    res.json({
      deviceId,
      radarConfigState: state?.radarConfigState ?? null,
      radarConfigStatus: state?.radarConfigStatus ?? null,
    });
  });

  const publishRadarConfig = (req: express.Request, res: express.Response) => {
    const deviceId = req.params.id;
    const configPayload = req.body;

    if (!configPayload || typeof configPayload !== "object") {
      res.status(400).json({ error: "Request body must be a JSON radar config object" });
      return;
    }

    // Validate against firmware limits
    const validationError = validateRadarConfig(configPayload);
    if (validationError) {
      logger.warn({ deviceId, validationError, configPayload }, "Radar config validation failed");
      res.status(400).json({ error: validationError });
      return;
    }

    if (!mqttClient.isConnected()) {
      logger.error({ deviceId, topic: `linovt/${deviceId}/radar/config/set` }, "Cannot publish radar config: MQTT not connected");
      res.status(503).json({ error: "MQTT not connected" });
      return;
    }

    const topic = `linovt/${deviceId}/radar/config/set`;
    const payload = JSON.stringify(configPayload);
    
    logger.info({ deviceId, topic, payload: configPayload }, "Publishing radar config to MQTT");
    
    mqttClient.publish(topic, payload);
    res.json({ ok: true, deviceId, topic, status: "published" });
  };

  // ── PUT/POST /devices/:id/radar/config — Publish radar config to device ─────
  router.put("/devices/:id/radar/config", publishRadarConfig);
  router.post("/devices/:id/radar/config", publishRadarConfig);

  // ── POST /devices/:id/radar/config/get — Request device to publish its stored config
  router.post("/devices/:id/radar/config/get", (req, res) => {
    const deviceId = req.params.id;

    if (!mqttClient.isConnected()) {
      res.status(503).json({ error: "MQTT not connected" });
      return;
    }

    const topic = `linovt/${deviceId}/radar/config/get`;
    mqttClient.publish(topic, "");
    logger.info({ deviceId, topic }, "Radar config get request published");
    res.json({ ok: true, deviceId, topic, status: "requested" });
  });

  // ── GET /devices/:id/logs — Return buffered log entries ──────────────
  router.get("/devices/:id/logs", (req, res) => {
    const deviceId = req.params.id;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const category = req.query.category ? String(req.query.category) : undefined;
    const importance = req.query.importance ? String(req.query.importance) as any : undefined;

    const logs = stateStore.getDeviceLogs(deviceId, { limit, category, importance });
    res.json({ deviceId, count: logs.length, logs });
  });

  return router;
}
