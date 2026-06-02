import { apiFetch } from "../../utils/api";
import React, { useEffect, useState, useMemo } from "react";
import { ZONE_GRAPH_SIZE, ZONE_WORLD_RANGE } from "../../constants/zones";
import { HeatmapOverlay } from "./HeatmapOverlay";

interface HeatmapPoint {
  x: number;
  y: number;
  intensity: number;
}

interface Zone {
  id: string;
  name: string;
  type: string;
  polygon: Array<{ x: number; y: number }>;
  color?: string;
}

interface Props {
  patientId: number;
  zones: Zone[];
  room: { id: number; radar_id?: string | null; metadata?: Record<string, any> } | null;
  radarId?: string;
}

export function HeatmapSection({ patientId, zones, room, radarId }: Props) {
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{ x: number; y: number } | null>(null);
  const [isLive, setIsLive] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
  
  const roomModel = useMemo(() => {
    const meta = room?.metadata || {};
    return {
      roomWidthMeters: Number(meta.roomWidthMeters) || 12,
      roomDepthMeters: Number(meta.roomDepthMeters) || 12,
      originX: Number(meta.originX) || 0,
      originY: Number(meta.originY) || 0,
    };
  }, [room]);

  const { roomWidthMeters, roomDepthMeters, originX, originY } = roomModel;

  useEffect(() => {
    setLoading(true);
    apiFetch(`/monitor/patients/${patientId}/heatmap?hours=${hours}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error("Failed to load heatmap")))
      .then(json => {
        setPoints(json.points || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch heatmap", err);
        setPoints([]);
        setLoading(false);
      });
  }, [patientId, hours, apiBase]);

  useEffect(() => {
    if (!radarId) return;

    console.log(`Starting live tracking for radar: ${radarId}`);
    const token = typeof window !== "undefined" ? localStorage.getItem("radar_auth_token") : null;
    const sse = new EventSource(`${apiBase}/monitor/stream${token ? `?token=${token}` : ""}`);
    
    const onFrame = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.radarId === radarId && data.frame?.targets?.length > 0) {
          const target = data.frame.targets[0];
          setCurrentLocation({ x: target.x, y: target.y });
          setIsLive(true);
        }
      } catch (err) {
        console.error("Failed to parse SSE frame", err);
      }
    };

    sse.onmessage = onFrame;

    // Fallback: if no frame in 10s, consider not live
    const timeout = setTimeout(() => {
      if (!isLive) setIsLive(false);
    }, 10000);

    return () => {
      sse.close();
      clearTimeout(timeout);
    };
  }, [radarId, apiBase]);

  const [clinicalNotes, setClinicalNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (room?.metadata?.heatmap_clinical_notes) {
      setClinicalNotes(room.metadata.heatmap_clinical_notes);
    } else {
      setClinicalNotes("");
    }
  }, [room]);

  const saveNotes = async () => {
    if (!room?.id) return;
    setSavingNotes(true);
    try {
      const response = await apiFetch(`/rooms/${room.id}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heatmap_clinical_notes: clinicalNotes })
      });
      if (!response.ok) throw new Error("Failed to save");
    } catch (err) {
      console.error(err);
      alert("Erro ao guardar notas.");
    } finally {
      setSavingNotes(false);
    }
  };

  const graphZones = zones.map(z => ({
    ...z,
    graphPoints: z.polygon.map(p => ({
      x: ((p.x - originX + roomWidthMeters / 2) / roomWidthMeters) * ZONE_GRAPH_SIZE,
      y: ((p.y - originY + roomDepthMeters / 2) / roomDepthMeters) * ZONE_GRAPH_SIZE
    }))
  }));

  return (
    <section className="panel heatmap-section">
      <div className="flex justify-between items-center mb-4">
        <h2>Mapa de Calor de Atividade</h2>
        <div className="flex items-center gap-4">
          <span className="muted text-xs">Dimensões: {roomWidthMeters}m x {roomDepthMeters}m</span>
          <select 
            value={hours} 
            onChange={(e) => setHours(parseInt(e.target.value))}
            className="edit-score-input"
            style={{ width: 'auto' }}
          >
            <option value={8}>Últimas 8 horas</option>
            <option value={24}>Últimas 24 horas</option>
            <option value={72}>Últimos 3 dias</option>
            <option value={168}>Última semana</option>
          </select>
        </div>
      </div>

      <div className="heatmap-container" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <div className="zone-graph-panel" style={{ position: 'relative', width: ZONE_GRAPH_SIZE, height: ZONE_GRAPH_SIZE }}>
          <svg
            viewBox={`0 0 ${ZONE_GRAPH_SIZE} ${ZONE_GRAPH_SIZE}`}
            className="zone-graph"
            style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}
          >
            {/* Dynamic Grid Lines */}
            {Array.from({ length: Math.ceil(roomWidthMeters) }).map((_, i) => (
              <line 
                key={`vx-${i}`} 
                x1={(i * ZONE_GRAPH_SIZE) / roomWidthMeters} 
                y1={0} 
                x2={(i * ZONE_GRAPH_SIZE) / roomWidthMeters} 
                y2={ZONE_GRAPH_SIZE} 
                stroke="#e2e8f0" 
                strokeWidth="1" 
              />
            ))}
            {Array.from({ length: Math.ceil(roomDepthMeters) }).map((_, i) => (
              <line 
                key={`hy-${i}`} 
                x1={0} 
                y1={(i * ZONE_GRAPH_SIZE) / roomDepthMeters} 
                x2={ZONE_GRAPH_SIZE} 
                y2={(i * ZONE_GRAPH_SIZE) / roomDepthMeters} 
                stroke="#e2e8f0" 
                strokeWidth="1" 
              />
            ))}
            
            {/* Room Zones */}
            {graphZones.map(zone => {
              const pointsStr = zone.graphPoints.map(p => `${p.x},${p.y}`).join(" ");
              const cx = zone.graphPoints.reduce((sum, p) => sum + p.x, 0) / zone.graphPoints.length;
              const cy = zone.graphPoints.reduce((sum, p) => sum + p.y, 0) / zone.graphPoints.length;
              
              return (
                <g key={zone.id}>
                  <polygon
                    points={pointsStr}
                    fill={zone.color || "#cbd5e1"}
                    fillOpacity={0.15}
                    stroke={zone.color || "#64748b"}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    fill={zone.color || "#475569"}
                    style={{ fontSize: '10px', fontWeight: 'bold', pointerEvents: 'none', textShadow: '0 0 2px white' }}
                  >
                    {zone.name}
                  </text>
                </g>
              );
            })}

            {/* Heatmap Layer */}
            {!loading && (
              <HeatmapOverlay 
                points={points} 
                roomWidth={roomWidthMeters} 
                roomDepth={roomDepthMeters}
                originX={originX}
                originY={originY}
              />
            )}

            {/* Current Patient Location */}
            {currentLocation && (
              <g className="patient-marker">
                <defs>
                  <filter id="markerShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
                    <feOffset dx="0" dy="1" result="offsetblur" />
                    <feComponentTransfer>
                      <feFuncA type="linear" slope="0.3" />
                    </feComponentTransfer>
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                
                {/* Pulse Effect */}
                <circle
                  cx={((currentLocation.x - originX + roomWidthMeters / 2) / roomWidthMeters) * ZONE_GRAPH_SIZE}
                  cy={((currentLocation.y - originY + roomDepthMeters / 2) / roomDepthMeters) * ZONE_GRAPH_SIZE}
                  r={12}
                  fill="#3b82f6"
                  fillOpacity="0.3"
                >
                  <animate
                    attributeName="r"
                    values="8;16;8"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="fill-opacity"
                    values="0.4;0.1;0.4"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>

                {/* Main Marker */}
                <circle
                  cx={((currentLocation.x - originX + roomWidthMeters / 2) / roomWidthMeters) * ZONE_GRAPH_SIZE}
                  cy={((currentLocation.y - originY + roomDepthMeters / 2) / roomDepthMeters) * ZONE_GRAPH_SIZE}
                  r={6}
                  fill="#2563eb"
                  stroke="white"
                  strokeWidth="2"
                  filter="url(#markerShadow)"
                />
                
                <text
                  x={((currentLocation.x - originX + roomWidthMeters / 2) / roomWidthMeters) * ZONE_GRAPH_SIZE}
                  y={((currentLocation.y - originY + roomDepthMeters / 2) / roomDepthMeters) * ZONE_GRAPH_SIZE - 12}
                  textAnchor="middle"
                  fill="#1e40af"
                  style={{ fontSize: '10px', fontWeight: 'bold', textShadow: '0 0 4px white' }}
                >
                  Paciente (Live)
                </text>
              </g>
            )}
          </svg>
          
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.5)' }}>
              <span>A carregar heatmap...</span>
            </div>
          )}
        </div>

        <div className="heatmap-legend" style={{ flex: 1, minWidth: '300px' }}>
          <h3>Análise de Permanência</h3>
          <p className="muted text-xs mb-4">
            Este mapa mostra onde o paciente passou mais tempo nas últimas {hours} horas. 
            Áreas <strong>vermelhas</strong> indicam permanência prolongada.
          </p>
          
          <div className="insight-card" style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div className="flex justify-between items-center mb-2">
              <h4 style={{ margin: 0, fontSize: '14px', color: '#1e293b' }}>Notas de Observação Clínica</h4>
              <button 
                onClick={saveNotes} 
                disabled={savingNotes}
                className="btn-primary"
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                {savingNotes ? "A Guardar..." : "Guardar Notas"}
              </button>
            </div>
            <textarea
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Descreva observações sobre o padrão de movimento detetado (ex: permanência excessiva na casa de banho, imobilidade prolongada)..."
              style={{ 
                width: '100%', 
                height: '120px', 
                fontSize: '12px', 
                padding: '8px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1',
                resize: 'none',
                fontFamily: 'inherit'
              }}
            />
            <p className="muted" style={{ fontSize: '10px', marginTop: '8px' }}>
              Estas notas são persistentes e visíveis para outros profissionais de saúde ao analisar este mapa.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
