/**
 * deviceStateStore.ts — In-memory store for per-device MQTT state.
 *
 * Caches the latest availability, status, error, radar status,
 * radar config status, and radar config state received from each device.
 * Also maintains a ring buffer of log entries per device.
 */

import { logger } from "../logger.js";

/** Maximum number of log entries kept per device. */
const MAX_LOG_ENTRIES = 500;

/** Importance level for log entries. 'critical' entries may be persisted to the database. */
export type LogImportance = "info" | "warning" | "critical";

export interface LogEntry {
  timestamp: number;
  suffix: string;
  category: "availability" | "status" | "error" | "radar_status" | "radar_config" | "radar_cmd" | "cmd" | "unknown";
  importance: LogImportance;
  payload: string;
  parsed?: Record<string, unknown> | null;
}

export interface DeviceError {
  ok: false;
  context: string;
  error: string;
  receivedAt: number;
}

export interface DeviceState {
  availability: "online" | "offline" | "unknown";
  status: Record<string, unknown> | null;
  lastError: DeviceError | null;
  radarStatus: string | null;
  radarConfigStatus: string | null;
  radarConfigState: Record<string, unknown> | null;
  cmdStatus: string | null;
  radarCmdStatus: string | null;
  lastSeenAt: number;
  updatedAt: number;
  logs: LogEntry[];
}

function emptyState(): DeviceState {
  return {
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
    logs: [],
  };
}

/** Map a topic suffix to a log category. */
function suffixToCategory(suffix: string): LogEntry["category"] {
  if (suffix === "availability") return "availability";
  if (suffix === "status") return "status";
  if (suffix === "error") return "error";
  if (suffix === "radar/status") return "radar_status";
  if (suffix === "radar/config/status" || suffix === "radar/config/state") return "radar_config";
  if (suffix === "radar/cmd/status") return "radar_cmd";
  if (suffix === "cmd/status") return "cmd";
  return "unknown";
}

/** Determine importance of a log entry based on suffix + payload content. */
function determineImportance(suffix: string, payload: string): LogImportance {
  // Errors are always critical
  if (suffix === "error") return "critical";
  // Availability changes are warnings
  if (suffix === "availability") return payload.trim() === "offline" ? "critical" : "warning";
  
  // Radar config status follows the Config Apply State Machine:
  // - accepted (info): Device validated JSON
  // - applying (info): Radar worker applying
  // - applied (warning): Config applied successfully (important state change)
  // - rejected/failed (critical): Config application failed
  if (suffix === "radar/config/status") {
    const trimmed = payload.trim();
    if (trimmed.includes("failed") || trimmed.includes("rejected")) return "critical";
    if (trimmed.includes("applied")) return "warning";
  }
  return "info";
}

export class DeviceStateStore {
  private readonly devices = new Map<string, DeviceState>();

  /** Get or create state entry for a device. */
  private ensure(deviceId: string): DeviceState {
    let state = this.devices.get(deviceId);
    if (!state) {
      state = emptyState();
      this.devices.set(deviceId, state);
    }
    return state;
  }

  /** Update device state based on a received MQTT topic suffix and payload. */
  update(deviceId: string, topicSuffix: string, payload: string): void {
    const state = this.ensure(deviceId);
    const now = Date.now();
    state.lastSeenAt = now;
    state.updatedAt = now;

    // Append log entry (ring buffer)
    let parsedObj: Record<string, unknown> | null = null;
    try { parsedObj = JSON.parse(payload); } catch { /* not JSON */ }

    const logEntry: LogEntry = {
      timestamp: now,
      suffix: topicSuffix,
      category: suffixToCategory(topicSuffix),
      importance: determineImportance(topicSuffix, payload),
      payload: payload.substring(0, 2000), // cap payload size in logs
      parsed: parsedObj,
    };
    state.logs.push(logEntry);
    if (state.logs.length > MAX_LOG_ENTRIES) {
      state.logs = state.logs.slice(-MAX_LOG_ENTRIES);
    }

    switch (topicSuffix) {
      case "availability":
        state.availability = payload.trim() === "online" ? "online" : "offline";
        break;

      case "status":
        state.status = parsedObj ?? { raw: payload.trim() };
        break;

      case "error":
        if (parsedObj) {
          state.lastError = {
            ok: false,
            context: String(parsedObj.context ?? "unknown"),
            error: String(parsedObj.error ?? payload),
            receivedAt: now,
          };
        } else {
          state.lastError = {
            ok: false,
            context: "unknown",
            error: payload.trim(),
            receivedAt: now,
          };
        }
        break;

      case "radar/status":
        state.radarStatus = parsedObj?.status != null ? String(parsedObj.status) : payload.trim();
        break;

      case "radar/config/status":
        state.radarConfigStatus = parsedObj?.status != null ? String(parsedObj.status) : payload.trim();
        break;

      case "radar/config/state":
        if (parsedObj) {
          state.radarConfigState = parsedObj;
        } else {
          logger.warn({ deviceId }, "Failed to parse radar/config/state payload");
        }
        break;

      case "cmd/status":
        state.cmdStatus = parsedObj?.status != null ? String(parsedObj.status) : payload.trim();
        break;

      case "radar/cmd/status":
        state.radarCmdStatus = parsedObj?.status != null ? String(parsedObj.status) : payload.trim();
        break;

      default:
        logger.debug({ deviceId, topicSuffix }, "Unhandled topic suffix in state store");
        break;
    }
  }

  /** Get the cached state for a specific device. */
  getDeviceState(deviceId: string): DeviceState | null {
    return this.devices.get(deviceId) ?? null;
  }

  /** Get log entries for a device, optionally filtered. */
  getDeviceLogs(
    deviceId: string,
    options?: { limit?: number; category?: string; importance?: LogImportance }
  ): LogEntry[] {
    const state = this.devices.get(deviceId);
    if (!state) return [];

    let logs = state.logs;
    if (options?.category) {
      logs = logs.filter((l) => l.category === options.category);
    }
    if (options?.importance) {
      logs = logs.filter((l) => l.importance === options.importance);
    }
    if (options?.limit && options.limit > 0) {
      logs = logs.slice(-options.limit);
    }
    return logs;
  }

  /** Get all known device IDs and their states. */
  getAllDevices(): Array<{ deviceId: string; state: DeviceState }> {
    return Array.from(this.devices.entries()).map(([deviceId, state]) => ({
      deviceId,
      state,
    }));
  }

  /** Clear state for a device. */
  clearDevice(deviceId: string): void {
    this.devices.delete(deviceId);
  }
}
