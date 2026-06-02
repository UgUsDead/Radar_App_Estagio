/**
 * Shared types for the RadarApp.
 */

export interface RadarTarget {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  snr?: number;
}

// Domain Models (Synced with Dashboard)
export type RoomRow = {
  id: number;
  name: string;
  floor: number;
  notes: string | null;
  metadata?: Record<string, any>;
  patient_id: number | null;
  patient_name: string | null;
  radar_id: string | null;
  radar_status: string | null;
  safety_state?: string;
  occupancy?: number;
  last_activity_sec?: number;
  distance_moved_recent?: number;
};

export type Patient = {
  id: number;
  name: string;
  room_id: number | null;
  room_name: string | null;
};

export type EventRow = {
  id: number;
  radar_id: string;
  type: "fall" | "anomaly" | string;
  timestamp: string;
  room_name: string | null;
  patient_name: string | null;
  metadata?: Record<string, unknown>;
  alert_status?: "new" | "acknowledged" | "resolved";
  escalation_level?: "new" | "level_1" | "level_2" | "level_3";
  is_critical?: boolean;
};

// Zone Types
export type ZoneBehavior = "none" | "departure" | "arrival" | "transition" | "dwell";
export type ZoneType = "custom" | "bedside" | "bathroom" | "doorway";
export type ZonePriority = "low" | "medium" | "high";

export type ZoneConfig = {
  id: string;
  name: string;
  type: ZoneType;
  behavior: ZoneBehavior;
  polygon: Array<{ x: number; y: number }>;
  priority?: ZonePriority;
  triggersAlert: boolean;
  color?: string;
  dwellMinutes?: number;
  alertSchedule?: {
    startHour: number;
    endHour: number;
  };
};

export type ZoneRoomModel = {
  roomWidthMeters: number;
  roomDepthMeters: number;
  originX: number;
  originY: number;
};

/** Raw point-cloud point (future use for raw radar detections). */
export interface RadarPoint {
  x: number;
  y: number;
  z: number;
  velocity: number;
  snr: number;
}

export interface RadarData {
  frame: number;
  timestamp: number;
  targets: RadarTarget[];
  points?: RadarPoint[];
}

export interface ProvisioningState {
  step: 'scanning' | 'device_list' | 'wifi_form' | 'provisioning' | 'connected';
  devicePrefix: string;
  radarPassword: string;
  wifiSSID: string;
  wifiPassword: string;
  mqttBrokerURI: string;
  selectedDevice: any | null; // ESPDevice
  deviceList: any[];
  wifiList: { ssid: string; rssi: number; auth: number }[];
  status: string;
}

export interface AlertInfo {
  type: 'fall' | 'speed' | 'info';
  message: string;
  time: number;
  roomId?: number;
}

export interface SavedSettings {
  speedThreshold: number;
  fallZThreshold: number;
  safeZonePoints: { x: number; y: number }[];
  radarHeight: number;
  roomWidth: number;
  roomDepth: number;
  wifiSSID?: string;
}

export interface ProvisionedRadarProfile {
  id: string;
  name: string;
  devicePrefix: string;
  wifiSSID: string;
  lastBrokerIP: string;
  mqttBrokerURI: string;
  lastProvisionedAt: number;
}

export interface DiscoveredRadar {
  id: string;
  lastSeen: number;
  online: boolean;
}

// ── Radar Firmware Config (matches ESP32 JSON schema) ────

export interface ROIBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export interface RadarFirmwareConfig {
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
    dynamicSensitivity: 'low' | 'normal' | 'high';
    staticSensitivity: 'low' | 'normal' | 'high';
    fineMotion: boolean;
  };
  tracking: {
    mode: 'stable' | 'balanced' | 'responsive';
  };
  timing: {
    framePeriodMs: number;
  };
}

export interface DeviceFirmwareState {
  availability: 'online' | 'offline' | 'unknown';
  status: Record<string, unknown> | null;
  lastError: { context: string; error: string } | null;
  radarStatus: string | null;
  radarConfigStatus: string | null;
  radarConfigState: RadarFirmwareConfig | null;
  cmdStatus: string | null;
  radarCmdStatus: string | null;
}

// ── MQTT Log Entry (for ConnectionLogScreen) ─────────────

export type MQTTLogCategory =
  | 'CONNECTION'
  | 'AVAILABILITY'
  | 'STATUS'
  | 'ERROR'
  | 'RADAR_STATUS'
  | 'RADAR_CONFIG'
  | 'RADAR_CMD'
  | 'CMD'
  | 'TELEMETRY';

export interface MQTTLogEntry {
  timestamp: number;
  category: MQTTLogCategory;
  radarId: string | null;
  message: string;
  raw?: string;
}

