import Link from "next/link";
import { EventRow } from "../../types/domain";
import { eventAlertPriority, alertPriorityLabel } from "../../utils/alerts";
import { eventTypeLabel } from "../../utils/formatting";

interface Props {
  criticalAlerts: EventRow[];
  activeFallAlerts: EventRow[];
  bulkActionBusy: "ack" | "resolve" | null;
  bulkUpdateAlerts: (action: "ack" | "resolve") => Promise<void>;
  updateAlertStatus: (eventId: number, action: "ack" | "resolve" | "closed") => Promise<void>;
}

export function AlertsSection({
  criticalAlerts,
  activeFallAlerts,
  bulkActionBusy,
  bulkUpdateAlerts,
  updateAlertStatus
}: Props) {
  const openFallCount = activeFallAlerts.filter((event) => (event.alert_status ?? "new") === "new").length;

  return (
    <section className="panel">
      <h2>Alertas Críticos</h2>
      <div className="alerts-toolbar">
        <span className="muted">A mostrar {criticalAlerts.length} alertas ativos · {openFallCount} novos</span>
        <div className="alerts-toolbar-actions">
          <button
            onClick={() => void bulkUpdateAlerts("ack")}
            disabled={bulkActionBusy !== null || openFallCount === 0}
          >
            {bulkActionBusy === "ack" ? "A reconhecer..." : "Reconhecer novos"}
          </button>
          <button
            onClick={() => void bulkUpdateAlerts("resolve")}
            disabled={bulkActionBusy !== null || activeFallAlerts.length === 0}
          >
            {bulkActionBusy === "resolve" ? "A resolver..." : "Resolver ativos"}
          </button>
          <Link href="/falls" className="inline-link-button">Ver todas as quedas</Link>
        </div>
      </div>
      {criticalAlerts.length === 0 ? (
        <p>Sem alertas de quedas recentes.</p>
      ) : (
        <div className="alert-list">
          {criticalAlerts.map((event) => {
            const priority = eventAlertPriority(event);
            return (
              <div className={`alert-card alert-card--${priority}`} key={event.id}>
                <div className="alert-card-header">
                  <div className={`status-alert status-alert--${priority}`}>
                    {`${eventTypeLabel(event.type)} · ${alertPriorityLabel(priority)}`}
                  </div>
                  {event.is_critical ? <div className="badge-critical">CRÍTICO</div> : null}
                  {event.escalation_level && event.escalation_level !== "new" ? (
                    <div className={`badge-escalation badge-${event.escalation_level}`}>
                      {event.escalation_level === "level_1" ? "🔴 Nível 1" : 
                       event.escalation_level === "level_2" ? "🔴🔴 Nível 2" : 
                       "🔴🔴🔴 Nível 3"}
                    </div>
                  ) : null}
                </div>
                <div>{event.room_name ?? "Quarto não atribuído"}</div>
                <div>{event.patient_name ?? "Paciente desconhecido"}</div>
                {event.metadata?.clinical_warning ? (
                  <div className="alert-clinical-detail" style={{ fontSize: '12px', marginTop: '4px', fontWeight: '500', color: '#475569' }}>
                    {String(event.metadata.clinical_warning)}
                  </div>
                ) : null}
                <div className="muted">{new Date(event.timestamp).toLocaleString()}</div>
                <div className="alert-actions">
                  {(event.alert_status ?? "new") === "new" ? (
                    <button onClick={() => void updateAlertStatus(event.id, "ack")}>Reconhecer</button>
                  ) : null}
                  <button onClick={() => void updateAlertStatus(event.id, "resolve")}>Resolver</button>
                  {event.metadata?.is_collecting ? (
                    <span className="priority-pill priority-pill--medium" style={{ fontSize: '11px' }}>A capturar Replay...</span>
                  ) : (
                    <Link href={`/replay/${event.id}`}>Replay</Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
