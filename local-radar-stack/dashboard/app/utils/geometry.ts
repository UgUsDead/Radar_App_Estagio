import { ZONE_GRAPH_SIZE, ZONE_WORLD_RANGE } from "../constants/zones";

export interface ZoneGraphBounds {
  roomWidthMeters: number;
  roomDepthMeters: number;
  originX: number;
  originY: number;
}

export const DEFAULT_ZONE_GRAPH_BOUNDS: ZoneGraphBounds = {
  roomWidthMeters: ZONE_WORLD_RANGE * 2,
  roomDepthMeters: ZONE_WORLD_RANGE * 2,
  originX: 0,
  originY: 0,
};

function sanitizeBounds(bounds?: Partial<ZoneGraphBounds>): ZoneGraphBounds {
  const roomWidthMeters = Number(bounds?.roomWidthMeters);
  const roomDepthMeters = Number(bounds?.roomDepthMeters);
  const originX = Number(bounds?.originX);
  const originY = Number(bounds?.originY);

  return {
    roomWidthMeters: Number.isFinite(roomWidthMeters) && roomWidthMeters > 0 ? roomWidthMeters : DEFAULT_ZONE_GRAPH_BOUNDS.roomWidthMeters,
    roomDepthMeters: Number.isFinite(roomDepthMeters) && roomDepthMeters > 0 ? roomDepthMeters : DEFAULT_ZONE_GRAPH_BOUNDS.roomDepthMeters,
    originX: Number.isFinite(originX) ? originX : DEFAULT_ZONE_GRAPH_BOUNDS.originX,
    originY: Number.isFinite(originY) ? originY : DEFAULT_ZONE_GRAPH_BOUNDS.originY,
  };
}

function toRangeAxis(value: number, origin: number, size: number): number {
  const min = origin - size / 2;
  return (value - min) / size;
}

function fromRangeAxis(normalized: number, origin: number, size: number): number {
  const min = origin - size / 2;
  return min + normalized * size;
}

export function worldToGraphPoint(point: { x: number; y: number }, bounds?: Partial<ZoneGraphBounds>) {
  const safeBounds = sanitizeBounds(bounds);
  const normalizedX = toRangeAxis(point.x, safeBounds.originX, safeBounds.roomWidthMeters);
  const normalizedY = toRangeAxis(point.y, safeBounds.originY, safeBounds.roomDepthMeters);
  return {
    x: normalizedX * ZONE_GRAPH_SIZE,
    y: ZONE_GRAPH_SIZE - normalizedY * ZONE_GRAPH_SIZE,
  };
}

export function graphToWorldPoint(x: number, y: number, bounds?: Partial<ZoneGraphBounds>) {
  const safeBounds = sanitizeBounds(bounds);
  const normalizedX = x / ZONE_GRAPH_SIZE;
  const normalizedY = 1 - y / ZONE_GRAPH_SIZE;
  return {
    x: Number(fromRangeAxis(normalizedX, safeBounds.originX, safeBounds.roomWidthMeters).toFixed(2)),
    y: Number(fromRangeAxis(normalizedY, safeBounds.originY, safeBounds.roomDepthMeters).toFixed(2)),
  };
}

export function sortPolygonPoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length < 3) return points;
  const cx = points.reduce((acc, p) => acc + p.x, 0) / points.length;
  const cy = points.reduce((acc, p) => acc + p.y, 0) / points.length;
  return [...points].sort((a, b) => {
    return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
  });
}
