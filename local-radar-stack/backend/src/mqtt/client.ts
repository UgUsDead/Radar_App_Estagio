import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { DeviceStateStore } from "./deviceStateStore.js";

export interface MqttTelemetryClient {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isConnected: () => boolean;
  publish: (topic: string, payload: string | Buffer, opts?: { qos?: 0 | 1 | 2; retain?: boolean }) => void;
  getStateStore: () => DeviceStateStore;
}

/**
 * Known topic suffixes that the state store should track.
 * Based on the ESP32 radar device protocol (linovt/<device_id>/<suffix>).
 */
const STATE_SUFFIXES = [
  "availability",        // online/offline (Retained)
  "status",              // JSON {"boot":true} (Retained)
  "error",               // Error payloads
  "radar/status",        // idle/busy/started
  "radar/config/status", // accepted/applied/rejected/failed
  "radar/config/state",  // Current radar config JSON (Retained)
  "cmd/status",          // Generic command status
  "radar/cmd/status",    // Radar command status
] as const;

/**
 * Extract the radar/device ID and topic suffix from a `linovt/<id>/<suffix>` topic.
 * Returns null if the topic doesn't match the expected structure.
 */
function parseLinovtTopic(topic: string): { deviceId: string; suffix: string } | null {
  // Expected format: linovt/<device_id>/<suffix...>
  const match = topic.match(/^linovt\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { deviceId: match[1], suffix: match[2] };
}

export function createMqttTelemetryClient(
  onTelemetry: (radarId: string, payload: Buffer) => Promise<void>
): MqttTelemetryClient {
  let client: MqttClient | null = null;
  const stateStore = new DeviceStateStore();

  const options: IClientOptions = {
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: config.mqtt.clientId,
    reconnectPeriod: config.mqtt.reconnectPeriodMs,
    clean: true
  };

  /**
   * Topics to subscribe to. The telemetry topic comes from config (for backward compat).
   * We subscribe to device outbound topics. We do NOT subscribe to `*/set` topics
   * as the backend is the publisher for those.
   */
  const subscriptionTopics = [
    // Data
    config.mqtt.subTopic,                    // linovt/+/telemetry (from config)
    // Device State
    "linovt/+/availability",
    "linovt/+/status",
    "linovt/+/error",
    // Radar State
    "linovt/+/radar/status",
    "linovt/+/radar/config/status",
    "linovt/+/radar/config/state",
    // Command status
    "linovt/+/cmd/status",
    "linovt/+/radar/cmd/status",
  ];

  return {
    start: async () => {
      client = mqtt.connect(config.mqtt.url, options);

      client.on("connect", () => {
        logger.info({ broker: config.mqtt.url }, "MQTT connected");

        // Subscribe to all topics
        for (const topic of subscriptionTopics) {
          client?.subscribe(topic, { qos: 1 }, (error) => {
            if (error) {
              logger.error({ error, topic }, "MQTT subscribe failed");
              return;
            }
            logger.info({ topic }, "MQTT subscribed");
          });
        }
      });

      client.on("reconnect", () => {
        logger.warn("MQTT reconnecting");
      });

      client.on("offline", () => {
        logger.warn("MQTT offline");
      });

      client.on("error", (error) => {
        logger.error({ error }, "MQTT error");
      });

      client.on("message", (topic, payload) => {
        const parsed = parseLinovtTopic(topic);
        if (!parsed) {
          logger.warn({ topic }, "Unexpected MQTT topic format");
          return;
        }

        const { deviceId, suffix } = parsed;

        // Route telemetry to the existing pipeline
        if (suffix === "telemetry") {
          void onTelemetry(deviceId, payload).catch((error) => {
            logger.error({ error, radarId: deviceId }, "Telemetry handler failed");
          });
          return;
        }

        // Route state-related topics to the state store
        if ((STATE_SUFFIXES as readonly string[]).includes(suffix)) {
          try {
            stateStore.update(deviceId, suffix, payload.toString("utf-8"));
          } catch (error) {
            logger.error({ error, deviceId, suffix }, "State store update failed");
          }
          return;
        }

        // Ignore other topics silently (e.g. config/set which we publish, not receive)
      });
    },

    stop: async () => {
      if (!client) return;
      await new Promise<void>((resolve) => {
        client?.end(false, {}, () => resolve());
      });
      logger.info("MQTT client stopped");
    },

    isConnected: () => client?.connected || false,

    publish: (topic, payload, opts) => {
      if (!client?.connected) {
        logger.warn({ topic }, "Cannot publish: MQTT not connected");
        return;
      }
      client.publish(topic, payload, {
        qos: opts?.qos ?? 0,
        retain: opts?.retain ?? false,
      }, (error) => {
        if (error) {
          logger.error({ error, topic }, "MQTT publish failed");
        }
      });
    },

    getStateStore: () => stateStore,
  };
}
