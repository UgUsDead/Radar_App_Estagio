import React from "react";

interface Props {
  selectedZoneRadarId: string;
  setSelectedZoneRadarId: (id: string) => void;
  loadZonesForRadar: (id: string) => Promise<void>;
  knownRadarIds: string[];
  copySourceRadarId: string;
  setCopySourceRadarId: (id: string) => void;
  copyLayoutFromRadar: () => Promise<void>;
  children: React.ReactNode;
}

export function ZoneEditorSection({
  selectedZoneRadarId, setSelectedZoneRadarId,
  loadZonesForRadar, knownRadarIds,
  copySourceRadarId, setCopySourceRadarId,
  copyLayoutFromRadar,
  children
}: Props) {
  return (
    <div className="management-card zone-management-card">
      <h3>Regras de Zona (Geofencing)</h3>
      <p className="muted">
        Defina polígonos para a área da cama, casa de banho e entrada para cada radar. Estas zonas determinam a prioridade contextual dos alertas e as sobreposições na reprodução.
      </p>
      <div className="management-form-row zone-copy-row">
        <select
          value={selectedZoneRadarId}
          onChange={(event) => {
            const radarId = event.target.value;
            setSelectedZoneRadarId(radarId);
            void loadZonesForRadar(radarId);
          }}
        >
          <option value="">Radar Alvo...</option>
          {knownRadarIds.map((radarId) => (
            <option key={`zone-target-${radarId}`} value={radarId}>
              {radarId}
            </option>
          ))}
        </select>
        
        <div className="zone-copy-action">
          <select
            value={copySourceRadarId}
            onChange={(e) => setCopySourceRadarId(e.target.value)}
          >
            <option value="">Copiar de...</option>
            {knownRadarIds.filter(id => id !== selectedZoneRadarId).map((radarId) => (
              <option key={`zone-copy-${radarId}`} value={radarId}>
                {radarId}
              </option>
            ))}
          </select>
          <button onClick={() => void copyLayoutFromRadar()} disabled={!copySourceRadarId || !selectedZoneRadarId}>Copiar</button>
        </div>
      </div>

      <div className="zone-builder-grid">
        {children}
      </div>
    </div>
  );
}
