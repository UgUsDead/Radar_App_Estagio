"use client";

import { useState, useMemo, useRef, useEffect } from "react";

interface LogEntry {
  timestamp: number;
  suffix: string;
  category: "availability" | "status" | "error" | "radar_status" | "radar_config" | "radar_cmd" | "cmd" | "unknown";
  importance: "info" | "warning" | "critical";
  payload: string;
  parsed?: Record<string, unknown> | null;
}

interface Props {
  logs: LogEntry[];
}

const CATEGORY_LABELS: Record<LogEntry["category"], string> = {
  availability: "Disponibilidade",
  status: "Estado",
  error: "Erro",
  radar_status: "Radar Status",
  radar_config: "Radar Config",
  radar_cmd: "Radar Cmd",
  cmd: "Cmd",
  unknown: "Desconhecido",
};

export function DeviceLogSection({ logs }: Props) {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterCategory !== "all" && log.category !== filterCategory) return false;
      if (searchText) {
        const search = searchText.toLowerCase();
        if (!log.suffix.toLowerCase().includes(search) && !log.payload.toLowerCase().includes(search)) {
          return false;
        }
      }
      return true;
    });
  }, [logs, filterCategory, searchText]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll]);

  const toggleExpand = (idx: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const copyLog = (log: LogEntry) => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
  };

  const exportAll = () => {
    navigator.clipboard.writeText(JSON.stringify(filteredLogs, null, 2));
    alert("Logs copiados para a área de transferência.");
  };

  return (
    <div className="device-log-section">
      <div className="log-header">
        <h3>Logs de Comunicação MQTT</h3>
        <div className="log-header-actions">
          <select
            className="log-filter-select"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="all">Todas as Categorias</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="log-search-input"
            placeholder="Pesquisar logs..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <button className="rc-action-btn" onClick={exportAll}>
            Exportar
          </button>
        </div>
      </div>

      <div 
        className="log-table-container" 
        ref={scrollRef}
        onWheel={() => setAutoScroll(false)}
      >
        <table className="log-table">
          <thead>
            <tr>
              <th style={{ width: "140px" }}>Timestamp</th>
              <th style={{ width: "100px" }}>Categoria</th>
              <th style={{ width: "150px" }}>Tópico Suffix</th>
              <th>Payload</th>
              <th style={{ width: "50px" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="log-empty">
                  Nenhum log encontrado.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log, i) => {
                const isExpanded = expandedIndices.has(i);
                return (
                  <tr key={`${log.timestamp}-${i}`} className={`log-row log-row--${log.importance}`}>
                    <td className="log-cell-time" title={new Date(log.timestamp).toLocaleString()}>
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                    </td>
                    <td className="log-cell-category">
                      <span className={`log-badge log-badge--${log.category}`}>
                        {CATEGORY_LABELS[log.category] || log.category}
                      </span>
                    </td>
                    <td className="log-cell-suffix">{log.suffix}</td>
                    <td className="log-cell-payload" onClick={() => toggleExpand(i)}>
                      <div className={`payload-preview ${isExpanded ? "payload-expanded" : ""}`}>
                        {log.parsed ? JSON.stringify(log.parsed, null, isExpanded ? 2 : undefined) : log.payload}
                      </div>
                    </td>
                    <td className="log-cell-actions">
                      <button className="log-copy-btn" onClick={() => copyLog(log)} title="Copiar JSON">
                        📋
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      <div className="log-footer">
        <label className="rc-toggle log-auto-scroll-toggle">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          <span className="rc-toggle-slider" />
          <span className="rc-toggle-label">Auto-scroll {autoScroll ? "Ativado" : "Pausado"}</span>
        </label>
        <span className="log-count">{filteredLogs.length} eventos listados</span>
      </div>
    </div>
  );
}
