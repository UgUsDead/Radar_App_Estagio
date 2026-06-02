/**
 * Radar configuration types matching the ESP32 firmware JSON schema.
 */

// ── ROI Box ──────────────────────────────────────────────
export interface ROIBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

// ── Full Radar Config ────────────────────────────────────
/**
 * Radar configuration matching the ESP32 firmware JSON schema.
 * Published to: `linovt/<device_id>/radar/config/set`
 * Read from: `linovt/<device_id>/radar/config/state` (Retained)
 */
export interface RadarConfig {
  schema: number;
  profile: string;
  applyMode: string;
  mount: {
    heightM: number;
    azimuthTiltDeg: number;
    elevationTiltDeg: number;
  };
  fov: {
    azimuthDeg: number;
    elevationDeg: number;
  };
  roi: {
    tracking: ROIBox;
    static: ROIBox;
    presence: ROIBox;
  };
  detection: {
    dynamicSensitivity: "low" | "normal" | "high";
    staticSensitivity: "low" | "normal" | "high";
    fineMotion: boolean;
  };
  tracking: {
    mode: "stable" | "balanced" | "responsive";
  };
  timing: {
    framePeriodMs: number;
  };
}

// ── Device State (from backend state store) ──────────────
export interface DeviceError {
  ok: false;
  context: string;
  error: string;
  receivedAt: number;
}

export interface DeviceState {
  deviceId: string;
  availability: "online" | "offline" | "unknown";
  status: Record<string, unknown> | null;
  lastError: DeviceError | null;
  radarStatus: string | null;
  radarConfigStatus: string | null;
  radarConfigState: RadarConfig | null;
  cmdStatus: string | null;
  radarCmdStatus: string | null;
  lastSeenAt: number;
  updatedAt: number;
}

// ── Config Apply State Machine ───────────────────────────
/**
 * Represents the lifecycle of applying a radar config:
 * 1. idle: No config changes in progress.
 * 2. publishing: UI published JSON to `radar/config/set`.
 * 3. accepted: Device validated config (radar/config/status = accepted).
 * 4. applying: Radar worker is applying config.
 * 5. applied/rejected/failed: Terminal states from device.
 * Note: Do NOT send rapid successive configs — wait for terminal states.
 */
export type ConfigApplyState =
  | "idle"
  | "publishing"
  | "accepted"
  | "applying"
  | "applied"
  | "rejected"
  | "failed";

// ── Validation Limits ────────────────────────────────────
export const RADAR_CONFIG_LIMITS = {
  mount: {
    heightM: { min: 0.5, max: 6.0, step: 0.1 },
    azimuthTiltDeg: { min: -45, max: 45, step: 1 },
    elevationTiltDeg: { min: -45, max: 45, step: 1 },
  },
  fov: {
    azimuthDeg: { min: 10, max: 120, step: 1 },
    elevationDeg: { min: 10, max: 120, step: 1 },
  },
  roi: {
    x: { min: -10, max: 10 },
    y: { min: -1, max: 12 },
    z: { min: -2, max: 6 },
  },
  timing: {
    framePeriodMs: { min: 40, max: 250, step: 5 },
  },
} as const;

// ── Default Config ───────────────────────────────────────
export const DEFAULT_RADAR_CONFIG: RadarConfig = {
  schema: 1,
  profile: "aop_6m_static_retention",
  applyMode: "restart",
  mount: {
    heightM: 2.0,
    azimuthTiltDeg: 0.0,
    elevationTiltDeg: 15.0,
  },
  fov: {
    azimuthDeg: 70.0,
    elevationDeg: 70.0,
  },
  roi: {
    tracking: { xMin: -4.0, xMax: 4.0, yMin: 0.0, yMax: 8.0, zMin: 0.0, zMax: 3.0 },
    static:   { xMin: -3.0, xMax: 3.0, yMin: 0.5, yMax: 7.5, zMin: 0.0, zMax: 3.0 },
    presence: { xMin: -3.0, xMax: 3.0, yMin: 0.5, yMax: 7.5, zMin: 0.0, zMax: 3.0 },
  },
  detection: {
    dynamicSensitivity: "normal",
    staticSensitivity: "normal",
    fineMotion: true,
  },
  tracking: {
    mode: "stable",
  },
  timing: {
    framePeriodMs: 55.0,
  },
};

// ── UI Labels ────────────────────────────────────────────
export const RADAR_CONFIG_LABELS: Record<string, { label: string; help: string }> = {
  "mount.heightM":            { label: "Altura de montagem",         help: "Altura do radar em relação ao chão, em metros." },
  "mount.azimuthTiltDeg":     { label: "Inclinação azimutal",        help: "Ângulo de instalação horizontal. Normalmente 0." },
  "mount.elevationTiltDeg":   { label: "Inclinação de elevação",     help: "Ângulo de instalação vertical. Valores positivos inclinam o radar para baixo." },
  "fov.azimuthDeg":           { label: "FOV Horizontal",             help: "Valores maiores detetam mais área lateral, mas podem incluir mais reflexões." },
  "fov.elevationDeg":         { label: "FOV Vertical",               help: "Valores maiores incluem mais área vertical." },
  "detection.dynamicSensitivity": { label: "Sensibilidade dinâmica", help: "Maior sensibilidade deteta movimentos mais fracos, mas pode aumentar falsos positivos." },
  "detection.staticSensitivity":  { label: "Sensibilidade estática", help: "Maior sensibilidade retém presença estacionária mais facilmente." },
  "detection.fineMotion":     { label: "Movimento fino",             help: "Ativa processamento de movimento fino. Recomendado para retenção estática." },
  "tracking.mode":            { label: "Modo de tracking",           help: "Estável é mais suave, responsivo reage mais rápido, equilibrado fica no meio." },
  "timing.framePeriodMs":     { label: "Período de frame",           help: "Valor menor dá atualizações mais rápidas mas mais processamento." },
};
