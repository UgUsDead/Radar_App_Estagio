import { config } from "../config.js";
import type { DecodedFrame, Endianness, RadarTarget } from "../types.js";

const MAGIC_LITTLE = 0xa1;
const MAGIC_BIG = 0xb1;

interface VarintRead {
  value: number;
  nextOffset: number;
}

function readVarint(buffer: Buffer, startOffset: number): VarintRead | null {
  let value = 0;
  let shift = 0;
  let offset = startOffset;

  while (offset < buffer.length && shift <= 35) {
    const byte = buffer.readUInt8(offset);
    offset += 1;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value, nextOffset: offset };
    }
    shift += 7;
  }

  return null;
}

function parseLenDelimitedFields(buffer: Buffer): Map<number, Buffer[]> | null {
  let offset = 0;
  const fields = new Map<number, Buffer[]>();

  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    if (!tag) return null;

    offset = tag.nextOffset;
    const fieldNumber = tag.value >> 3;
    const wireType = tag.value & 0x07;

    if (fieldNumber <= 0) return null;

    if (wireType !== 2) {
      if (wireType === 0) {
        const skipped = readVarint(buffer, offset);
        if (!skipped) return null;
        offset = skipped.nextOffset;
        continue;
      }
      return null;
    }

    const len = readVarint(buffer, offset);
    if (!len) return null;
    offset = len.nextOffset;

    const end = offset + len.value;
    if (end > buffer.length) return null;

    const payload = buffer.subarray(offset, end);
    const list = fields.get(fieldNumber);
    if (list) list.push(payload);
    else fields.set(fieldNumber, [payload]);

    offset = end;
  }

  return fields;
}

function readU32LE(bytes?: Buffer): number {
  if (!bytes || bytes.length !== 4) return 0;
  return bytes.readUInt32LE(0);
}

function readF32LE(bytes?: Buffer): number {
  if (!bytes || bytes.length !== 4) return 0;
  return bytes.readFloatLE(0);
}

function parseNanopbTelemetry(radarId: string, payload: Buffer): DecodedFrame | null {
  const root = parseLenDelimitedFields(payload);
  if (!root) return null;

  const frameNumber = readU32LE(root.get(1)?.[0]);
  const targetMessages = root.get(2) ?? [];
  if (targetMessages.length === 0) return null;

  const targets: RadarTarget[] = [];

  for (const targetBytes of targetMessages) {
    const fields = parseLenDelimitedFields(targetBytes);
    if (!fields) continue;

    const id = readU32LE(fields.get(1)?.[0]);
    const x = readF32LE(fields.get(2)?.[0]);
    const y = readF32LE(fields.get(3)?.[0]);
    const z = readF32LE(fields.get(4)?.[0]);
    const vx = readF32LE(fields.get(5)?.[0]);
    const vy = readF32LE(fields.get(6)?.[0]);
    const vz = readF32LE(fields.get(7)?.[0]);
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const snr = readF32LE(fields.get(11)?.[0]);

    targets.push({
      id,
      x,
      y,
      z,
      vx,
      vy,
      vz,
      speed,
      snr: Number.isFinite(snr) ? snr : undefined
    });
  }

  if (targets.length === 0) return null;

  return {
    radarId,
    timestamp: Date.now(),
    endianness: "little",
    targets
  };
}

function parseJsonPayload(radarId: string, payload: Buffer): DecodedFrame | null {
  try {
    const parsed = JSON.parse(payload.toString("utf8")) as {
      timestamp?: number;
      targets?: Array<Partial<RadarTarget>>;
    };

    if (!Array.isArray(parsed.targets)) return null;

    const targets: RadarTarget[] = parsed.targets.map((t, idx) => {
      const vx = Number(t.vx ?? 0);
      const vy = Number(t.vy ?? 0);
      const vz = Number(t.vz ?? 0);
      return {
        id: Number(t.id ?? idx),
        x: Number(t.x ?? 0),
        y: Number(t.y ?? 0),
        z: Number(t.z ?? 0),
        vx,
        vy,
        vz,
        speed: Math.sqrt(vx * vx + vy * vy + vz * vz),
        snr: t.snr == null ? undefined : Number(t.snr)
      };
    });

    return {
      radarId,
      timestamp: parsed.timestamp ?? Date.now(),
      endianness: "little",
      targets
    };
  } catch {
    return null;
  }
}

function readI16(buffer: Buffer, offset: number, endianness: Endianness): number {
  return endianness === "little" ? buffer.readInt16LE(offset) : buffer.readInt16BE(offset);
}

function readU16(buffer: Buffer, offset: number, endianness: Endianness): number {
  return endianness === "little" ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function parseBinaryPayload(radarId: string, payload: Buffer): DecodedFrame | null {
  if (payload.length < 8) return null;
  const magic = payload.readUInt8(0);
  const endianness: Endianness = magic === MAGIC_BIG ? "big" : "little";
  if (magic !== MAGIC_LITTLE && magic !== MAGIC_BIG) return null;

  const timestampMs =
    endianness === "little" ? payload.readUInt32LE(1) : payload.readUInt32BE(1);

  const targetCount = readU16(payload, 5, endianness);
  const startOffset = 7;
  const bytesPerTarget = 14;
  const expected = startOffset + targetCount * bytesPerTarget;

  if (payload.length < expected) return null;

  const targets: RadarTarget[] = [];

  for (let index = 0; index < targetCount; index += 1) {
    const offset = startOffset + index * bytesPerTarget;

    const id = payload.readUInt8(offset);
    const x = readI16(payload, offset + 1, endianness) / 100;
    const y = readI16(payload, offset + 3, endianness) / 100;
    const z = readI16(payload, offset + 5, endianness) / 100;
    const vx = readI16(payload, offset + 7, endianness) / 100;
    const vy = readI16(payload, offset + 9, endianness) / 100;
    const vz = readI16(payload, offset + 11, endianness) / 100;
    const snr = payload.readUInt8(offset + 13);

    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

    targets.push({ id, x, y, z, vx, vy, vz, speed, snr });
  }

  return {
    radarId,
    timestamp: timestampMs > 0 ? timestampMs : Date.now(),
    endianness,
    targets
  };
}

function maybeDecodeBase64Payload(payload: Buffer): Buffer | null {
  const text = payload.toString("utf8").trim();
  if (text.length < 8 || text.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/=]+$/u.test(text)) return null;

  try {
    const decoded = Buffer.from(text, "base64");
    if (decoded.length === 0 || decoded.length === payload.length) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function decodePayload(radarId: string, payload: Buffer): DecodedFrame | null {
  const maybeDecoded = maybeDecodeBase64Payload(payload);
  const source = maybeDecoded ?? payload;

  if (config.decoder.mode === "json") return parseJsonPayload(radarId, payload);
  if (config.decoder.mode === "binary") return parseBinaryPayload(radarId, source);

  return (
    parseNanopbTelemetry(radarId, source) ??
    parseBinaryPayload(radarId, source) ??
    parseJsonPayload(radarId, payload)
  );
}
