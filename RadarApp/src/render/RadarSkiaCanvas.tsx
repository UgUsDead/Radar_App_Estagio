import React, {useCallback, useMemo, useState} from 'react';
import {LayoutChangeEvent, View, StyleSheet} from 'react-native';
import {Canvas, Circle, Line, Path, Skia} from '@shopify/react-native-skia';
import {RadarData, ZoneConfig} from '../types';

interface Point2D {
  x: number;
  y: number;
}

interface RadarSkiaCanvasProps {
  radarData: RadarData | null;
  roomWidth: number;
  roomDepth: number;
  fallZThreshold: number;
  isDrawingZone: boolean;
  safeZonePoints: Point2D[];
  zones?: ZoneConfig[];
  onSafeZoneComplete: (points: Point2D[]) => void;
}

const DEFAULT_CANVAS_SIZE = 360;
const MIN_CANVAS_SIZE = 260;
const PADDING = 20;
const MAP_HEADROOM_FACTOR = 1.45;

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const RadarSkiaCanvas: React.FC<RadarSkiaCanvasProps> = ({
  radarData,
  roomWidth,
  roomDepth,
  fallZThreshold,
  isDrawingZone,
  safeZonePoints,
  zones = [],
  onSafeZoneComplete,
}) => {
  const [draftPoints, setDraftPoints] = useState<Point2D[]>([]);
  const [canvasSize, setCanvasSize] = useState(DEFAULT_CANVAS_SIZE);

  const safeRoomWidth = clamp(finiteNumber(roomWidth, 6), 2, 40);
  const safeRoomDepth = clamp(finiteNumber(roomDepth, 6), 2, 40);
  const safeFallThreshold = clamp(finiteNumber(fallZThreshold, 0.6), 0.1, 5);

  const baseHalfRangeX = safeRoomWidth / 2;
  const baseHalfRangeY = safeRoomDepth / 2;

  const dynamicHalfRange = useMemo(() => {
    const targets = radarData?.targets || [];
    let maxAbsX = baseHalfRangeX;
    let maxAbsY = baseHalfRangeY;
    for (const target of targets) {
      const tx = Number(target?.x);
      const ty = Number(target?.y);
      if (Number.isFinite(tx)) maxAbsX = Math.max(maxAbsX, Math.abs(tx));
      if (Number.isFinite(ty)) maxAbsY = Math.max(maxAbsY, Math.abs(ty));
    }
    return Math.max(maxAbsX, maxAbsY, 1) * MAP_HEADROOM_FACTOR;
  }, [radarData, baseHalfRangeX, baseHalfRangeY]);

  const xMin = -dynamicHalfRange;
  const xMax = dynamicHalfRange;
  const yMin = -dynamicHalfRange;
  const yMax = dynamicHalfRange;

  const plotSize = Math.max(10, canvasSize - PADDING * 2);
  const radarCenter = useMemo(
    () => ({x: canvasSize / 2, y: canvasSize / 2}),
    [canvasSize],
  );

  const toCanvas = useCallback((world: Point2D) => {
    const nx = clamp((world.x - xMin) / Math.max(0.001, xMax - xMin), 0, 1);
    const ny = clamp((world.y - yMin) / Math.max(0.001, yMax - yMin), 0, 1);
    return {
      x: PADDING + nx * plotSize,
      y: canvasSize - (PADDING + ny * plotSize),
    };
  }, [xMin, xMax, yMin, yMax, plotSize, canvasSize]);

  const toWorld = useCallback((canvas: Point2D): Point2D => {
    const nx = clamp((canvas.x - PADDING) / Math.max(0.001, plotSize), 0, 1);
    const ny = clamp((canvasSize - canvas.y - PADDING) / Math.max(0.001, plotSize), 0, 1);
    return {
      x: xMin + nx * (xMax - xMin),
      y: yMin + ny * (yMax - yMin),
    };
  }, [plotSize, canvasSize, xMin, xMax, yMin, yMax]);

  const radiusForZ = useCallback((z: number): number => {
    const normalized = clamp((z + 0.5) / 3.5, 0, 1);
    return 3 + normalized * 10;
  }, []);

  const gridLines = useMemo(() => {
    const lines: Array<{p1: Point2D; p2: Point2D}> = [];
    for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x += 1) {
      lines.push({p1: toCanvas({x, y: yMin}), p2: toCanvas({x, y: yMax})});
    }
    for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y += 1) {
      lines.push({p1: toCanvas({x: xMin, y}), p2: toCanvas({x: xMax, y})});
    }
    return lines;
  }, [xMin, xMax, yMin, yMax, toCanvas]);

  const targetDots = useMemo(() => {
    if (!radarData?.targets?.length) return [];
    return radarData.targets
      .filter(target =>
        Number.isFinite(target?.x) &&
        Number.isFinite(target?.y) &&
        Number.isFinite(target?.z),
      )
      .map(target => {
        const p = toCanvas({x: target.x, y: target.y});
        return {
          id: target.id,
          x: p.x,
          y: p.y,
          z: target.z,
          r: radiusForZ(target.z),
          color: target.z < safeFallThreshold ? '#ff3333' : '#00ff88',
        };
      });
  }, [radarData, safeFallThreshold, toCanvas, radiusForZ]);

  const normalizedSafeZonePoints = useMemo(
    () => safeZonePoints
      .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      .map(point => ({x: Number(point.x), y: Number(point.y)})),
    [safeZonePoints],
  );

  const zonePaths = useMemo(() => {
    return zones.map(zone => {
      if (!zone.polygon || zone.polygon.length < 3) return null;
      const path = Skia.Path.Make();
      const first = toCanvas(zone.polygon[0]);
      path.moveTo(first.x, first.y);
      for (let i = 1; i < zone.polygon.length; i += 1) {
        const point = toCanvas(zone.polygon[i]);
        path.lineTo(point.x, point.y);
      }
      path.close();
      return { path, color: zone.color || '#4488ff', priority: zone.priority || 'low' };
    }).filter(z => z !== null) as {path: any; color: string; priority: string}[];
  }, [zones, toCanvas]);

  const draftZonePath = useMemo(() => {
    if (draftPoints.length < 2) return null;
    const path = Skia.Path.Make();
    const first = toCanvas(draftPoints[0]);
    path.moveTo(first.x, first.y);
    for (let i = 1; i < draftPoints.length; i += 1) {
      const point = toCanvas(draftPoints[i]);
      path.lineTo(point.x, point.y);
    }
    return path;
  }, [draftPoints, toCanvas]);

  const onResponderRelease = (event: any) => {
    if (!isDrawingZone) return;
    const locationX = finiteNumber(event?.nativeEvent?.locationX, NaN);
    const locationY = finiteNumber(event?.nativeEvent?.locationY, NaN);
    if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) return;

    setDraftPoints(prev => {
      const next = [...prev, toWorld({x: locationX, y: locationY})];
      if (next.length >= 4) {
        onSafeZoneComplete(next.slice(0, 4));
        return [];
      }
      return next;
    });
  };

  const onContainerLayout = (event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    const side = Math.max(MIN_CANVAS_SIZE, Math.floor(Math.min(width, height) - 8));
    if (Number.isFinite(side) && side > 0 && Math.abs(side - canvasSize) >= 2) {
      setCanvasSize(side);
    }
  };

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      <View
        style={[styles.touchLayer, {width: canvasSize, height: canvasSize}]}
        onStartShouldSetResponder={() => isDrawingZone}
        onResponderRelease={onResponderRelease}>
        <Canvas style={styles.canvas}>
          {gridLines.map((line, idx) => (
            <Line
              key={`grid-${idx}`}
              p1={line.p1}
              p2={line.p2}
              color="#1f1f1f"
              style="stroke"
              strokeWidth={1}
            />
          ))}

          <Circle
            cx={radarCenter.x}
            cy={radarCenter.y}
            r={5}
            color="#00aaff"
          />

          {zonePaths.map((z, idx) => (
            <React.Fragment key={`zone-${idx}`}>
              <Path
                path={z.path}
                color={`${z.color}40`} // Add transparency
                style="fill"
              />
              <Path
                path={z.path}
                color={z.color}
                style="stroke"
                strokeWidth={2}
              />
            </React.Fragment>
          ))}

          {draftZonePath && (
            <Path
              path={draftZonePath}
              color="#ffaa44"
              style="stroke"
              strokeWidth={2}
            />
          )}

          {targetDots.map(dot => (
            <Circle key={`dot-${dot.id}`} cx={dot.x} cy={dot.y} r={dot.r} color={dot.color} />
          ))}
        </Canvas>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchLayer: {
    maxWidth: '100%',
    maxHeight: '100%',
  },
  canvas: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0a0a0a',
  },
});

export default RadarSkiaCanvas;
