import React from "react";
import { ZONE_GRAPH_SIZE } from "../../constants/zones";
import { zoneTypeColor } from "../../utils/formatting";

interface Props {
  zoneGridLines: Array<{ id: number; value: number }>;
  existingZoneGraphPolygons: Array<{
    id: string;
    name: string;
    type: "custom";
    color?: string;
    graphPolygon: Array<{ x: number; y: number }>;
  }>;
  editingZoneId: string | null;
  zoneDraftGraphPoints: Array<{ x: number; y: number }>;
  zoneDraftColor: string;
  liveTargetPoints?: Array<{ id: number; point: { x: number; y: number } }>;
  handleZoneGraphClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleMouseMoveGraph: (e: React.MouseEvent<SVGSVGElement>) => void;
  handleMouseUpGraph: () => void;
  handleMouseDownPoint: (e: React.MouseEvent, zoneId: string, pointIndex: number) => void;
  setZoneDraftPoints: (points: Array<{ x: number; y: number }> | ((prev: Array<{ x: number; y: number }>) => Array<{ x: number; y: number }>)) => void;
}

export function ZoneGraphCanvas({
  zoneGridLines,
  existingZoneGraphPolygons,
  editingZoneId,
  zoneDraftGraphPoints,
  zoneDraftColor,
  liveTargetPoints = [],
  handleZoneGraphClick,
  handleMouseMoveGraph,
  handleMouseUpGraph,
  handleMouseDownPoint,
  setZoneDraftPoints
}: Props) {
  return (
    <div className="zone-graph-panel">
      <svg
        className="zone-graph"
        viewBox={`0 0 ${ZONE_GRAPH_SIZE} ${ZONE_GRAPH_SIZE}`}
        onClick={handleZoneGraphClick}
        onMouseMove={handleMouseMoveGraph}
        onMouseUp={handleMouseUpGraph}
        onMouseLeave={handleMouseUpGraph}
      >
        {zoneGridLines.map((line) => (
          <g key={`grid-${line.id}`}>
            <line x1={line.value} y1={0} x2={line.value} y2={ZONE_GRAPH_SIZE} className="zone-grid-line" />
            <line x1={0} y1={line.value} x2={ZONE_GRAPH_SIZE} y2={line.value} className="zone-grid-line" />
          </g>
        ))}
        <line x1={ZONE_GRAPH_SIZE / 2} y1={0} x2={ZONE_GRAPH_SIZE / 2} y2={ZONE_GRAPH_SIZE} className="zone-axis-line" />
        <line x1={0} y1={ZONE_GRAPH_SIZE / 2} x2={ZONE_GRAPH_SIZE} y2={ZONE_GRAPH_SIZE / 2} className="zone-axis-line" />

        {existingZoneGraphPolygons
          .filter((z) => z.id !== editingZoneId)
          .map((zone) => {
          const points = zone.graphPolygon.map((point) => `${point.x},${point.y}`).join(" ");
          const color = zone.color || zoneTypeColor(zone.type);
          return (
            <g key={`zone-group-${zone.id}`}>
              <polygon
                points={points}
                fill={color}
                fillOpacity={0.18}
                stroke={color}
                strokeWidth={2}
              />
            </g>
          );
        })}

        {zoneDraftGraphPoints.length > 0 && (
          <g key="zone-draft-group">
            {zoneDraftGraphPoints.length >= 3 ? (
              <polygon
                points={zoneDraftGraphPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={zoneDraftColor}
                fillOpacity={0.32}
                stroke={zoneDraftColor}
                strokeWidth={3}
                strokeDasharray="4 2"
              />
            ) : (
              <polyline
                points={zoneDraftGraphPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={zoneDraftColor}
                strokeWidth={3}
                strokeDasharray="4 2"
              />
            )}
            
            {zoneDraftGraphPoints.map((point, index) => (
              <circle
                key={`draft-point-${index}`}
                cx={point.x}
                cy={point.y}
                r={7}
                fill={zoneDraftColor}
                stroke="white"
                strokeWidth={2}
                style={{ cursor: 'move' }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMouseDownPoint(e, "draft", index);
                }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setZoneDraftPoints(prev => prev.filter((_, i) => i !== index));
                }}
              />
            ))}
          </g>
        )}

        {liveTargetPoints.map((target) => (
          <circle
            key={`live-target-${target.id}`}
            cx={target.point.x}
            cy={target.point.y}
            r={6}
            fill="#ef4444"
            className="pulse-animation"
            style={{ pointerEvents: "none" }}
          />
        ))}
      </svg>

      <p className="muted zone-graph-help">
        Clique no gráfico para adicionar pontos. Use pelo menos 3 pontos para criar um polígono de zona.
      </p>

      <div className="zone-draft-actions">
        <button
          type="button"
          onClick={() => setZoneDraftPoints((prev) => prev.slice(0, -1))}
          disabled={zoneDraftGraphPoints.length === 0}
        >
          Anular Último Ponto
        </button>
        <button
          type="button"
          onClick={() => setZoneDraftPoints([])}
          disabled={zoneDraftGraphPoints.length === 0}
        >
          Limpar Pontos
        </button>
      </div>
    </div>
  );
}
