import React, { useMemo } from "react";
import { ZONE_GRAPH_SIZE, ZONE_WORLD_RANGE } from "../../constants/zones";

interface HeatmapPoint {
  x: number;
  y: number;
  intensity: number;
}

interface Props {
  points: HeatmapPoint[];
  maxIntensity?: number;
  roomWidth: number;
  roomDepth: number;
  originX: number;
  originY: number;
}

export function HeatmapOverlay({ points, maxIntensity, roomWidth, roomDepth, originX, originY }: Props) {
  const memoizedPoints = useMemo(() => {
    if (points.length === 0) return [];
    
    const localMax = maxIntensity || Math.max(...points.map(p => p.intensity));
    
    return points.map(p => ({
      cx: ((p.x - originX + roomWidth / 2) / roomWidth) * ZONE_GRAPH_SIZE,
      cy: ((p.y - originY + roomDepth / 2) / roomDepth) * ZONE_GRAPH_SIZE,
      radius: 12, // smaller radius for better precision on large rooms
      opacity: Math.min(0.8, (p.intensity / localMax) * 1.5)
    }));
  }, [points, maxIntensity, roomWidth, roomDepth, originX, originY]);

  return (
    <g className="heatmap-layer">
      {/* We use radial gradients to simulate a heatmap blur */}
      <defs>
        <radialGradient id="heatmapGradient">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      
      {memoizedPoints.map((p, i) => {
        // Color mapping: 
        // We'll use CSS classes to handle colors or dynamic HSL
        const hue = Math.max(0, Math.min(240, 240 * (1 - p.opacity))); // 240 (blue) -> 0 (red)
        return (
          <circle
            key={`hmp-${i}`}
            cx={p.cx}
            cy={p.cy}
            r={p.radius}
            fill={`hsl(${hue}, 80%, 50%)`}
            fillOpacity={p.opacity * 0.4}
            style={{ mixBlendMode: 'multiply' }}
          />
        );
      })}
    </g>
  );
}
