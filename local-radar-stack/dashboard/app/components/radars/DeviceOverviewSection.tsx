"use client";

import type { DeviceState } from "../../types/radarConfig";

interface Props {
  deviceState: DeviceState | null;
  loading: boolean;
  message: string;
  onSendCommand: (cmd: string) => void;
  onSendRadarCommand: (cmd: string) => void;
}

export function DeviceOverviewSection({
  deviceState,
  loading,
  message,
  onSendCommand,
  onSendRadarCommand,
}: Props) {
  const avail = deviceState?.availability ?? "unknown";
  const availClass =
    avail === "online"
      ? "priority-pill--low"
      : avail === "offline"
        ? "priority-pill--high"
        : "priority-pill--medium";

  return (
    <div className="device-overview-section">
      <h3>Visão Geral do Dispositivo</h3>

      <div className="device-overview-grid">
        {/* Availability */}
        <div className="device-overview-card">
          <span className="device-overview-label">Disponibilidade</span>
          <span className={`priority-pill ${availClass}`}>
            {avail === "online" ? "Online" : avail === "offline" ? "Offline" : "Desconhecido"}
          </span>
        </div>

        {/* Radar Status */}
        <div className="device-overview-card">
          <span className="device-overview-label">Estado do Radar</span>
          <span className="device-overview-value">
            {deviceState?.radarStatus ?? "—"}
          </span>
        </div>

        {/* Device Status */}
        <div className="device-overview-card">
          <span className="device-overview-label">Estado do Dispositivo</span>
          <span className="device-overview-value" style={{ fontSize: "12px", wordBreak: "break-all" }}>
            {deviceState?.status
              ? JSON.stringify(deviceState.status)
              : "—"}
          </span>
        </div>

        {/* Cmd Status */}
        <div className="device-overview-card">
          <span className="device-overview-label">Status Comando (Dispositivo)</span>
          <span className="device-overview-value">
            {deviceState?.cmdStatus ?? "—"}
          </span>
        </div>

        {/* Radar Cmd Status */}
        <div className="device-overview-card">
          <span className="device-overview-label">Status Comando (Radar)</span>
          <span className="device-overview-value">
            {deviceState?.radarCmdStatus ?? "—"}
          </span>
        </div>

        {/* Last Seen */}
        <div className="device-overview-card">
          <span className="device-overview-label">Visto pela última vez</span>
          <span className="device-overview-value">
            {deviceState?.lastSeenAt
              ? new Date(deviceState.lastSeenAt).toLocaleString()
              : "Nunca"}
          </span>
        </div>
      </div>

      {/* Last Error */}
      {deviceState?.lastError && (
        <div className="device-error-banner">
          <strong>Erro — {deviceState.lastError.context}</strong>
          <p>{deviceState.lastError.error}</p>
          <span className="muted" style={{ fontSize: "11px" }}>
            {new Date(deviceState.lastError.receivedAt).toLocaleString()}
          </span>
        </div>
      )}

      {/* Quick Actions */}
      <div className="device-actions-row">
        <button
          className="device-action-btn"
          onClick={() => onSendCommand("status")}
          disabled={loading}
          title="Solicitar estado atual do dispositivo"
        >
          📡 Estado
        </button>
        <button
          className="device-action-btn"
          onClick={() => onSendRadarCommand("status")}
          disabled={loading}
          title="Verificar se o radar está idle ou busy"
        >
          📊 Estado Radar
        </button>
        <button
          className="device-action-btn device-action-btn--warn"
          onClick={() => onSendRadarCommand("restart")}
          disabled={loading}
          title="Reiniciar o hardware do radar"
        >
          🔄 Reiniciar Radar
        </button>
        <button
          className="device-action-btn device-action-btn--danger"
          onClick={() => {
            if (window.confirm("Reiniciar o dispositivo ESP32? A ligação MQTT será temporariamente interrompida.")) {
              onSendCommand("reboot");
            }
          }}
          disabled={loading}
          title="Reiniciar o ESP32 completo"
        >
          ⚡ Reiniciar Dispositivo
        </button>
      </div>

      {message && <p className="muted device-control-message">{message}</p>}
    </div>
  );
}
