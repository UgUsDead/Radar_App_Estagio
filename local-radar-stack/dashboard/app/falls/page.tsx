"use client";

import { apiFetch } from "../utils/api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

type AlertEvent = {
  id: number;
  radar_id: string;
  type: string;
  timestamp: string;
  room_name: string | null;
  patient_name: string | null;
  alert_status?: "new" | "acknowledged" | "resolved" | "closed";
  alert_priority?: AlertPriority;
  metadata?: Record<string, unknown>;
};

type AlertPriority = "low" | "medium" | "high";

const ALL_ALERT_TYPES = ["fall", "anomaly", "departure", "arrival", "transition", "dwell"];

function normalizeAlertPriority(value: unknown): AlertPriority | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
  if (normalized === "critical") return "high";
  return null;
}

function eventAlertPriority(event: AlertEvent): AlertPriority {
  const directPriority = normalizeAlertPriority(event.metadata?.alert_priority);
  if (directPriority) return directPriority;

  const zoneContext = event.metadata?.zone_context;
  if (zoneContext && typeof zoneContext === "object") {
    const fromZone = normalizeAlertPriority((zoneContext as { priority?: unknown }).priority);
    if (fromZone) return fromZone;
  }

  return "medium";
}

function alertPriorityLabel(priority: AlertPriority): string {
  if (priority === "low") return "Baixa";
  if (priority === "high") return "Alta";
  return "Media";
}

function eventTypeLabel(type: string): string {
  if (type === "fall") return "Queda";
  if (type === "anomaly") return "Anomalia";
  if (type === "departure") return "Saida de Zona";
  if (type === "arrival") return "Chegada a Zona";
  if (type === "transition") return "Transicao";
  if (type === "dwell") return "Permanencia";
  return type;
}

export default function AlertsHistoryPage() {
  const { hasPermission, isLoading } = useAuth();
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "acknowledged" | "resolved" | "closed">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | AlertPriority>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | string>("all");
  const [timeWindow, setTimeWindow] = useState<"all" | "morning" | "afternoon" | "night">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [busyActionId, setBusyActionId] = useState<number | null>(null);

  if (isLoading) return null;

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      params.set("limit", "1000");

      if (typeFilter !== "all") {
        params.set("type", typeFilter);
      }

      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (fromDate) params.set("from", `${fromDate}T00:00:00.000Z`);
      if (toDate) params.set("to", `${toDate}T23:59:59.999Z`);

      if (timeWindow === "morning") {
        params.set("hourStart", "6");
        params.set("hourEnd", "11");
      } else if (timeWindow === "afternoon") {
        params.set("hourStart", "12");
        params.set("hourEnd", "17");
      } else if (timeWindow === "night") {
        params.set("hourStart", "18");
        params.set("hourEnd", "5");
      }

      const response = await apiFetch(`/events?${params.toString()}`);
      const payload = (await response.json()) as AlertEvent[];
      const alertEvents = payload.filter((event) => ALL_ALERT_TYPES.includes(event.type));
      setEvents(alertEvents);
    } catch {
      setMessage("Nao foi possivel carregar o historico de alertas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter, priorityFilter, typeFilter, timeWindow, fromDate, toDate]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return events
      .filter((event) => {
        if (!needle) return true;

        const haystack = [
          event.radar_id,
          event.room_name ?? "",
          event.patient_name ?? "",
          event.alert_status ?? "new",
          eventTypeLabel(event.type),
          String(event.id)
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(needle);
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [events, query]);

  const counts = useMemo(() => {
    const result = { all: events.length, new: 0, acknowledged: 0, resolved: 0 };
    events.forEach((event) => {
      const status = event.alert_status ?? "new";
      if (status === "new") result.new += 1;
      else if (status === "acknowledged") result.acknowledged += 1;
      else if (status === "resolved") result.resolved += 1;
    });
    return result;
  }, [events]);

  const typeCounts = useMemo(() => {
    const result: Record<string, number> = {};
    events.forEach((event) => {
      result[event.type] = (result[event.type] ?? 0) + 1;
    });
    return result;
  }, [events]);

  const updateStatus = async (eventId: number, action: "ack" | "resolve") => {
    setBusyActionId(eventId);
    setMessage("");
    try {
      const res = await apiFetch(`/events/${eventId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: "dashboard-alert-history" })
      });
      if (!res.ok) throw new Error("Failed to update alert status");
      await load();
    } catch {
      setMessage("Nao foi possivel atualizar o estado do alerta.");
    } finally {
      setBusyActionId(null);
    }
  };

  return (
    <main className="container falls-page">
      <section className="panel falls-header">
        <div>
          <p className="muted">Revisao de Incidentes</p>
          <h1>Historico de Alertas</h1>
          <p className="muted">Explore todos os alertas registados - quedas, anomalias e eventos de zona.</p>
        </div>
        <div className="page-links">
          <Link href="/">Painel Principal</Link>
          {hasPermission("live_telemetry") ? <Link href="/feed">Telemetria em Direto</Link> : null}
          {hasPermission("sla_metrics") ? <Link href="/sla">SLA</Link> : null}
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "A atualizar..." : "Atualizar"}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="grid stats falls-stats">
          <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value">{counts.all}</div></div>
          <div className="stat-card"><div className="stat-label">Novos</div><div className="stat-value">{counts.new}</div></div>
          <div className="stat-card"><div className="stat-label">Reconhecidos</div><div className="stat-value">{counts.acknowledged}</div></div>
          <div className="stat-card"><div className="stat-label">Resolvidos</div><div className="stat-value">{counts.resolved}</div></div>
        </div>
        {Object.keys(typeCounts).length > 0 ? (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "8px" }}>
            {ALL_ALERT_TYPES.map((type) => (
              typeCounts[type] ? (
                <span key={type} className="muted" style={{ fontSize: "12px" }}>
                  {eventTypeLabel(type)}: <strong>{typeCounts[type]}</strong>
                </span>
              ) : null
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel falls-filters">
        <input
          type="text"
          placeholder="Pesquisar por quarto, paciente, radar, id..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">Todos os tipos</option>
          <option value="fall">Quedas</option>
          <option value="anomaly">Anomalias</option>
          <option value="departure">Saidas de Zona</option>
          <option value="arrival">Chegadas a Zona</option>
          <option value="transition">Transicoes</option>
          <option value="dwell">Permanencia</option>
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "all" | "new" | "acknowledged" | "resolved" | "closed")}
        >
          <option value="all">Todos os estados</option>
          <option value="new">Novos</option>
          <option value="acknowledged">Reconhecidos</option>
          <option value="resolved">Resolvidos</option>
          <option value="closed">Fechados</option>
        </select>
        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as "all" | AlertPriority)}>
          <option value="all">Todas as urgencias</option>
          <option value="high">Urgente</option>
          <option value="medium">Media</option>
          <option value="low">Baixa</option>
        </select>
        <select value={timeWindow} onChange={(event) => setTimeWindow(event.target.value as "all" | "morning" | "afternoon" | "night")}>
          <option value="all">Qualquer hora</option>
          <option value="morning">Manha (06-11)</option>
          <option value="afternoon">Tarde (12-17)</option>
          <option value="night">Noite (18-05)</option>
        </select>
        <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
      </section>

      <section className="panel">
        {message ? <p className="error-banner">{message}</p> : null}

        {filtered.length === 0 ? (
          <p className="muted">Nenhum alerta corresponde aos filtros atuais.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Quarto</th>
                  <th>Paciente</th>
                  <th>Radar</th>
                  <th>Prioridade</th>
                  <th>Estado</th>
                  <th>Acao</th>
                  <th>Replay</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((event) => {
                  const status = event.alert_status ?? "new";
                  const priority = eventAlertPriority(event);
                  return (
                    <tr key={`alert-${event.id}`}>
                      <td>{new Date(event.timestamp).toLocaleString()}</td>
                      <td>
                        <span style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: "6px",
                          backgroundColor: event.type === "fall" ? "#fef2f2" :
                                           event.type === "anomaly" ? "#fffbeb" :
                                           event.type === "dwell" ? "#fff7ed" :
                                           "#eff6ff",
                          color: event.type === "fall" ? "#dc2626" :
                                 event.type === "anomaly" ? "#d97706" :
                                 event.type === "dwell" ? "#ea580c" :
                                 "#2563eb",
                        }}>
                          {eventTypeLabel(event.type)}
                        </span>
                      </td>
                      <td>{event.room_name ?? "Nao Atribuido"}</td>
                      <td>{event.patient_name ?? "Desconhecido"}</td>
                      <td>{event.radar_id}</td>
                      <td>
                        <span className={`priority-pill priority-pill--${priority}`}>
                          {alertPriorityLabel(priority)}
                        </span>
                      </td>
                      <td>{status === "new" ? "Novo" : status === "acknowledged" ? "Reconhecido" : status === "resolved" ? "Resolvido" : "Fechado"}</td>
                      <td>
                        {status === "new" ? (
                          <button type="button" onClick={() => void updateStatus(event.id, "ack")} disabled={busyActionId === event.id}>
                            Reconhecer
                          </button>
                        ) : null}
                        {status !== "resolved" && status !== "closed" ? (
                          <button type="button" onClick={() => void updateStatus(event.id, "resolve")} disabled={busyActionId === event.id}>
                            Resolver
                          </button>
                        ) : null}
                      </td>
                      <td>
                        <Link href={`/replay/${event.id}`}>Abrir reproducao</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
