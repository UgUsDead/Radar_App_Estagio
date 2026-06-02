import { apiFetch } from "../utils/api";
import { subscribeToStream } from "../utils/stream";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ZoneConfig, ZoneBehavior, ZonePriority } from "../types/zones";
import { RoomRow } from "../types/domain";
import { ZONE_GRAPH_SIZE } from "../constants/zones";

export function useZoneEditor(
  rooms: RoomRow[],
  load: () => Promise<void>,
  markInteracting: () => void,
  markDoneInteracting: () => void
) {
  const [selectedZoneRadarId, setSelectedZoneRadarId] = useState<string>("");
  const [zones, setZones] = useState<ZoneConfig[]>([]);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zonesBusy, setZonesBusy] = useState(false);
  const [zoneMessage, setZoneMessage] = useState("");

  const [zoneDraftName, setZoneDraftName] = useState("");
  const [zoneDraftBehavior, setZoneDraftBehavior] = useState<ZoneBehavior>("none");
  const [zoneDraftPriority, setZoneDraftPriority] = useState<ZonePriority>("medium");
  const [zoneDraftPoints, setZoneDraftPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [zoneDraftTriggersAlert, setZoneDraftTriggersAlert] = useState(true);
  const [zoneDraftColor, setZoneDraftColor] = useState("#2563eb");
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [zoneDraftDwellMinutes, setZoneDraftDwellMinutes] = useState(5);
  const [zoneDraftSchedule, setZoneDraftSchedule] = useState({ startHour: 0, endHour: 23 });

  const [copySourceRadarId, setCopySourceRadarId] = useState("");
  const [liveTargets, setLiveTargets] = useState<Array<{ id: number; x: number; y: number }>>([]);

  // Refs for drag interaction
  const draggingPointIndexRef = useRef<number | null>(null);
  const justFinishedDragRef = useRef(false);

  // Derive room dimensions from selected radar's room
  const activeRoomModel = useMemo(() => {
    const activeRoom = rooms.find(r => r.radar_id === selectedZoneRadarId);
    if (activeRoom && activeRoom.metadata) {
      const model = (activeRoom.metadata as any).zone_room_model ?? activeRoom.metadata;
      return {
        roomWidthMeters: Number(model.roomWidthMeters) || 12,
        roomDepthMeters: Number(model.roomDepthMeters) || 12,
        originX: Number(model.originX) || 0,
        originY: Number(model.originY) || 0,
        radarHeightMeters: Number(model.radarHeightMeters) || 2.5
      };
    }
    return {
      roomWidthMeters: 12,
      roomDepthMeters: 12,
      originX: 0,
      originY: 0,
      radarHeightMeters: 2.5
    };
  }, [rooms, selectedZoneRadarId]);

  const loadZonesForRadar = useCallback(async (radarId: string) => {
    if (!radarId) return;
    setZonesBusy(true);
    setZoneMessage("");
    try {
      const response = await apiFetch(`/radars/${radarId}/zones`);
      if (!response.ok) throw new Error("API Error");
      const data = await response.json();
      setZones(data.zones || []);
    } catch {
      setZoneMessage("Falha ao carregar zonas.");
    } finally {
      setZonesBusy(false);
    }
  }, []);

  const resetZoneDraft = useCallback(() => {
    setZoneDraftName("");
    setZoneDraftBehavior("none");
    setZoneDraftPriority("medium");
    setZoneDraftPoints([]);
    setZoneDraftTriggersAlert(true);
    setZoneDraftColor("#2563eb");
    setZoneDraftDwellMinutes(5);
    setZoneDraftSchedule({ startHour: 0, endHour: 23 });
    setEditingZoneId(null);
  }, []);

  const editZone = useCallback((zone: ZoneConfig) => {
    setEditingZoneId(zone.id);
    setZoneDraftName(zone.name);
    setZoneDraftBehavior(zone.behavior);
    setZoneDraftPriority(zone.priority || "medium");
    setZoneDraftPoints(zone.polygon);
    setZoneDraftTriggersAlert(zone.triggersAlert);
    setZoneDraftColor(zone.color || "#2563eb");
    setZoneDraftDwellMinutes(zone.dwellMinutes || 5);
    if (zone.alertSchedule) {
      setZoneDraftSchedule(zone.alertSchedule);
    } else {
      setZoneDraftSchedule({ startHour: 0, endHour: 23 });
    }
  }, []);

  const upsertZoneDraft = useCallback(() => {
    if (!zoneDraftName.trim() || zoneDraftPoints.length < 3) {
      setZoneMessage("A zona precisa de um nome e pelo menos 3 pontos.");
      return;
    }

    const newZone: ZoneConfig = {
      id: editingZoneId || Math.random().toString(36).substring(2, 9),
      name: zoneDraftName,
      type: "custom",
      behavior: zoneDraftBehavior,
      polygon: zoneDraftPoints,
      priority: zoneDraftPriority,
      triggersAlert: zoneDraftTriggersAlert,
      color: zoneDraftColor,
      dwellMinutes: zoneDraftDwellMinutes,
      alertSchedule: zoneDraftSchedule
    };

    setZones(prev => {
      const filtered = prev.filter(z => z.id !== newZone.id);
      return [...filtered, newZone];
    });
    resetZoneDraft();
  }, [editingZoneId, zoneDraftName, zoneDraftBehavior, zoneDraftPoints, zoneDraftPriority, zoneDraftTriggersAlert, zoneDraftColor, zoneDraftDwellMinutes, zoneDraftSchedule, resetZoneDraft]);

  const deleteZone = useCallback((zoneId: string) => {
    setZones(prev => prev.filter(z => z.id !== zoneId));
  }, []);

  const saveZonesForRadar = useCallback(async () => {
    if (!selectedZoneRadarId) return;
    setZonesBusy(true);
    setZoneMessage("");
    try {
      const response = await apiFetch(`/radars/${selectedZoneRadarId}/zones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zones })
      });
      if (!response.ok) throw new Error();
      setZoneMessage("Zonas guardadas com sucesso.");
      await load();
    } catch {
      setZoneMessage("Erro ao guardar zonas.");
    } finally {
      setZonesBusy(false);
    }
  }, [selectedZoneRadarId, zones, load]);

  const copyLayoutFromRadar = useCallback(async () => {
    if (!copySourceRadarId || !selectedZoneRadarId) return;
    setZonesBusy(true);
    try {
      const response = await apiFetch(`/radars/${copySourceRadarId}/zones`);
      if (!response.ok) throw new Error("API Error");
      const data = await response.json();
      setZones(data.zones || []);
      setZoneMessage(`Layout copiado de ${copySourceRadarId}`);
    } catch {
      setZoneMessage("Erro ao copiar layout.");
    } finally {
      setZonesBusy(false);
    }
  }, [copySourceRadarId, selectedZoneRadarId]);

  // Live Telemetry Stream
  useEffect(() => {
    if (!selectedZoneRadarId) {
      setLiveTargets([]);
      return;
    }
    
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const stop = await subscribeToStream({
        onMessage: (payload) => {
          const data = payload as any;
          if (data?.radarId === selectedZoneRadarId && data?.frame?.targets) {
            setLiveTargets(data.frame.targets);
          }
        }
      });
      if (cancelled) {
        stop();
        return;
      }
      unsubscribe = stop;
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      setLiveTargets([]);
    };
  }, [selectedZoneRadarId]);

  // Coordinate Conversion
  const worldToCanvas = useCallback((wx: number, wy: number) => {
    const { roomWidthMeters, roomDepthMeters, originX, originY } = activeRoomModel;
    const px = ((wx - originX + roomWidthMeters / 2) / roomWidthMeters) * ZONE_GRAPH_SIZE;
    const py = ((wy - originY + roomDepthMeters / 2) / roomDepthMeters) * ZONE_GRAPH_SIZE;
    return { x: px, y: py };
  }, [activeRoomModel]);

  const canvasToWorld = useCallback((cx: number, cy: number) => {
    const { roomWidthMeters, roomDepthMeters, originX, originY } = activeRoomModel;
    const wx = (cx / ZONE_GRAPH_SIZE) * roomWidthMeters - roomWidthMeters / 2 + originX;
    const wy = (cy / ZONE_GRAPH_SIZE) * roomDepthMeters - roomDepthMeters / 2 + originY;
    return { x: wx, y: wy };
  }, [activeRoomModel]);

  // Interaction Handlers
  const handleZoneGraphClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (justFinishedDragRef.current) return;
    
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * ZONE_GRAPH_SIZE;
    const cy = ((e.clientY - rect.top) / rect.height) * ZONE_GRAPH_SIZE;
    
    const world = canvasToWorld(cx, cy);
    setZoneDraftPoints(prev => [...prev, world]);
    markInteracting();
  }, [canvasToWorld, markInteracting]);

  const handleMouseDownPoint = useCallback((e: React.MouseEvent, zoneId: string, index: number) => {
    draggingPointIndexRef.current = index;
    markInteracting();
  }, [markInteracting]);

  const handleMouseMoveGraph = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingPointIndexRef.current === null) return;
    
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * ZONE_GRAPH_SIZE;
    const cy = ((e.clientY - rect.top) / rect.height) * ZONE_GRAPH_SIZE;
    
    const world = canvasToWorld(cx, cy);
    setZoneDraftPoints(prev => {
      const next = [...prev];
      next[draggingPointIndexRef.current!] = world;
      return next;
    });
  }, [canvasToWorld]);

  const handleMouseUpGraph = useCallback(() => {
    if (draggingPointIndexRef.current !== null) {
      justFinishedDragRef.current = true;
      setTimeout(() => { justFinishedDragRef.current = false; }, 100);
    }
    draggingPointIndexRef.current = null;
    markDoneInteracting();
  }, [markDoneInteracting]);

  // Visual Helpers
  const zoneGridLines = useMemo(() => {
    const lines = [];
    const divisions = 12;
    for (let i = 1; i < divisions; i++) {
      lines.push({ id: i, value: (i * ZONE_GRAPH_SIZE) / divisions });
    }
    return lines;
  }, []);

  const zoneDraftGraphPoints = useMemo(() => {
    return zoneDraftPoints.map(p => worldToCanvas(p.x, p.y));
  }, [zoneDraftPoints, worldToCanvas]);

  const existingZoneGraphPolygons = useMemo(() => {
    return zones.map(z => ({
      id: z.id,
      name: z.name,
      type: "custom" as const,
      color: z.color || "#2563eb",
      graphPolygon: z.polygon.map(p => worldToCanvas(p.x, p.y))
    }));
  }, [zones, worldToCanvas]);

  const liveTargetPoints = useMemo(() => {
    return liveTargets.map(t => ({
      id: t.id,
      point: worldToCanvas(t.x, t.y)
    }));
  }, [liveTargets, worldToCanvas]);

  return {
    selectedZoneRadarId, setSelectedZoneRadarId, zones,
    zoneDraftName, setZoneDraftName, zoneDraftBehavior, setZoneDraftBehavior,
    zoneDraftPriority, setZoneDraftPriority, zoneDraftPoints, setZoneDraftPoints,
    editingZoneId, zoneMessage, zonesBusy, zoneDraftTriggersAlert, setZoneDraftTriggersAlert,
    zoneDraftSchedule, setZoneDraftSchedule, copySourceRadarId, setCopySourceRadarId,
    zoneDraftColor, setZoneDraftColor, showColorPalette, setShowColorPalette,
    zoneDraftDwellMinutes, setZoneDraftDwellMinutes,
    roomWidthMeters: activeRoomModel.roomWidthMeters,
    roomDepthMeters: activeRoomModel.roomDepthMeters,
    originX: activeRoomModel.originX,
    originY: activeRoomModel.originY,
    radarHeightMeters: activeRoomModel.radarHeightMeters,
    loadZonesForRadar, resetZoneDraft, upsertZoneDraft, editZone, deleteZone,
    handleZoneGraphClick, saveZonesForRadar, handleMouseDownPoint,
    handleMouseMoveGraph, handleMouseUpGraph, copyLayoutFromRadar,
    zoneGridLines, zoneDraftGraphPoints, existingZoneGraphPolygons, liveTargetPoints
  };
}
