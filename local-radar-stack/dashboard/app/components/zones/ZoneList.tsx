import React from "react";
import { ZoneConfig } from "../../types/zones";
import { behaviorLabel } from "../../utils/formatting";

interface Props {
  zones: ZoneConfig[];
  editZone: (zone: ZoneConfig) => void;
  deleteZone: (zoneId: string) => void;
  selectedZoneRadarId: string;
}

export function ZoneList({ zones, editZone, deleteZone, selectedZoneRadarId }: Props) {
  if (!selectedZoneRadarId) {
    return <p className="muted">Selecione um radar para ver as suas zonas.</p>;
  }

  if (zones.length === 0) {
    return <p className="muted">Nenhuma zona configurada para este radar.</p>;
  }

  return (
    <div className="zone-list">
      {zones.map((zone) => (
        <div className="zone-item-card" key={zone.id}>
          <div className="zone-item-header">
            <div className="zone-color-tag" style={{ backgroundColor: zone.color || "#2563eb" }} />
            <div className="zone-item-info">
              <span className="zone-item-name">{zone.name}</span>
              <span className="zone-item-behavior">{behaviorLabel(zone.behavior)}</span>
            </div>
            <div className="zone-item-actions">
              <button onClick={() => editZone(zone)} title="Editar">✎</button>
              <button className="delete" onClick={() => deleteZone(zone.id)} title="Eliminar">✕</button>
            </div>
          </div>
          <div className="zone-item-details">
            <span className={`priority-badge priority-${zone.priority || "medium"}`}>
              {zone.priority === "high" ? "Alta" : zone.priority === "low" ? "Baixa" : "Média"}
            </span>
            {zone.triggersAlert && <span className="alert-badge">Alertas Ativos</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
