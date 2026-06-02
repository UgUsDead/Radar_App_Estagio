/**
 * App-wide constants.
 */

// Fall detection
export const FALL_Z_THRESHOLD = 0.6;
export const SPEED_CHANGE_THRESHOLD = 0.5;

// Rendering limits
export const MAX_RENDER_TARGETS = 10;
export const RENDER_FPS_CAP = 15; // ~66ms between renders
export const FRAME_FLUSH_DELAY_MS = 35;

// Protobuf / decoder limits
export const MAX_PROTO_TARGETS = 16;
export const MAX_PROTO_POINTS = 500;

// MQTT
export const MQTT_PORT = 1883;
export const MQTT_KEEPALIVE = 30;
export const PROBE_TIMEOUT_MS = 3500;
export const PROBE_BATCH_TIMEOUT_MS = 12000;
export const DEEP_SCAN_BATCH_SIZE = 18;
export const DEEP_SCAN_TIMEOUT_MS = 2800;

// Static subnets to always probe
export const STATIC_SUBNETS = [
  '192.168.43', // Android mobile hotspot
  '172.20.10',  // iOS personal hotspot
  '10.42.0',    // Linux (NetworkManager) hotspot
  '192.168.0',  // Common home router
  '192.168.1',  // Common home router (alt)
  '10.0.0',
];

// Provisioning
export const PROVISIONED_RADARS_KEY = '@radarapp/provisioned-radars-v1';

// Speed alert cooldown
export const SPEED_ALERT_COOLDOWN_MS = 4000;

// Stale target timeout (ms) — remove targets not seen for this long
export const STALE_TARGET_TIMEOUT_MS = 3000;
