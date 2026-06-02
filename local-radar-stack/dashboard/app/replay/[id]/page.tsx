"use client";

import { apiFetch } from "../../utils/api";
import { Environment, Grid, Line, OrbitControls, Sphere, Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RequireFeature } from "../../components/auth/RequireFeature";

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

type ReplayTarget = {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed?: number;
  snr?: number;
};

type ReplayFrame = {
  timestamp: number;
  targets: ReplayTarget[];
};

type ReplayTrailPoint = ReplayTarget & {
  intensity: number;
};

type ReplayResponse = {
  event: {
    id: number;
    type: string;
    timestamp: string;
    radar_id: string;
    metadata?: Record<string, unknown>;
  };
  telemetry: Array<{
    timestamp?: number;
    t?: number;
    targets?: ReplayTarget[];
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
  }>;
  zones?: ZoneConfig[];
  annotations?: ReplayAnnotation[];
  bookmarks?: ReplayBookmark[];
  error?: string;
};

type ZoneConfig = {
  id: string;
  name: string;
  type: "bedside" | "bathroom" | "doorway" | "custom";
  behavior: "none" | "departure" | "arrival" | "transition";
  polygon: Array<{ x: number; y: number }>;
  priority?: "low" | "medium" | "high";
  color?: string;
};

type ReplayAnnotation = {
  id: string;
  frameIndex: number;
  timestampMs: number;
  comment: string;
  createdAt: string;
};

type ReplayBookmark = {
  id: string;
  frameIndex: number;
  timestampMs: number;
  label: string;
  createdAt: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function targetColor(zValue: number, maxZ: number): string {
  const heat = clamp(zValue / Math.max(maxZ, 0.001), 0, 1);
  return `hsl(${(1 - heat) * 130}, 78%, 50%)`;
}

function zoneColor(zone: ZoneConfig): string {
  if (zone.color) return zone.color;
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

function CameraRig({ distance, height, target }: { distance: number, height: number, target: [number, number, number] | null }) {
  const { camera } = useThree();
  const vec = new THREE.Vector3();
  const targetVec = new THREE.Vector3();

  useFrame((state) => {
    if (target) {
      targetVec.set(target[0], target[1], target[2]);
      vec.set(target[0] + distance, target[1] + height, target[2] + distance);
      camera.position.lerp(vec, 0.08);
      camera.lookAt(targetVec);
    } else {
      vec.set(distance, height, distance);
      camera.position.lerp(vec, 0.05);
      camera.lookAt(0, 0, 0);
    }
  });
  return null;
}

function SmoothTarget({ position, color, isLow }: { position: [number, number, number], color: string, isLow?: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const targetPos = new THREE.Vector3(...position);

  useFrame(() => {
    if (mesh.current) {
      mesh.current.position.lerp(targetPos, 0.2);
    }
  });

  return (
    <Sphere ref={mesh} args={[0.18, 24, 24]} position={position}>
      <meshStandardMaterial
        color={isLow ? "#ef4444" : color}
        roughness={0.3}
        metalness={0.45}
        emissive={isLow ? "#7f1d1d" : "#0b3a5a"}
        emissiveIntensity={0.35}
      />
    </Sphere>
  );
}

function ReplayScene({
  activeFrame,
  trailPoints,
  sceneRange,
  maxZ,
  zones,
  autoFollow,
}: {
  activeFrame: ReplayFrame | null;
  trailPoints: ReplayTrailPoint[];
  sceneRange: number;
  maxZ: number;
  zones: ZoneConfig[];
  autoFollow: boolean;
}) {
  const gridSize = Math.max(8, Math.ceil(sceneRange * 2));
  const cameraDistance = Math.max(4, sceneRange * 1.25);
  const cameraHeight = Math.max(3, maxZ * 2.2);

  return (
    <Canvas shadows camera={{ position: [cameraDistance, cameraHeight, cameraDistance], fov: 48 }}>
      {autoFollow && (
        <CameraRig 
          distance={cameraDistance} 
          height={cameraHeight} 
          target={activeFrame?.targets[0] ? [activeFrame.targets[0].x, activeFrame.targets[0].z, -activeFrame.targets[0].y] : null} 
        />
      )}
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} minDistance={3} maxDistance={Math.max(12, sceneRange * 4)} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[6, 10, 8]} intensity={1.1} castShadow />
      <pointLight position={[-6, 4, -8]} intensity={0.35} color="#38bdf8" />
      <Grid
        infiniteGrid={false}
        fadeDistance={Math.max(16, sceneRange * 2.5)}
        sectionColor="#5f6368"
        cellColor="#3f4348"
        sectionSize={2}
        cellSize={0.5}
        position={[0, -0.02, 0]}
        args={[gridSize, gridSize]}
      />
      <Environment preset="city" />

      {zones
        .filter((zone) => zone.polygon.length >= 3)
        .map((zone) => {
          const loop = [...zone.polygon, zone.polygon[0]].map((point) => [point.x, 0.06, -point.y] as [number, number, number]);
          const center = zoneCenter(zone.polygon);
          const color = zoneColor(zone);
          return (
            <group key={`zone-${zone.id}`}>
              <Line
                points={loop}
                color={color}
                lineWidth={2}
                transparent
                opacity={0.98}
              />
              {zone.polygon.map((point, index) => (
                <Sphere key={`${zone.id}-vertex-${index}`} position={[point.x, 0.1, -point.y]} args={[0.05, 12, 12]}>
                  <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
                </Sphere>
              ))}
              <Text
                position={[center.x, 0.2, -center.y]}
                fontSize={0.2}
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

      {trailPoints.map((point, index) => {
        const color = targetColor(point.z, maxZ);
        const opacity = 0.18 + point.intensity * 0.45;
        const radius = 0.05 + point.intensity * 0.05;

        return (
          <Sphere key={`trail-${index}-${point.id}`} args={[radius, 12, 12]} position={[point.x, Math.max(0.02, point.z), -point.y]}>
            <meshStandardMaterial
              color={color}
              transparent
              opacity={opacity}
              roughness={0.45}
              metalness={0.2}
              emissive={color}
              emissiveIntensity={0.08 + point.intensity * 0.25}
            />
          </Sphere>
        );
      })}

      {activeFrame?.targets.map((target) => {
        const color = targetColor(target.z, maxZ);
        const isLow = target.z < 0.35;

        return (
          <SmoothTarget 
            key={`active-${target.id}`} 
            position={[target.x, Math.max(0.02, target.z), -target.y]} 
            color={color} 
            isLow={isLow} 
          />
        );
      })}
    </Canvas>
  );
}

function normalizeTelemetry(raw: ReplayResponse["telemetry"]): ReplayFrame[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      const ts = Number(item.timestamp ?? item.t ?? 0);
      if (Array.isArray(item.targets) && item.targets.length > 0) {
        return {
          timestamp: Number.isFinite(ts) && ts > 0 ? ts : Date.now() + index,
          targets: item.targets.map((target, targetIndex) => ({
            id: Number(target.id ?? targetIndex + 1),
            x: Number(target.x ?? 0),
            y: Number(target.y ?? 0),
            z: Number(target.z ?? 0),
            vx: Number(target.vx ?? 0),
            vy: Number(target.vy ?? 0),
            vz: Number(target.vz ?? 0),
            speed: Number(target.speed ?? Math.hypot(Number(target.vx ?? 0), Number(target.vy ?? 0), Number(target.vz ?? 0))),
            snr: target.snr == null ? undefined : Number(target.snr)
          }))
        };
      }

      return {
        timestamp: Number.isFinite(ts) && ts > 0 ? ts : Date.now() + index,
        targets: [
          {
            id: 1,
            x: Number(item.x ?? 0),
            y: Number(item.y ?? 0),
            z: Number(item.z ?? 0),
            vx: Number(item.vx ?? 0),
            vy: Number(item.vy ?? 0),
            vz: Number(item.vz ?? 0),
            speed: Number(Math.hypot(Number(item.vx ?? 0), Number(item.vy ?? 0), Number(item.vz ?? 0)))
          }
        ]
      };
    })
    .filter((frame) => frame.targets.length > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export default function Replay_Page({ params }: { params: { id: string } }) {
  const [data, setData] = useState<ReplayResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [annotations, setAnnotations] = useState<ReplayAnnotation[]>([]);
  const [bookmarks, setBookmarks] = useState<ReplayBookmark[]>([]);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [bookmarkLabel, setBookmarkLabel] = useState("Marcador de quadro");
  const [forensicBusy, setForensicBusy] = useState(false);
  const [forensicError, setForensicError] = useState("");
  const [autoFollow, setAutoFollow] = useState(false);

  useEffect(() => {
    apiFetch(`/events/${params.id}/replay`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Failed to load replay data")))
      .then(setData)
      .catch(err => setData({ error: err.message } as any));
  }, [params.id]);

  useEffect(() => {
    if (!data) return;
    setAnnotations(Array.isArray(data.annotations) ? data.annotations : []);
    setBookmarks(Array.isArray(data.bookmarks) ? data.bookmarks : []);
  }, [data]);

  const frames = useMemo(() => normalizeTelemetry(data?.telemetry ?? []), [data]);
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, frames.length - 1));
  const activeFrame = frames[safeActiveIndex] ?? null;

  const sceneRange = useMemo(() => {
    let max = 1;
    frames.forEach((frame) => {
      frame.targets.forEach((target) => {
        max = Math.max(max, Math.abs(target.x), Math.abs(target.y), Math.abs(target.z));
      });
    });
    (data?.zones ?? []).forEach((zone) => {
      zone.polygon.forEach((point) => {
        max = Math.max(max, Math.abs(point.x), Math.abs(point.y));
      });
    });
    return max * 1.35;
  }, [data?.zones, frames]);

  const maxZ = useMemo(() => {
    let max = 1;
    frames.forEach((frame) => {
      frame.targets.forEach((target) => {
        max = Math.max(max, target.z);
      });
    });
    return Math.max(1, max);
  }, [frames]);

  const trailPoints = useMemo(() => {
    if (frames.length === 0) return [];

    const startIndex = Math.max(0, safeActiveIndex - 24);
    const span = Math.max(1, safeActiveIndex - startIndex);
    const points: ReplayTrailPoint[] = [];

    for (let frameIndex = startIndex; frameIndex <= safeActiveIndex; frameIndex += 1) {
      const frame = frames[frameIndex];
      const intensity = (frameIndex - startIndex) / span;

      frame.targets.forEach((target) => {
        points.push({ ...target, intensity });
      });
    }

    return points;
  }, [frames, safeActiveIndex]);

  const zones = useMemo(() => {
    if (!Array.isArray(data?.zones)) return [];
    return data.zones.filter((zone) => Array.isArray(zone.polygon) && zone.polygon.length >= 3);
  }, [data?.zones]);

  const baselineTimestamp = frames[0]?.timestamp ?? 0;
  const currentTimestampMs = Math.max(0, (activeFrame?.timestamp ?? baselineTimestamp) - baselineTimestamp);

  const upsertAnnotation = async () => {
    const comment = annotationDraft.trim();
    if (!comment) return;
    setForensicBusy(true);
    setForensicError("");
    try {
      const response = await apiFetch(`/events/${params.id}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frameIndex: safeActiveIndex,
          timestampMs: currentTimestampMs,
          comment,
        }),
      });

      if (!response.ok) throw new Error("Failed to save annotation");
      const payload = (await response.json()) as { annotations?: ReplayAnnotation[]; bookmarks?: ReplayBookmark[] };
      setAnnotations(Array.isArray(payload.annotations) ? payload.annotations : []);
      if (Array.isArray(payload.bookmarks)) setBookmarks(payload.bookmarks);
      setAnnotationDraft("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save annotation";
      setForensicError(message);
    } finally {
      setForensicBusy(false);
    }
  };

  const addBookmark = async () => {
    const label = bookmarkLabel.trim() || "Bookmarked frame";
    setForensicBusy(true);
    setForensicError("");
    try {
      const response = await apiFetch(`/events/${params.id}/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frameIndex: safeActiveIndex,
          timestampMs: currentTimestampMs,
          label,
        }),
      });

      if (!response.ok) throw new Error("Failed to bookmark frame");
      const payload = (await response.json()) as { annotations?: ReplayAnnotation[]; bookmarks?: ReplayBookmark[] };
      setBookmarks(Array.isArray(payload.bookmarks) ? payload.bookmarks : []);
      if (Array.isArray(payload.annotations)) setAnnotations(payload.annotations);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to bookmark frame";
      setForensicError(message);
    } finally {
      setForensicBusy(false);
    }
  };

  const deleteAnnotation = async (annotationId: string) => {
    setForensicBusy(true);
    setForensicError("");
    try {
      const response = await apiFetch(`/events/${params.id}/annotations/${annotationId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete annotation");
      const payload = (await response.json()) as { annotations?: ReplayAnnotation[]; bookmarks?: ReplayBookmark[] };
      setAnnotations(Array.isArray(payload.annotations) ? payload.annotations : []);
      if (Array.isArray(payload.bookmarks)) setBookmarks(payload.bookmarks);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete annotation";
      setForensicError(message);
    } finally {
      setForensicBusy(false);
    }
  };

  const deleteBookmark = async (bookmarkId: string) => {
    setForensicBusy(true);
    setForensicError("");
    try {
      const response = await apiFetch(`/events/${params.id}/bookmarks/${bookmarkId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete bookmark");
      const payload = (await response.json()) as { annotations?: ReplayAnnotation[]; bookmarks?: ReplayBookmark[] };
      setBookmarks(Array.isArray(payload.bookmarks) ? payload.bookmarks : []);
      if (Array.isArray(payload.annotations)) setAnnotations(payload.annotations);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete bookmark";
      setForensicError(message);
    } finally {
      setForensicBusy(false);
    }
  };

  const exportIncidentSummary = async () => {
    setForensicBusy(true);
    setForensicError("");
    try {
      const response = await apiFetch(`/events/${params.id}/incident-summary-export`);
      if (!response.ok) throw new Error("Failed to export incident summary");
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `incident-${params.id}-summary.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export incident summary";
      setForensicError(message);
    } finally {
      setForensicBusy(false);
    }
  };

  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;

    const timer = setInterval(() => {
      setActiveIndex((current) => {
        if (current >= frames.length - 1) {
          setIsPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 200);

    return () => clearInterval(timer);
  }, [isPlaying, frames.length]);

  useEffect(() => {
    setActiveIndex(0);
    setIsPlaying(false);
  }, [frames.length, params.id]);

  if (!data) return <main className="container"><div className="panel">A carregar reprodução forense...</div></main>;
  if (data.error) return <main className="container"><div className="panel bg-red-100">{data.error}</div></main>;

  const { event } = data;
  const durationSec = frames.length > 1 ? Math.max(1, (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000) : 1;
  const severity = Number(event.metadata?.estimated_severity ?? 0);

  return (
    <RequireFeature feature="replay_system">
    <main className="container replay-page">
      <nav className="page-links">
        <Link href="/">Painel Principal</Link>
        <Link href="/falls">Histórico de Quedas</Link>
        <Link href="/sla">SLA</Link>
      </nav>

      <section className="panel replay-header">
        <div>
          <p className="muted">Reprodução do Incidente</p>
          <h1>{event.type.replace('_', ' ').toUpperCase()} #{event.id}</h1>
          <p className="muted">{new Date(event.timestamp).toLocaleString()} · {event.radar_id}</p>
        </div>

        <div className="replay-stats">
          <div>
            <span>Quadros</span>
            <strong>{frames.length}</strong>
          </div>
          <div>
            <span>Duração</span>
            <strong>{durationSec.toFixed(1)} s</strong>
          </div>
          <div>
            <span>Gravidade</span>
            <strong>{Number.isFinite(severity) ? severity.toFixed(2) : "n/d"}</strong>
          </div>
        </div>
      </section>

      <section className="panel replay-main">
        <div className="replay-stage-wrap">
          <div className="replay-stage-legend">
            <span>Palco de Reprodução 3D</span>
            <span>Plano de chão X/Y · Elevação Z</span>
          </div>

          <div className="replay-stage">
            <ReplayScene activeFrame={activeFrame} trailPoints={trailPoints} sceneRange={sceneRange} maxZ={maxZ} zones={zones} autoFollow={autoFollow} />
          </div>

          <div className="replay-controls">
            <button type="button" onClick={() => setActiveIndex(0)}>Reiniciar</button>
            <button type="button" onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))} disabled={safeActiveIndex <= 0}>Retroceder</button>
            <button type="button" onClick={() => setIsPlaying((prev) => !prev)} disabled={frames.length < 2}>
              {isPlaying ? "Pausa" : "Reproduzir"}
            </button>
            <button 
              type="button" 
              onClick={() => setAutoFollow(prev => !prev)}
              className={autoFollow ? "active-btn" : ""}
              style={{ backgroundColor: autoFollow ? "#0ea5e9" : undefined, color: autoFollow ? "white" : undefined }}
            >
              {autoFollow ? "Câmara: Auto" : "Câmara: Livre"}
            </button>
            <button
              type="button"
              onClick={() => setActiveIndex((prev) => Math.min(frames.length - 1, prev + 1))}
              disabled={safeActiveIndex >= frames.length - 1}
            >
              Avançar
            </button>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={safeActiveIndex}
            onChange={(evt) => {
              setIsPlaying(false);
              setActiveIndex(Number(evt.target.value));
            }}
            disabled={frames.length <= 1}
          />
        </div>

        <div className="replay-sidepanel">
          <h2>Detalhes do Quadro</h2>
          {activeFrame ? (
            <>
              <p className="muted">Quadro {safeActiveIndex + 1} de {frames.length}</p>
              <p className="muted">Marca de Tempo {new Date(activeFrame.timestamp).toLocaleTimeString()}</p>
              <div className="replay-target-table">
                {activeFrame.targets.map((target) => (
                  <div key={`row-${target.id}`} className="replay-target-row">
                    <strong>Alvo {target.id}</strong>
                    <span>x {target.x.toFixed(2)} m</span>
                    <span>y {target.y.toFixed(2)} m</span>
                    <span>z {target.z.toFixed(2)} m</span>
                    <span>velocidade {(target.speed ?? 0).toFixed(2)} m/s</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p>Não foram capturados quadros de telemetria para este incidente.</p>
          )}

          <div className="replay-forensics">
            <h2>Anotações Forenses</h2>
            <p className="muted">Fixe comentários e marcadores em pontos de quadro/tempo para trilhos de auditoria clínica.</p>
            <p className="muted">Marcador atual: quadro {safeActiveIndex + 1}, +{currentTimestampMs} ms</p>

            <textarea
              value={annotationDraft}
              onChange={(event) => setAnnotationDraft(event.target.value)}
              placeholder="Comente sobre este quadro (o que aconteceu, quem respondeu, seguimento)."
            />

            <div className="replay-forensic-actions">
              <button type="button" onClick={() => void upsertAnnotation()} disabled={forensicBusy || annotationDraft.trim().length === 0}>
                {forensicBusy ? "A guardar..." : "Fixar Comentário"}
              </button>
              <input
                value={bookmarkLabel}
                onChange={(event) => setBookmarkLabel(event.target.value)}
                placeholder="Etiqueta do marcador"
              />
              <button type="button" onClick={() => void addBookmark()} disabled={forensicBusy}>
                Marcar este Quadro
              </button>
              <button type="button" onClick={() => void exportIncidentSummary()} disabled={forensicBusy}>
                Exportar Resumo do Incidente
              </button>
            </div>

            {forensicError ? <p className="replay-forensic-error">{forensicError}</p> : null}

            <div className="replay-forensic-list">
              <h3>Marcadores ({bookmarks.length})</h3>
              {bookmarks.length === 0 ? (
                <p className="muted">Ainda sem marcadores.</p>
              ) : (
                bookmarks
                  .slice()
                  .sort((a, b) => a.frameIndex - b.frameIndex)
                  .map((bookmark) => (
                    <div key={bookmark.id} className="replay-forensic-item">
                      <div>
                        <strong>{bookmark.label}</strong>
                        <span>Quadro {bookmark.frameIndex + 1} · +{bookmark.timestampMs} ms</span>
                      </div>
                      <div className="replay-forensic-item-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setIsPlaying(false);
                            setActiveIndex(clamp(bookmark.frameIndex, 0, Math.max(0, frames.length - 1)));
                          }}
                        >
                          Ir para
                        </button>
                        <button type="button" onClick={() => void deleteBookmark(bookmark.id)} disabled={forensicBusy}>
                          Remover
                        </button>
                      </div>
                    </div>
                  ))
              )}

              <h3>Comentários ({annotations.length})</h3>
              {annotations.length === 0 ? (
                <p className="muted">Ainda sem comentários fixados.</p>
              ) : (
                annotations
                  .slice()
                  .sort((a, b) => a.frameIndex - b.frameIndex)
                  .map((annotation) => (
                    <div key={annotation.id} className="replay-forensic-item">
                      <div>
                        <strong>Quadro {annotation.frameIndex + 1} · +{annotation.timestampMs} ms</strong>
                        <span>{annotation.comment}</span>
                      </div>
                      <div className="replay-forensic-item-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setIsPlaying(false);
                            setActiveIndex(clamp(annotation.frameIndex, 0, Math.max(0, frames.length - 1)));
                          }}
                        >
                          Ir para
                        </button>
                        <button type="button" onClick={() => void deleteAnnotation(annotation.id)} disabled={forensicBusy}>
                          Remover
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="panel replay-metrics">
        <h2>Métricas da Queda</h2>
        <div className="grid stats">
          <div className="stat-card">
            <div className="stat-label">Queda Vertical</div>
            <div className="stat-value">{Number(event.metadata?.vertical_drop ?? 0).toFixed(2)} m</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Aceleração</div>
            <div className="stat-value">{Number(event.metadata?.acceleration ?? 0).toFixed(2)} m/s²</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Velocidade Vertical</div>
            <div className="stat-value">{Number(event.metadata?.vertical_velocity ?? 0).toFixed(2)} m/s</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Nível de Risco</div>
            <div className="stat-value">{event.metadata?.risk_level_applied === "unknown" ? "desconhecido" : String(event.metadata?.risk_level_applied ?? "desconhecido")}</div>
          </div>
        </div>
      </section>
    </main>
    </RequireFeature>
  );
}
