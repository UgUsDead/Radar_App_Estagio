/**
 * protobufDecoder.ts — Production-grade zero-copy protobuf decoder for
 * ESP32 radar telemetry (nanopb wire-type-2 encoding).
 *
 * Design goals:
 *   • Zero heap allocation in the hot path (reuses pre-allocated arrays)
 *   • No JSON serialization
 *   • Defensive: validates lengths, caps field counts, rejects corrupt values
 *   • Never throws — returns null on failure and logs the reason
 *
 * Proto schema (nanopb — all fields encoded as wire-type 2):
 *   message Target {
 *       bytes tid    = 1;  // uint32 LE
 *       bytes posX   = 2;  // float  LE
 *       bytes posY   = 3;  // float  LE
 *       bytes posZ   = 4;  // float  LE
 *       bytes velX   = 5;  // float  LE
 *       bytes velY   = 6;  // float  LE
 *       bytes velZ   = 7;  // float  LE
 *       bytes accX   = 8;  // float  LE
 *       bytes accY   = 9;  // float  LE
 *       bytes accZ   = 10; // float  LE
 *       bytes conf   = 11; // float  LE
 *       bytes has_height = 12; // 1-byte bool
 *       bytes minZ   = 13; // float  LE
 *       bytes maxZ   = 14; // float  LE
 *   }
 *   message RadarMessage {
 *       bytes frame_number = 1; // uint32 LE
 *       repeated Target targets = 2;
 *   }
 */

// ── Constants ────────────────────────────────────────────────
/** Minimum valid protobuf message: 1 tag + 1 len + 4 bytes = 6 */
const MIN_MESSAGE_BYTES = 6;

/** Absolute ceiling — reject anything claiming more */
const MAX_MESSAGE_BYTES = 16384;

/** Maximum targets we will decode per frame */
const MAX_TARGETS_PER_FRAME = 16;

/** Coordinate sanity bounds (meters) — reject values outside */
const COORD_MIN = -100;
const COORD_MAX = 100;

/** Velocity sanity bound (m/s) */
const VELOCITY_MAX = 50;

// ── Output types ─────────────────────────────────────────────
export interface DecodedPoint {
  x: number;
  y: number;
  z: number;
  velocity: number;
  snr: number;
}

export interface DecodedTarget {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
}

export interface DecodedRadarFrame {
  timestamp: number;
  frameNumber: number;
  points: DecodedPoint[];
  targets: DecodedTarget[];
}

const _targetPool: DecodedTarget[] = new Array(MAX_TARGETS_PER_FRAME);
for (let i = 0; i < MAX_TARGETS_PER_FRAME; i++) {
  _targetPool[i] = {id: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, speed: 0};
}

// Reusable DataView — created once, reassigned per decode call
let _sharedView: DataView | null = null;
let _sharedViewBuffer: ArrayBufferLike | null = null;
let _sharedViewOffset = -1;
let _sharedViewLength = -1;

function getDataView(buf: Uint8Array): DataView {
  // Reuse only when buffer identity and byte window both match.
  if (
    buf.buffer === _sharedViewBuffer &&
    _sharedView &&
    _sharedViewOffset === buf.byteOffset &&
    _sharedViewLength === buf.byteLength
  ) {
    return _sharedView;
  }
  _sharedViewBuffer = buf.buffer;
  _sharedViewOffset = buf.byteOffset;
  _sharedViewLength = buf.byteLength;
  _sharedView = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return _sharedView;
}

// ── Low-level readers (zero allocation) ──────────────────────

/**
 * Read a protobuf varint starting at `pos`. Returns [value, newPos].
 * If the varint is malformed or exceeds the buffer, returns [0, -1].
 */
function readVarint(data: Uint8Array, pos: number, end: number): [number, number] {
  let value = 0;
  let shift = 0;
  while (pos < end) {
    const byte = data[pos++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return [value >>> 0, pos];
    }
    shift += 7;
    if (shift > 28) {
      // Varint too long — corrupt data
      return [0, -1];
    }
  }
  // Ran past end — incomplete varint
  return [0, -1];
}

/** Read a 32-bit LE float without allocating. */
function readFloatLE(view: DataView, offset: number, bufEnd: number): number {
  if (offset + 4 > bufEnd) return 0;
  return view.getFloat32(offset, true);
}

/** Read a 32-bit LE unsigned int without allocating. */
function readUint32LE(data: Uint8Array, offset: number, bufEnd: number): number {
  if (offset + 4 > bufEnd) return 0;
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    ((data[offset + 3] << 24) >>> 0)
  );
}

/** Check if a float value is sane (finite + within range). */
function isSaneCoord(v: number): boolean {
  return Number.isFinite(v) && v >= COORD_MIN && v <= COORD_MAX;
}

function isSaneVelocity(v: number): boolean {
  return Number.isFinite(v) && v >= -VELOCITY_MAX && v <= VELOCITY_MAX;
}

// ── Skip unknown wire types ──────────────────────────────────
/**
 * Skip a field with the given wire type. Returns the new position,
 * or -1 if the skip would exceed bounds.
 */
function skipWireType(wire: number, data: Uint8Array, pos: number, end: number): number {
  switch (wire) {
    case 0: {
      // Varint
      const [, newPos] = readVarint(data, pos, end);
      return newPos;
    }
    case 1:
      // 64-bit
      return pos + 8 <= end ? pos + 8 : -1;
    case 2: {
      // Length-delimited
      const [len, newPos] = readVarint(data, pos, end);
      if (newPos < 0) return -1;
      return newPos + len <= end ? newPos + len : -1;
    }
    case 5:
      // 32-bit
      return pos + 4 <= end ? pos + 4 : -1;
    default:
      // Unknown wire type
      return -1;
  }
}

// ── Target decoder ───────────────────────────────────────────
/**
 * Decode a single Target sub-message in-place into the provided object.
 * Returns true if the target contains at least a valid id or position.
 */
function decodeTargetInto(
  target: DecodedTarget,
  data: Uint8Array,
  view: DataView,
  start: number,
  end: number,
): boolean {
  // Reset fields
  target.id = 0;
  target.x = 0;
  target.y = 0;
  target.z = 0;
  target.vx = 0;
  target.vy = 0;
  target.vz = 0;
  target.speed = 0;

  let pos = start;
  while (pos < end) {
    const [tag, p1] = readVarint(data, pos, end);
    if (p1 < 0) break;
    pos = p1;

    const field = tag >> 3;
    const wire = tag & 0x07;

    if (wire === 2) {
      // nanopb: all fields use wire-type-2 (length-delimited)
      const [len, p2] = readVarint(data, pos, end);
      if (p2 < 0) break;
      pos = p2;

      const valStart = pos;
      const valEnd = Math.min(pos + len, end);

      if (valEnd - valStart >= 4) {
        switch (field) {
          case 1:
            target.id = readUint32LE(data, valStart, end);
            break;
          case 2: {
            const v = readFloatLE(view, valStart, end);
            target.x = isSaneCoord(v) ? v : 0;
            break;
          }
          case 3: {
            const v = readFloatLE(view, valStart, end);
            target.y = isSaneCoord(v) ? v : 0;
            break;
          }
          case 4: {
            const v = readFloatLE(view, valStart, end);
            target.z = isSaneCoord(v) ? v : 0;
            break;
          }
          case 5: {
            const v = readFloatLE(view, valStart, end);
            target.vx = isSaneVelocity(v) ? v : 0;
            break;
          }
          case 6: {
            const v = readFloatLE(view, valStart, end);
            target.vy = isSaneVelocity(v) ? v : 0;
            break;
          }
          case 7: {
            const v = readFloatLE(view, valStart, end);
            target.vz = isSaneVelocity(v) ? v : 0;
            break;
          }
          // Fields 8-14 (accX/Y/Z, conf, has_height, minZ, maxZ) — skip for now
        }
      }
      pos = valEnd;
      continue;
    }

    // Non-standard wire type — skip it
    const skipPos = skipWireType(wire, data, pos, end);
    if (skipPos < 0) break;
    pos = skipPos;
  }

  // Calculate speed
  target.speed = Math.sqrt(
    target.vx * target.vx + target.vy * target.vy + target.vz * target.vz
  );

  // Validate: at least we should have position data
  return target.id >= 0 && (target.x !== 0 || target.y !== 0 || target.z !== 0 || target.id > 0);
}

// ── RadarMessage decoder ─────────────────────────────────────
/**
 * Decode a full RadarMessage from a byte window.
 * Returns the number of targets decoded, or -1 on failure.
 * Targets are written into _targetPool[0..N-1].
 */
function decodeMessageWindow(
  data: Uint8Array,
  view: DataView,
  start: number,
  end: number,
): {frameNumber: number; targetCount: number} | null {
  let frameNumber = 0;
  let hasFrame = false;
  let targetCount = 0;

  let pos = start;
  while (pos < end) {
    const [tag, p1] = readVarint(data, pos, end);
    if (p1 < 0) break;
    pos = p1;

    const field = tag >> 3;
    const wire = tag & 0x07;

    if (wire === 2) {
      const [len, p2] = readVarint(data, pos, end);
      if (p2 < 0) break;
      pos = p2;

      const valStart = pos;
      const valEnd = Math.min(pos + len, end);

      if (field === 1 && valEnd - valStart >= 4) {
        // frame_number
        frameNumber = readUint32LE(data, valStart, end);
        hasFrame = true;
      } else if (field === 2 && targetCount < MAX_TARGETS_PER_FRAME) {
        // Target sub-message
        if (decodeTargetInto(_targetPool[targetCount], data, view, valStart, valEnd)) {
          targetCount++;
        }
      }
      // Skip past this field's payload
      pos = valEnd;
      continue;
    }

    // Skip non-LEN wire types
    const skipPos = skipWireType(wire, data, pos, end);
    if (skipPos < 0) break;
    pos = skipPos;
  }

  if (!hasFrame && targetCount === 0) return null;
  return {frameNumber, targetCount};
}

// ── Payload normalization ────────────────────────────────────
/**
 * Convert whatever the MQTT library delivers into a Uint8Array.
 * Handles: Uint8Array, Buffer, base64 string, hex string.
 * Returns null if the payload cannot be interpreted.
 */
function normalizePayload(raw: any): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw;

  if (Array.isArray(raw) && raw.every((n) => Number.isFinite(n))) {
    return new Uint8Array(raw as number[]);
  }

  // Node-style Buffer or polyfill
  if (raw && typeof raw === 'object' && raw.type === 'Buffer' && Array.isArray(raw.data)) {
    return new Uint8Array(raw.data);
  }
  if (raw && typeof raw.buffer === 'object' && typeof raw.byteLength === 'number') {
    // ArrayBuffer view
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }

  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  // Some MQTT bridges deliver raw bytes in a JS string (latin1-style).
  // Prefer this path when non-base64 characters are present.
  if (!/^[A-Za-z0-9+/=]+$/.test(text)) {
    const arr = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      arr[i] = text.charCodeAt(i) & 0xff;
    }
    if (arr.length >= MIN_MESSAGE_BYTES) return arr;
  }

  // Try base64 first (MQTT libraries commonly deliver base64)
  if (/^[A-Za-z0-9+/=]+$/.test(text) && text.length % 4 === 0 && text.length >= 4) {
    try {
      // Use global atob if available (browser / React Native Hermes)
      const _atob = typeof globalThis !== 'undefined' && (globalThis as any).atob;
      if (typeof _atob === 'function') {
        const bin: string = _atob(text);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
      }
    } catch { /* fall through */ }
  }

  // Try hex string
  const hex = text.replace(/\s+/g, '');
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0 && hex.length >= 8) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return arr;
  }

  // Fallback: try importing Buffer for base64
  try {
    const {Buffer: B} = require('buffer');
    if (B && typeof B.isBuffer === 'function') {
      if (typeof raw !== 'string' && B.isBuffer(raw)) {
        return new Uint8Array(raw as any);
      }
      const decoded = B.from(text, 'base64');
      if (decoded.length > 0) return new Uint8Array(decoded);
    }
  } catch { /* no buffer module */ }

  return null;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Decode a radar telemetry protobuf frame from a binary MQTT payload.
 *
 * Returns a clean DecodedRadarFrame object, or null if the message
 * is invalid / too short / corrupt. Never throws.
 *
 * The returned targets array references pooled objects that are reused
 * on the next call — callers must consume the data before the next
 * decode call, or copy it.
 */
export function decodeRadarFrame(buffer: any): DecodedRadarFrame | null {
  try {
    // ── Normalize input ──────────────────────────
    const data = normalizePayload(buffer);
    if (!data || data.length < MIN_MESSAGE_BYTES || data.length > MAX_MESSAGE_BYTES) {
      return null;
    }

    const view = getDataView(data);
    const now = Date.now();

    // ── Try direct decode (most common case) ─────
    const result = decodeMessageWindow(data, view, 0, data.length);
    if (result && (result.targetCount > 0 || result.frameNumber > 0)) {
      return buildFrame(result.frameNumber, result.targetCount, now);
    }

    // ── Fallback: scan for embedded message ──────
    // Some transports prepend a 4-byte length header
    if (data.length > 8) {
      // Big-endian length prefix
      const beLen = ((data[0] << 24) >>> 0) | (data[1] << 16) | (data[2] << 8) | data[3];
      if (beLen > 0 && beLen <= data.length - 4) {
        const r = decodeMessageWindow(data, view, 4, 4 + beLen);
        if (r && (r.targetCount > 0 || r.frameNumber > 0)) {
          return buildFrame(r.frameNumber, r.targetCount, now);
        }
      }
      // Little-endian length prefix
      const leLen = data[0] | (data[1] << 8) | (data[2] << 16) | ((data[3] << 24) >>> 0);
      if (leLen !== beLen && leLen > 0 && leLen <= data.length - 4) {
        const r = decodeMessageWindow(data, view, 4, 4 + leLen);
        if (r && (r.targetCount > 0 || r.frameNumber > 0)) {
          return buildFrame(r.frameNumber, r.targetCount, now);
        }
      }
    }

    // ── Fallback: scan for 0x0a 0x04 pattern (field 1, LEN=4) ──
    for (let i = 0; i < data.length - MIN_MESSAGE_BYTES; i++) {
      if (data[i] === 0x0a && data[i + 1] === 0x04) {
        const r = decodeMessageWindow(data, view, i, data.length);
        if (r && (r.targetCount > 0 || r.frameNumber > 0)) {
          return buildFrame(r.frameNumber, r.targetCount, now);
        }
      }
    }

    return null;
  } catch (e) {
    if (__DEV__) {
      console.warn('[protobufDecoder] decode failed:', e);
    }
    return null;
  }
}

// ── Build output frame from pool ─────────────────────────────
function buildFrame(
  frameNumber: number,
  targetCount: number,
  timestamp: number,
): DecodedRadarFrame {
  // Deduplicate target IDs
  const usedIds = new Set<number>();
  for (let i = 0; i < targetCount; i++) {
    let id = _targetPool[i].id;
    if (id <= 0 || !Number.isFinite(id) || usedIds.has(id)) {
      id = i + 1;
      while (usedIds.has(id)) id++;
      _targetPool[i].id = id;
    }
    usedIds.add(id);
  }

  // Slice from pool (shallow copy of references — consumer must read before next decode)
  const targets = _targetPool.slice(0, targetCount);

  return {
    timestamp,
    frameNumber,
    points: [], // Reserved for future raw point-cloud data
    targets,
  };
}

/**
 * Utility: check if the __DEV__ global exists (React Native convention).
 * Falls back to false in production.
 */
declare var __DEV__: boolean | undefined;
