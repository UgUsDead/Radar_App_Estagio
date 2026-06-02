"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch } from "../utils/api";

type SLAIncident = {
  id: number | string;
  ackDelaySec: number | null;
  resDelaySec: number | null;
};

type SLAResponse = {
  avgAckTimeSec: number | null;
  avgResTimeSec: number | null;
  incidents: SLAIncident[];
};

function formatMinutes(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/d";
  return `${(seconds / 60).toFixed(1)} min`;
}

export default function SLA_Page() {
  const { hasPermission, isLoading } = useAuth();
  const [data, setData] = useState<SLAResponse | null>(null);
  const [error, setError] = useState("");

  const canViewSla = hasPermission("sla_metrics");

  useEffect(() => {
    if (!canViewSla) return;

    let mounted = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        setError("");
        const response = await apiFetch(`/monitor/sla`, { signal: controller.signal });
        if (!response.ok) throw new Error(`SLA endpoint failed (${response.status})`);
        const payload = (await response.json()) as SLAResponse;
        if (mounted) setData(payload);
      } catch (e: unknown) {
        if (!mounted) return;
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Não foi possível carregar as métricas de SLA");
      }
    };

    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      mounted = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [canViewSla]);

  const incidents = data?.incidents ?? [];
  const acknowledgedCount = useMemo(
    () => incidents.filter((incident) => typeof incident.ackDelaySec === "number").length,
    [incidents]
  );
  const resolvedCount = useMemo(
    () => incidents.filter((incident) => typeof incident.resDelaySec === "number").length,
    [incidents]
  );
  const ackCoverage = incidents.length > 0 ? Math.round((acknowledgedCount / incidents.length) * 100) : 0;
  const resCoverage = incidents.length > 0 ? Math.round((resolvedCount / incidents.length) * 100) : 0;

  if (isLoading) return null;

  if (!canViewSla) {
    return (
      <main className="container sla-page">
        <nav className="page-shell-header">
          <Link href="/" className="page-back-link">
            ← Voltar ao Painel
          </Link>
        </nav>
        <section className="panel error-banner">
          Sem permissão para ver as métricas de SLA.
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="container sla-page">
        <nav className="page-shell-header">
          <Link href="/" className="page-back-link">
            ← Voltar ao Painel
          </Link>
          <div className="page-links page-links-secondary">
            <Link href="/fleet">Fiabilidade da Frota</Link>
          </div>
        </nav>
        <section className="panel sla-loading">
          <h1>A carregar métricas de SLA...</h1>
          <p className="muted">A recolher tempos de reconhecimento e resolução de incidentes.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="container sla-page">
      <nav className="page-shell-header">
        <Link href="/" className="page-back-link">
          ← Voltar ao Painel
        </Link>
        <div className="page-links page-links-secondary">
          <Link href="/fleet">Fiabilidade da Frota</Link>
        </div>
      </nav>

      {error ? <section className="panel error-banner">{error}</section> : null}

      <section className="panel sla-header">
        <div>
          <p className="muted">Inteligência Operacional</p>
          <h1>SLA de Resposta da Equipa</h1>
          <p className="muted">Desempenho de reconhecimento e resolução nos incidentes mais recentes.</p>
        </div>
        <div className="sla-snapshot">
          <span>{incidents.length} incidentes monitorizados</span>
          <span>{ackCoverage}% reconhecidos</span>
          <span>{resCoverage}% resolvidos</span>
        </div>
      </section>

      <section className="panel">
        <div className="grid stats sla-stats">
          <div className="stat-card sla-card ack">
            <div className="stat-label">Tempo Médio de Reconhecimento</div>
            <div className="stat-value">{formatMinutes(data.avgAckTimeSec)}</div>
          </div>
          <div className="stat-card sla-card resolve">
            <div className="stat-label">Tempo Médio de Resolução</div>
            <div className="stat-value">{formatMinutes(data.avgResTimeSec)}</div>
          </div>
          <div className="stat-card sla-card neutral">
            <div className="stat-label">Incidentes Reconhecidos</div>
            <div className="stat-value">{acknowledgedCount}</div>
          </div>
          <div className="stat-card sla-card neutral">
            <div className="stat-label">Incidentes Resolvidos</div>
            <div className="stat-value">{resolvedCount}</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title-row">
          <h2>Trilho de Auditoria de Resposta</h2>
          <span className="muted">Últimos {Math.min(incidents.length, 120)} incidentes</span>
        </div>

        {incidents.length === 0 ? (
          <p className="muted">Ainda não existem registos de SLA de incidentes disponíveis.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Incidente</th>
                  <th>Atraso de Reconhecimento</th>
                  <th>Atraso de Resolução</th>
                  <th>Replay</th>
                </tr>
              </thead>
              <tbody>
                {incidents.slice(0, 120).map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      <span className="sla-id">#{incident.id}</span>
                    </td>
                    <td>
                      {typeof incident.ackDelaySec === "number" ? (
                        <span className="sla-pill ok">{(incident.ackDelaySec / 60).toFixed(1)} min</span>
                      ) : (
                        <span className="sla-pill danger">Por reconhecer</span>
                      )}
                    </td>
                    <td>
                      {typeof incident.resDelaySec === "number" ? (
                        <span className="sla-pill info">{(incident.resDelaySec / 60).toFixed(1)} min</span>
                      ) : (
                        <span className="sla-pill warn">Incidente em aberto</span>
                      )}
                    </td>
                    <td>
                      <Link href={`/replay/${incident.id}`} className="sla-replay-link">
                        Abrir Reprodução
                      </Link>
                    </td>
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
