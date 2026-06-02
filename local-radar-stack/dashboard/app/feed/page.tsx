"use client";

import { apiFetch } from "../utils/api";

import { memo, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Grid, Line, OrbitControls, Sphere, Text } from "@react-three/drei";
import Link from "next/link";

const apiBase =
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

interface RadarTarget {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

interface Frame {
  timestamp: number;
  sequenceId: number;
  targets: RadarTarget[];
  zones?: ZoneConfig[];
}

interface ZoneConfig {
  id: string;
  name: string;
  type: "bedside" | "bathroom" | "doorway" | "custom";
  behavior: "none" | "departure" | "arrival" | "transition";
  polygon: Array<{ x: number; y: number }>;
  priority?: "low" | "medium" | "high";
  color?: string;
}

interface RoomDirectoryRow {
  id: number;
  name: string;
  floor: number;
  patient_name: string | null;
  radar_id: string | null;
}

interface FeedEntry {
  radarId: string;
  frame: Frame;
  floor: number | null;
  roomName: string | null;
  patientName: string | null;
  title: string;
  subtitle: string;
}

function zoneColor(zone: ZoneConfig): string {
  if (zone.color) return zone.color;
  if (zone.type === "bedside") return "#16a34a";
  if (zone.type === "bathroom") return "#ef4444";
  if (zone.type === "doorway") return "#f59e0b";
  return "#38bdf8";
}

function zoneCenter(polygon: Array<{ x: number; y: number }>) {
  const divisor = Math.max(1, polygon.length);
  const summed = polygon.reduce(
    (acc, point) => {
      acc.x += point.x;
      acc.y += point.y;
      return acc;
    },
    { x: 0, y: 0 }
  );
  return { x: summed.x / divisor, y: summed.y / divisor };
}

const RadarViewport = memo(function RadarViewport({
  radarId,
  frame,
  title,
  subtitle,
  onFullscreen,
  isFullscreen = false
}: {
  radarId: string;
  frame: Frame;
  title: string;
  subtitle: string;
  onFullscreen: () => void;
  isFullscreen?: boolean;
}) {
  const lagMs = useMemo(() => Math.max(0, Date.now() - frame.timestamp), [frame.timestamp]);

  return (
    <article className={`feed-radar-card ${isFullscreen ? "is-fullscreen" : ""}`}>
      <header className="feed-radar-card-header">
        <div>
          <p className="feed-radar-label">Quarto</p>
          <h2>{title}</h2>
          <p className="feed-radar-label">{subtitle}</p>
        </div>
        <div className="feed-radar-meta">
          <span><b>{frame.targets.length}</b> alvos</span>
          <span><b>{lagMs}</b> ms atraso</span>
          <button className="fullscreen-btn" onClick={onFullscreen} title={isFullscreen ? "Fechar Ecrã Inteiro" : "Ecrã Inteiro"}>
            {isFullscreen ? "✕" : "⛶"}
          </button>
        </div>
      </header>

      <div className="feed-canvas-shell">
        <Canvas camera={{ position: [5, 4, 5], fov: 50 }}>
          <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} minDistance={3} maxDistance={18} />

          <ambientLight intensity={0.4} />
          <directionalLight position={[6, 10, 8]} intensity={1.2} />
          <pointLight position={[-8, -4, -8]} intensity={0.2} color="#22c55e" />

          <Grid
            infiniteGrid={false}
            fadeDistance={22}
            sectionColor="#5f6368"
            cellColor="#3f4348"
            sectionSize={2}
            cellSize={0.5}
            position={[0, -0.02, 0]}
            args={[16, 16]}
          />
          <Environment preset="city" />

          {(frame.zones ?? [])
            .filter((zone) => zone.polygon.length >= 3)
            .map((zone) => {
              const loop = [...zone.polygon, zone.polygon[0]].map((point) => [point.x, 0.05, -point.y] as [number, number, number]);
              const center = zoneCenter(zone.polygon);
              const color = zoneColor(zone);
              return (
                <group key={`${radarId}-zone-${zone.id}`}>
                  <Line
                    points={loop}
                    color={color}
                    lineWidth={2}
                    transparent
                    opacity={0.98}
                  />
                  {zone.polygon.map((point, index) => (
                    <Sphere key={`${zone.id}-vertex-${index}`} position={[point.x, 0.09, -point.y]} args={[0.05, 12, 12]}>
                      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
                    </Sphere>
                  ))}
                  <Text
                    position={[center.x, 0.18, -center.y]}
                    fontSize={0.22}
                    color={color}
                    outlineColor="#0f172a"
                    outlineWidth={0.025}
                    anchorX="center"
                    anchorY="middle"
                  >
                    {zone.name}
                  </Text>
                </group>
              );
            })}

          {frame.targets.map((target) => {
            const isNearFloor = target.z < 0.35;
            return (
              <Sphere key={`${radarId}-${target.id}`} position={[target.x, target.z, -target.y]} args={[0.22, 24, 24]}>
                <meshStandardMaterial
                  color={isNearFloor ? "#ef4444" : "#0ea5e9"}
                  metalness={0.45}
                  roughness={0.3}
                  emissive={isNearFloor ? "#7f1d1d" : "#0b3a5a"}
                />
              </Sphere>
            );
          })}
        </Canvas>
      </div>
    </article>
  );
});

const FeedSummaryCard = memo(function FeedSummaryCard({ title, subtitle, targetsCount, timestamp }: { title: string, subtitle: string, targetsCount: number, timestamp: number }) {
  const lagMs = useMemo(() => Math.max(0, Date.now() - timestamp), [timestamp]);
  return (
    <div className="feed-summary-card">
      <strong>{title}</strong>
      <span>{subtitle}</span>
      <span>Alvos: <b>{targetsCount}</b></span>
      <span>Atraso de Rede: <b>{lagMs} ms</b></span>
    </div>
  );
});

export default function FeedPage() {
  const [radars, setRadars] = useState<Record<string, Frame>>({});
  const [roomDirectory, setRoomDirectory] = useState<RoomDirectoryRow[]>([]);
  const [streamError, setStreamError] = useState<string>("");
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "error">("connecting");
  const [fullscreenRadarId, setFullscreenRadarId] = useState<string | null>(null);

  useEffect(() => {
    const marker = "__threeClockWarnSuppressed";
    const globalWindow = window as unknown as Record<string, unknown>;
    if (globalWindow[marker]) {
      return;
    }

    const originalWarn = console.warn;
    console.warn = (...args) => {
      if (typeof args[0] === "string" && args[0].includes("THREE.Clock")) return;
      originalWarn(...args);
    };
    globalWindow[marker] = true;

    return () => {
      console.warn = originalWarn;
      delete globalWindow[marker];
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRoomDirectory = async () => {
      try {
        const response = await apiFetch(`/rooms`);
        if (!response.ok) return;
        const payload = (await response.json()) as RoomDirectoryRow[];
        if (!cancelled && Array.isArray(payload)) {
          setRoomDirectory(payload);
        }
      } catch {
        // Keep last known directory on transient network failures.
      }
    };

    void loadRoomDirectory();
    const timer = setInterval(() => void loadRoomDirectory(), 5_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("radar_auth_token") : null;
    const sse = new EventSource(`${apiBase}/monitor/stream${token ? `?token=${token}` : ""}`);

    sse.onopen = () => {
      setConnectionState("live");
      setStreamError("");
    };

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.radarId && data.frame) {
          setConnectionState("live");
          setStreamError("");
          const zones = Array.isArray(data.zones) ? data.zones : [];
          setRadars((prev) => ({
            ...prev,
            [data.radarId]: {
              ...data.frame,
              zones: zones.length > 0 ? zones : (prev[data.radarId]?.zones ?? []),
            }
          }));
        }
      } catch (err) {
        console.error("Failed to parse SSE", err);
      }
    };

    sse.onerror = () => {
      setConnectionState("error");
      setStreamError(`Stream inacessível em ${apiBase}/monitor/stream`);
    };

    return () => {
      sse.close();
    };
  }, []);

  const radarEntries = useMemo(() => {
    const byRadar = new Map<string, RoomDirectoryRow>();
    for (const room of roomDirectory) {
      if (room.radar_id && !byRadar.has(room.radar_id)) {
        byRadar.set(room.radar_id, room);
      }
    }

    const entries: FeedEntry[] = [];
    for (const radarId of byRadar.keys()) {
      const room = byRadar.get(radarId)!;
      const floor = room.floor ?? null;
      const roomName = room.name ?? null;
      const patientName = room.patient_name ?? null;

      if (!roomName) {
        continue;
      }

      const frame = radars[radarId] || {
        timestamp: Date.now(),
        sequenceId: 0,
        targets: [],
        zones: []
      };

      const assignedFloor = room.floor ?? 0;
      const assignedRoomName = room.name ?? "Quarto Desconhecido";

      entries.push({
        radarId,
        frame,
        floor,
        roomName,
        patientName,
        title: `Piso ${assignedFloor} - ${assignedRoomName}`,
        subtitle: patientName ? `Paciente: ${patientName}` : "Paciente: Não atribuído",
      });
    }

    return entries.sort((a, b) => {
      const floorA = a.floor ?? Number.MAX_SAFE_INTEGER;
      const floorB = b.floor ?? Number.MAX_SAFE_INTEGER;
      if (floorA !== floorB) return floorA - floorB;

      const roomA = (a.roomName ?? "").toLowerCase();
      const roomB = (b.roomName ?? "").toLowerCase();
      if (roomA !== roomB) return roomA.localeCompare(roomB);

      return a.radarId.localeCompare(b.radarId, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [radars, roomDirectory]);

  const fullscreenEntry = useMemo(() => {
    if (!fullscreenRadarId) return null;
    return radarEntries.find(e => e.radarId === fullscreenRadarId);
  }, [fullscreenRadarId, radarEntries]);

  return (
    <main className="feed-root">
      <header className="feed-topbar">
        <div>
          <p className="feed-kicker">Monitorização em Direto</p>
          <h1>Janelas de Telemetria 3D</h1>
          <p className="feed-subtitle">Cada radar é renderizado na sua própria janela para uma separação clara.</p>
        </div>
        <div className="feed-topbar-actions">
          <div className="feed-chip">Fonte {apiBase}</div>
          <div className={`feed-chip ${connectionState === "live" ? "live" : connectionState === "error" ? "error" : "connecting"}`}>
            {connectionState === "live" ? "Em Direto" : connectionState === "error" ? "Desligado" : "A ligar..."}
          </div>
          <Link href="/" className="feed-link-btn">
            Painel Principal
          </Link>
        </div>
      </header>

      {radarEntries.length === 0 ? (
        <section className="feed-empty-state">
          <div>
            <h2>A aguardar transmissão do radar</h2>
            <p>Se o simulador estiver a correr, cada radar ligado aparecerá aqui na sua própria janela.</p>
            {streamError ? <p className="feed-error-msg">{streamError}</p> : null}
          </div>
        </section>
      ) : (
        <section className="feed-grid">
          {radarEntries.map((entry) => (
            <div key={entry.radarId} className="feed-unit-container">
              <RadarViewport
                radarId={entry.radarId}
                frame={entry.frame}
                title={entry.title}
                subtitle={entry.subtitle}
                onFullscreen={() => setFullscreenRadarId(entry.radarId)}
              />
              <FeedSummaryCard 
                title={entry.title}
                subtitle={entry.subtitle}
                targetsCount={entry.frame.targets.length}
                timestamp={entry.frame.timestamp}
              />
            </div>
          ))}
        </section>
      )}

      {fullscreenEntry && (
        <div className="feed-fullscreen-overlay">
          <RadarViewport
            radarId={fullscreenEntry.radarId}
            frame={fullscreenEntry.frame}
            title={fullscreenEntry.title}
            subtitle={fullscreenEntry.subtitle}
            onFullscreen={() => setFullscreenRadarId(null)}
            isFullscreen={true}
          />
        </div>
      )}
    </main>
  );
}
