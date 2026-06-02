import Link from "next/link";
import { EventRow } from "../../types/domain";
import { eventAlertPriority, alertPriorityLabel } from "../../utils/alerts";

export function RecentFallsSection({ recentFalls }: { recentFalls: EventRow[] }) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <h2>Log de Quedas Recentes</h2>
        <Link href="/falls">Abrir histórico completo</Link>
      </div>

      {recentFalls.length === 0 ? (
        <p className="muted">Ainda não foram registadas quedas.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Quarto</th>
                <th>Paciente</th>
                <th>Prioridade</th>
                <th>Estado</th>
                <th>Replay</th>
              </tr>
            </thead>
            <tbody>
              {recentFalls.map((event) => {
                const priority = eventAlertPriority(event);
                return (
                <tr key={`recent-${event.id}`}>
                  <td>{new Date(event.timestamp).toLocaleString()}</td>
                  <td>{event.room_name ?? "Não Atribuído"}</td>
                  <td>{event.patient_name ?? "Desconhecido"}</td>
                  <td>
                    <span className={`priority-pill priority-pill--${priority}`}>
                      {alertPriorityLabel(priority)}
                    </span>
                  </td>
                  <td>{event.alert_status ?? "new"}</td>
                  <td>
                    {event.metadata?.is_collecting ? (
                      <span className="muted" style={{ fontSize: '11px' }}>A capturar...</span>
                    ) : (
                      <Link href={`/replay/${event.id}`}>Replay</Link>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
