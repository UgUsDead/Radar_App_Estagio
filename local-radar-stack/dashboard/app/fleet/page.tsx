"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch } from "../utils/api";

type FleetDevice = {
  id: string;
  room_id: number | null;
  room_name: string | null;
  last_seen: string;
  status: string;
  offline_sec: number;
  computed_status: "online" | "degraded" | "offline" | string;
  packet_loss: number;
  drift_ms: number;
  metadata?: Record<string, unknown>;
};

type FleetResponse = {
  fleet: FleetDevice[];
};

function formatSeconds(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";
  if (value < 60) return `${Math.round(value)}s`;
  return `${(value / 60).toFixed(1)}m`;
}

export default function FleetPage() {
  const { hasPermission, isLoading } = useAuth();
  const [data, setData] = useState<FleetResponse | null>(null);
  const [error, setError] = useState("");

  const canViewFleet = hasPermission("fleet_metrics");

  useEffect(() => {
    if (!canViewFleet) return;

    let mounted = true;
    const controller = new AbortController();

    const fetchFleet = async () => {
      try {
        setError("");
        const response = await apiFetch(`/monitor/fleet`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Fleet endpoint failed (${response.status})`);
        const payload = (await response.json()) as FleetResponse;
        if (mounted) setData(payload);
      } catch (e: unknown) {
        if (!mounted) return;
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Não foi possível carregar a fiabilidade da frota");
      }
    };

    void fetchFleet();
    const interval = setInterval(() => void fetchFleet(), 5000);
    return () => {
      mounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [canViewFleet]);

  const fleet = data?.fleet ?? [];
  const onlineCount = useMemo(() => fleet.filter((device) => device.computed_status === "online").length, [fleet]);
  const degradedCount = useMemo(() => fleet.filter((device) => device.computed_status === "degraded").length, [fleet]);
  const offlineCount = useMemo(() => fleet.filter((device) => device.computed_status === "offline").length, [fleet]);

  const avgPacketLoss = useMemo(() => {
    if (fleet.length === 0) return 0;
    const total = fleet.reduce((sum, device) => sum + (Number(device.packet_loss) || 0), 0);
    return total / fleet.length;
  }, [fleet]);

  const avgDrift = useMemo(() => {
    if (fleet.length === 0) return 0;
    const total = fleet.reduce((sum, device) => sum + (Number(device.drift_ms) || 0), 0);
    return total / fleet.length;
  }, [fleet]);

  if (isLoading) return null;

  if (!canViewFleet) {
    return (
      <main className="container fleet-page">
        <nav className="page-shell-header">
          <Link href="/" className="page-back-link">
            ← Voltar ao Painel
          </Link>
        </nav>
        <section className="panel error-banner">
          Sem permissão para ver a fiabilidade da frota.
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="container fleet-page">
        <nav className="page-shell-header">
          <Link href="/" className="page-back-link">
            ← Voltar ao Painel
          </Link>
          <div className="page-links page-links-secondary">
            <Link href="/sla">Métricas de SLA</Link>
          </div>
        </nav>
        <section className="panel fleet-loading">
          <h1>A carregar fiabilidade da frota...</h1>
          <p className="muted">A verificar batimento cardíaco do radar, entrega de pacotes e desvio de tempo.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="container fleet-page">
      <nav className="page-shell-header">
        <Link href="/" className="page-back-link">
          ← Voltar ao Painel
        </Link>
        <div className="page-links page-links-secondary">
          <Link href="/sla">Métricas de SLA</Link>
        </div>
      </nav>

      {error ? <section className="panel error-banner">{error}</section> : null}

      <section className="panel fleet-header">
        <div>
          <p className="muted">Monitorização de Infraestruturas</p>
          <h1>Fiabilidade da Frota de Radares</h1>
          <p className="muted">Batimento cardíaco, qualidade de pacotes e telemetria de desvio em todos os radares instalados.</p>
        </div>
        <div className="fleet-live-indicator">
          <span className="fleet-dot" aria-hidden="true"></span>
          <span>Consulta em tempo real a cada 5 segundos</span>
        </div>
      </section>

      <section className="panel">
        <div className="grid stats fleet-stats">
          <div className="stat-card fleet-card good">
            <div className="stat-label">Online</div>
            <div className="stat-value">{onlineCount}</div>
          </div>
          <div className="stat-card fleet-card warn">
            <div className="stat-label">Degradado</div>
            <div className="stat-value">{degradedCount}</div>
          </div>
          <div className="stat-card fleet-card danger">
            <div className="stat-label">Offline</div>
            <div className="stat-value">{offlineCount}</div>
          </div>
          <div className="stat-card fleet-card neutral">
            <div className="stat-label">Desvio Médio</div>
            <div className="stat-value">{avgDrift.toFixed(1)} ms</div>
          </div>
          <div className="stat-card fleet-card neutral">
            <div className="stat-label">Perda Média de Pacotes</div>
            <div className="stat-value">{avgPacketLoss.toFixed(2)}%</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title-row">
          <h2>Quadro de Fiabilidade de Dispositivos</h2>
          <span className="muted">{fleet.length} radares monitorizados</span>
        </div>

        {fleet.length === 0 ? (
          <p className="muted">Ainda não existe telemetria da frota disponível.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Radar</th>
                  <th>Localização</th>
                  <th>Visto pela última vez</th>
                  <th>Estado</th>
                  <th>Desvio de Telemetria</th>
                  <th>Perda de Pacotes</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <span className="fleet-id">{device.id}</span>
                    </td>
                    <td>{device.room_name ?? "Não Atribuído"}</td>
                    <td>{formatSeconds(device.offline_sec)} atrás</td>
                    <td>
                      <span className={`fleet-pill ${device.computed_status === "offline" ? "danger" : device.computed_status === "degraded" ? "warn" : "ok"}`}>
                        {device.computed_status === "online" ? "Ligado" : device.computed_status === "degraded" ? "degradado" : "Desligado"}
                      </span>
                    </td>
                    <td>{Number(device.drift_ms).toFixed(1)} ms</td>
                    <td>{Number(device.packet_loss).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
