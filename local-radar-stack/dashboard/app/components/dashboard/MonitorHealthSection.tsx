import { MonitorHealth } from "../../types/health";

export function MonitorHealthSection({ monitorHealth }: { monitorHealth: MonitorHealth | null }) {
  return (
    <section className="panel">
      <h2>Saúde das Operações</h2>
      {monitorHealth ? (
        <div className="grid stats">
          <div className="stat-card">
            <div className="stat-value">{monitorHealth.queueDepth.events}</div>
            <div className="stat-label">Profundidade da Fila de Eventos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{monitorHealth.queueDepth.summaries}</div>
            <div className="stat-label">Profundidade da Fila de Resumos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{monitorHealth.flush.lastFlushDurationMs}</div>
            <div className="stat-label">Duração do Último Flush (ms)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{monitorHealth.heartbeat.online}/{monitorHealth.heartbeat.total}</div>
            <div className="stat-label">Batimentos Cardíacos Dispositivos Online</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {monitorHealth.ingestLag.length > 0
                ? Math.round(monitorHealth.ingestLag.reduce((sum, item) => sum + item.averageMs, 0) / monitorHealth.ingestLag.length)
                : 0}
            </div>
            <div className="stat-label">Atraso Médio de Ingestão (ms)</div>
          </div>
        </div>
      ) : (
        <p className="muted">Métricas indisponíveis (o servidor pode estar numa versão antiga).</p>
      )}
    </section>
  );
}
