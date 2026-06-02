"""
protobuf_encoder.py — Nanopb-compatible protobuf encoder.

Encodes radar telemetry in the EXACT wire format produced by the ESP32
firmware using nanopb.  Every field uses wire type 2 (length-delimited bytes)
with a fixed 4-byte little-endian payload (or 1 byte for booleans).

Proto schema (for reference):
  message Target {
      bytes tid      = 1;   // uint32 LE
      bytes posX     = 2;   // float LE
      bytes posY     = 3;
      bytes posZ     = 4;
      bytes velX     = 5;
      bytes velY     = 6;
      bytes velZ     = 7;
      bytes accX     = 8;
      bytes accY     = 9;
      bytes accZ     = 10;
      bytes conf     = 11;  // float LE
      bytes has_height = 12; // 1 byte bool
      bytes minZ     = 13;  // float LE
      bytes maxZ     = 14;  // float LE
  }
  message RadarMessage {
      bytes frame_number = 1;  // uint32 LE
      repeated Target targets = 2;
  }
"""

from __future__ import annotations

import struct
from dataclasses import dataclass


# ── Low-level wire helpers ──────────────────────────────────

def _varint(value: int) -> bytes:
    """Encode an unsigned varint."""
    buf = bytearray()
    while value > 0x7F:
        buf.append((value & 0x7F) | 0x80)
        value >>= 7
    buf.append(value & 0x7F)
    return bytes(buf)


def _tag(field_num: int, wire_type: int = 2) -> bytes:
    """Encode a protobuf field tag.  Default wire_type=2 (LEN)."""
    return _varint((field_num << 3) | wire_type)


def _len_field(field_num: int, data: bytes) -> bytes:
    """Tag + length + payload for a wire-type-2 field."""
    return _tag(field_num) + _varint(len(data)) + data


def _float_le(value: float) -> bytes:
    return struct.pack('<f', value)


def _uint32_le(value: int) -> bytes:
    return struct.pack('<I', value & 0xFFFFFFFF)


def _bool_byte(value: bool) -> bytes:
    return b'\x01' if value else b'\x00'


# ── Public dataclasses ──────────────────────────────────────

@dataclass(slots=True)
class TargetData:
    """All fields needed for one tracked target."""
    tid: int = 0
    pos_x: float = 0.0
    pos_y: float = 0.0
    pos_z: float = 0.0
    vel_x: float = 0.0
    vel_y: float = 0.0
    vel_z: float = 0.0
    acc_x: float = 0.0
    acc_y: float = 0.0
    acc_z: float = 0.0
    conf: float = 0.85
    has_height: bool = True
    min_z: float = 0.0
    max_z: float = 2.5


def encode_target(t: TargetData) -> bytes:
    """Encode a single Target sub-message (inner bytes, no outer tag)."""
    return (
        _len_field(1,  _uint32_le(t.tid))
        + _len_field(2,  _float_le(t.pos_x))
        + _len_field(3,  _float_le(t.pos_y))
        + _len_field(4,  _float_le(t.pos_z))
        + _len_field(5,  _float_le(t.vel_x))
        + _len_field(6,  _float_le(t.vel_y))
        + _len_field(7,  _float_le(t.vel_z))
        + _len_field(8,  _float_le(t.acc_x))
        + _len_field(9,  _float_le(t.acc_y))
        + _len_field(10, _float_le(t.acc_z))
        + _len_field(11, _float_le(t.conf))
        + _len_field(12, _bool_byte(t.has_height))
        + _len_field(13, _float_le(t.min_z))
        + _len_field(14, _float_le(t.max_z))
    )


def encode_radar_message(frame_number: int, targets: list[TargetData]) -> bytes:
    """
    Encode a full RadarMessage.

    Wire layout:
      field 1 (LEN) : 4-byte uint32 LE frame_number
      field 2 (LEN) : Target sub-message   (repeated — each one tagged separately)
    """
    buf = _len_field(1, _uint32_le(frame_number))
    for t in targets:
        inner = encode_target(t)
        buf += _len_field(2, inner)
    return buf
